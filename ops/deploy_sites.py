#!/usr/bin/env python3
"""Publish this StoryWell checkout with the existing Codex login; no saved tokens."""
import argparse
import contextlib
import datetime as dt
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ID = 'appgprj_6aa50dc559308191a71aa3139d16e33a'
SITE_URL = 'https://storywell-webnovel-studio.homong-lee.chatgpt.site'
GITHUB_URL = 'https://github.com/homonglee/storywell.git'
ALLOWED_TOOLS = {'get_site', 'list_site_versions', 'get_deployment_status',
                 'create_source_repository_write_credential', 'save_site_version',
                 'deploy_site_version', 'deploy_private_site_version'}
SECRETS = []


def safe(value):
    text = str(value)
    for secret in SECRETS:
        if secret:
            text = text.replace(secret, '[REDACTED]')
    return re.sub(r'(?i)(authorization:\s*bearer\s+)\S+', r'\1[REDACTED]', text)


def say(message):
    print(safe(message), flush=True)


def run(args, capture=False, env=None):
    result = subprocess.run([str(x) for x in args], cwd=ROOT,
                            env=env, text=True, encoding='utf-8', errors='replace',
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if not capture or result.returncode:
        say(result.stdout.rstrip())
    if result.returncode:
        raise RuntimeError('Command failed: ' + str(args[0]))
    return result.stdout.strip()


def git(*args, env=None):
    return run(['git', *args], capture=True, env=env)


def check_project():
    manifest = json.loads((ROOT / '.openai/hosting.json').read_text(encoding='utf-8-sig'))
    if manifest.get('project_id') != PROJECT_ID:
        raise RuntimeError('Unexpected Sites project. Publication stopped.')
    if Path(git('rev-parse', '--show-toplevel')).resolve() != ROOT:
        raise RuntimeError('Run only in the StoryWell repository.')
    if git('remote', 'get-url', 'github') != GITHUB_URL:
        raise RuntimeError('Unexpected GitHub remote. Publication stopped.')
    config = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8-sig'))
    if config.get('git', {}).get('deploymentEnabled') is not False:
        raise RuntimeError('Vercel automatic deployment must remain disabled.')
    return manifest


def clean_head():
    if git('status', '--porcelain'):
        raise RuntimeError('Uncommitted changes exist. Review and commit them before deployment.')
    return git('rev-parse', '--verify', 'HEAD')


@contextlib.contextmanager
def deployment_lock():
    import msvcrt
    runtime = ROOT / '.sites-runtime'
    runtime.mkdir(exist_ok=True)
    with (runtime / 'deploy.lock').open('a+b') as handle:
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise RuntimeError('Another StoryWell deployment is running.') from error
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


class CodexSites:
    def __enter__(self):
        self.seq = 0
        self.inbox = queue.Queue()
        binary = shutil.which('codex')
        if not binary:
            raise RuntimeError('Codex CLI is missing.')
        self.process = subprocess.Popen(
            [binary, 'app-server', '--stdio'], cwd=ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW)
        threading.Thread(target=self._read, daemon=True).start()
        try:
            self.call('initialize', {
                'clientInfo': {'name': 'storywell_deploy', 'version': '1.0.0'},
                'capabilities': {'experimentalApi': True}})
            self._send({'method': 'initialized'})
            result = self.call('thread/start', {
                'cwd': str(ROOT), 'ephemeral': True, 'sandbox': 'workspace-write',
                'approvalPolicy': 'on-request', 'approvalsReviewer': 'auto_review'})
            self.thread_id = result['thread']['id']
            return self
        except Exception:
            self.__exit__(None, None, None)
            raise

    def _read(self):
        for line in self.process.stdout:
            try:
                self.inbox.put(json.loads(line))
            except ValueError:
                pass
        self.inbox.put({'_closed': True})

    def _send(self, body):
        self.process.stdin.write(json.dumps({'jsonrpc': '2.0', **body}) + '\n')
        self.process.stdin.flush()

    def call(self, method, params, timeout=180):
        self.seq += 1
        request_id = self.seq
        self._send({'id': request_id, 'method': method, 'params': params})
        end = time.monotonic() + timeout
        while True:
            remaining = end - time.monotonic()
            if remaining <= 0:
                raise RuntimeError('Codex request timed out: ' + method)
            try:
                message = self.inbox.get(timeout=remaining)
            except queue.Empty as error:
                raise RuntimeError('Codex request timed out: ' + method) from error
            if message.get('_closed'):
                raise RuntimeError('Codex connection closed. Check codex login status.')
            if message.get('id') == request_id and 'method' not in message:
                if 'error' in message:
                    raise RuntimeError(safe(message['error'].get('message', 'Codex error')))
                return message['result']
            if 'id' in message and 'method' in message:
                # Never automatically accept an approval, login or consent request.
                self._send({'id': message['id'], 'error': {
                    'code': -32000, 'message': 'Interactive action requires the user.'}})
                raise RuntimeError('User action required by Codex: ' + message['method'])

    def tool(self, name, **arguments):
        if name not in ALLOWED_TOOLS:
            raise RuntimeError('This command only permits StoryWell deployment tools.')
        if arguments.get('project_id', PROJECT_ID) != PROJECT_ID:
            raise RuntimeError('Unexpected site project.')
        arguments['project_id'] = PROJECT_ID
        result = self.call('mcpServer/tool/call', {
            'threadId': self.thread_id, 'server': 'codex_apps',
            'tool': 'sites.' + name, 'arguments': arguments})
        if result.get('isError'):
            details = ' '.join(x.get('text', '') for x in result.get('content', [])
                               if isinstance(x, dict))
            raise RuntimeError('Sites ' + name + ': ' + safe(details))
        data = result.get('structuredContent')
        if not isinstance(data, dict):
            raise RuntimeError('Unexpected Sites response: ' + name)
        return data

    def __exit__(self, *unused):
        if getattr(self, 'process', None) is not None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)


def plugin_root():
    inventory = json.loads(run(['codex', 'plugin', 'list', '--json'], capture=True))
    for plugin in inventory.get('installed', []):
        if plugin.get('name') == 'sites' and plugin.get('enabled'):
            root = Path(plugin['source']['path'])
            if (root / 'scripts/build-site.mjs').is_file():
                return root
    raise RuntimeError('Enable the Sites plugin in Codex before deployment.')


def validate_archive(archive):
    with tarfile.open(archive, 'r:gz') as handle:
        members = handle.getmembers()
        names = {m.name.replace('\\', '/') for m in members}
        for member in members:
            parts = Path(member.name).parts
            if member.name.startswith(('/', '\\')) or '..' in parts or not (member.isdir() or member.isfile()):
                raise RuntimeError('Unsafe archive member.')
        if not {'dist/.openai/hosting.json', 'dist/server/index.js'} <= names:
            raise RuntimeError('Missing packaged runtime or manifest.')
        if not any(n.startswith('dist/client/') and n.endswith('.js') for n in names):
            raise RuntimeError('Missing packaged browser assets.')
        if any((ROOT / 'drizzle').rglob('*.sql')) and not any(
                n.startswith('dist/.openai/drizzle/') and n.endswith('.sql') for n in names):
            raise RuntimeError('Missing packaged migrations.')
        manifest = json.load(handle.extractfile('dist/.openai/hosting.json'))
        if manifest.get('project_id') != PROJECT_ID:
            raise RuntimeError('Packaged site does not match StoryWell.')


def package(root, sha):
    output = ROOT / 'outputs'
    output.mkdir(exist_ok=True)
    archive = output / ('storywell-' + sha + '.tar.gz')
    # Windows equivalent of the official package-site.sh, using its shared validator.
    with tempfile.TemporaryDirectory(prefix='package-', dir=ROOT / '.sites-runtime') as temporary:
        stage = Path(temporary) / 'dist'
        run(['node', root / 'skills/sites-hosting/scripts/prepare-site-build.cjs', ROOT, stage])
        metadata = stage / '.openai'
        metadata.mkdir(exist_ok=True)
        shutil.copy2(ROOT / '.openai/hosting.json', metadata / 'hosting.json')
        if (ROOT / 'drizzle').exists():
            shutil.copytree(ROOT / 'drizzle', metadata / 'drizzle', dirs_exist_ok=True)
        with tarfile.open(archive, 'w:gz') as handle:
            handle.add(stage, arcname='dist')
    validate_archive(archive)
    return archive


def find_version(client, sha):
    cursor = None
    while True:
        args = {'limit': 50}
        if cursor:
            args['cursor'] = cursor
        result = client.tool('list_site_versions', **args)
        for version in result['items']:
            if version['source']['commit_sha'] == sha:
                return version
        cursor = result.get('cursor')
        if not cursor:
            return None


def audience_method(site):
    policy = site.get('access_policy') or {}
    users = policy.get('allowed_users') or []
    owner_only = (site.get('current_user_role') == 'owner'
                  and site.get('access_mode') == 'custom'
                  and len(users) == 1 and users[0].get('role') == 'owner'
                  and policy.get('external_visitor_count') == 0
                  and not policy.get('allowed_groups')
                  and not policy.get('allowed_workspace_group_ids')
                  and not policy.get('allowed_tenant_group_ids')
                  and not policy.get('allowed_editors'))
    return 'deploy_private_site_version' if owner_only else 'deploy_site_version'


def wait_deployment(client, deployment):
    deadline = time.monotonic() + 360
    last = None
    while deployment['status'] not in ('succeeded', 'failed'):
        if time.monotonic() >= deadline:
            raise RuntimeError('Publication is still running. Run status; do not start a duplicate.')
        if deployment['status'] != last:
            last = deployment['status']
            say('Sites: ' + last)
        time.sleep(4)
        deployment = client.tool('get_deployment_status', deployment_id=deployment['id'])
    if deployment['status'] != 'succeeded':
        raise RuntimeError('Sites failed: ' + str(deployment.get('failure_message'))
                           + '; deployment=' + deployment['id'])
    return deployment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'verify', 'deploy'])
    args = parser.parse_args()
    check_project()
    if args.action == 'status':
        with CodexSites() as client:
            site = client.tool('get_site')
            version = find_version(client, git('rev-parse', '--verify', 'HEAD'))
            deployment = None
            if version and version.get('deployment_id'):
                deployment = client.tool('get_deployment_status', deployment_id=version['deployment_id'])
            say(json.dumps({'login_reused': True, 'url': site.get('current_live_url'),
                            'local_version': json.loads((ROOT/'release-state.json').read_text())['version'],
                            'local_commit_saved': bool(version),
                            'local_commit_deployment': deployment.get('status') if deployment else None}, ensure_ascii=False))
        return
    with deployment_lock():
        if args.action == 'deploy':
            clean_head()
        root = plugin_root()
        say('Checking source and building StoryWell...')
        run(['node', root / 'scripts/configure-execution-profile.mjs', '--execution-profile', 'portable'])
        run(['node', '--test', 'scripts/test-manuscript-reader.cjs', 'scripts/test-references.cjs', 'scripts/test-workspace-controls.cjs'])
        run(['node', 'node_modules/typescript/bin/tsc', '--noEmit'])
        run(['node', root / 'scripts/build-site.mjs'])
        if args.action == 'verify':
            say('Verification complete. Review and commit any version changes before deploy.')
            return
        sha = clean_head()
        env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='Never')
        say('Uploading verified source to GitHub...')
        git('push', 'github', 'HEAD:main', env=env)
        if git('ls-remote', 'github', 'refs/heads/main', env=env).split()[0] != sha:
            raise RuntimeError('GitHub main does not match the verified commit.')
        with CodexSites() as client:
            site = client.tool('get_site')
            if site.get('id') != PROJECT_ID or site.get('current_user_role') != 'owner':
                raise RuntimeError('The logged-in account is not the StoryWell owner.')
            credential = client.tool('create_source_repository_write_credential')
            token = credential['token']
            SECRETS.append(token)
            auth = 'http.extraHeader=Authorization: Bearer ' + token
            say('Uploading source to Sites using temporary authentication...')
            git('-c', 'credential.helper=', '-c', auth, 'push', credential['remote_url'],
                'HEAD:' + credential['branch'], env=env)
            if git('rev-parse', '--verify', 'HEAD') != sha:
                raise RuntimeError('Source changed during deployment.')
            version = find_version(client, sha)
            if not version or not version.get('archive_storage'):
                archive = package(root, sha)
                if clean_head() != sha:
                    raise RuntimeError('Source changed while packaging.')
                try:
                    version = client.tool('save_site_version', commit_sha=sha, archive=str(archive))
                except RuntimeError as error:
                    # Some App Server builds expose file paths in the tool schema but
                    # do not implement the desktop file-upload adapter on this RPC.
                    # The supported source-only flow lets Sites build this exact commit.
                    detail = str(error)
                    if not ('archive [type]' in detail and "got str" in detail
                            and "Expected type ['object']" in detail):
                        raise
                    say('Local archive upload is unavailable in this client; using the Sites remote build fallback.')
                    version = client.tool('save_site_version', commit_sha=sha)
            deployment = None
            if version.get('deployment_id'):
                existing = client.tool('get_deployment_status', deployment_id=version['deployment_id'])
                if existing['status'] not in ('succeeded', 'failed'):
                    deployment = existing
            if deployment is None:
                deployment = client.tool(audience_method(site), version_id=version['id'])
            deployment = wait_deployment(client, deployment)
            report = {'completed_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                      'product_version': json.loads((ROOT/'release-state.json').read_text())['version'],
                      'commit_sha': sha, 'project_id': PROJECT_ID, 'version_id': version['id'],
                      'sites_version_number': version['version_number'],
                      'deployment_id': deployment['id'], 'status': deployment['status'],
                      'url': deployment['url'], 'validation': 'regression suite, TypeScript, Sites build'}
            records = ROOT / 'outputs/deployments'
            records.mkdir(parents=True, exist_ok=True)
            (records / (sha + '.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
            say('Published StoryWell Ver ' + report['product_version'] + ': ' + report['url'])
            say('Deployment record: ' + str(records / (sha + '.json')))
            try:
                git('notes', '--ref=storywell-deployments', 'append', '-F', str(records / (sha + '.json')), sha)
                git('push', 'github', 'refs/notes/storywell-deployments', env=env)
                say('Deployment history saved in GitHub Git notes.')
            except RuntimeError:
                say('WARNING: Deployment succeeded; the local report exists, but Git notes sync failed.')


if __name__ == '__main__':
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8', errors='replace')
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        say('FAILED: ' + safe(error))
        sys.exit(1)
import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('deploy_sites', Path(__file__).with_name('deploy_sites.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

class DeploymentTests(unittest.TestCase):
    def test_shared_site_preserves_shared_deployment(self):
        site = {'current_user_role': 'owner', 'access_mode': 'custom', 'access_policy': {
            'allowed_users': [{'role':'owner'}], 'external_visitor_count':1}}
        self.assertEqual(deploy.audience_method(site), 'deploy_site_version')

    def test_private_requires_explicit_owner_only_evidence(self):
        site = {'current_user_role': 'owner', 'access_mode': 'custom', 'access_policy': {
            'allowed_users': [{'role':'owner'}], 'external_visitor_count':0}}
        self.assertEqual(deploy.audience_method(site), 'deploy_private_site_version')
        del site['access_policy']['external_visitor_count']
        self.assertEqual(deploy.audience_method(site), 'deploy_site_version')

    def test_tokens_are_redacted_even_in_failure_messages(self):
        deploy.SECRETS.append('unit-test-secret')
        self.assertNotIn('unit-test-secret', deploy.safe('failed unit-test-secret'))
        self.assertNotIn('another-secret', deploy.safe('Authorization: Bearer another-secret'))
        deploy.SECRETS.clear()

    def test_version_lookup_follows_opaque_cursor(self):
        class Client:
            def __init__(self): self.calls = []
            def tool(self, name, **args):
                self.calls.append(args)
                return {'items': [{'id':'exact-version','source':{'commit_sha':'wanted'}}], 'cursor':None} if args.get('cursor') else {'items':[], 'cursor':'opaque-cursor'}
        client = Client()
        self.assertEqual(deploy.find_version(client, 'wanted')['id'], 'exact-version')
        self.assertEqual(client.calls[1]['cursor'], 'opaque-cursor')

    def test_unrelated_site_tool_is_rejected_before_rpc(self):
        client = deploy.CodexSites()
        with self.assertRaises(RuntimeError): client.tool('delete_site')
        with self.assertRaises(RuntimeError): client.tool('get_site', project_id='different-site')

    def test_archive_traversal_and_symlinks_are_rejected(self):
        for filename, type_ in [('../escape', tarfile.REGTYPE), ('dist/linked',tarfile.SYMTYPE)]:
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as temporary:
                archive = Path(temporary)/'bad.tar.gz'
                with tarfile.open(archive,'w:gz') as handle:
                    item=tarfile.TarInfo(filename); item.type=type_; item.size=0
                    handle.addfile(item,io.BytesIO(b''))
                with self.assertRaises(RuntimeError): deploy.validate_archive(archive)

if __name__ == '__main__': unittest.main()

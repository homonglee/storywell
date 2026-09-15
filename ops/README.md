# StoryWell 로컬 작업 및 배포

기준 폴더: `C:\Users\tiger\Projects\StoryWell`

## 일상 작업

1. 이 폴더에서 `AGENTS.md`, `PROJECT_STATUS.md`, `WORK_LOG.md`, Git 상태를 읽는다.
2. 다른 에이전트가 편집 중이면 동일 파일을 동시에 수정하지 않는다.
3. 기능을 수정하고 `python ops/deploy_sites.py verify`를 실행한다.
4. 자동으로 갱신된 버전 파일을 포함해 검토한 파일과 작업 기록을 커밋한다.
5. `python ops/deploy_sites.py deploy`를 실행한다.
6. `succeeded` 결과와 URL을 확인한다. 세부 기록은 `outputs/deployments/`에 남는다.

상태 확인: `python ops/deploy_sites.py status`

## 인증과 게시 대상

배포 명령은 이 Windows 사용자의 기존 Codex ChatGPT 로그인으로 공식 Sites 도구를 호출한다. 새 로그인, Git Credential Manager 창, ChatGPT 비밀번호 입력을 배포마다 요구하지 않는다. 모델 호출 없이 Codex App Server의 공식 MCP 도구 호출을 사용한다.

Sites 저장소 인증은 실행할 때마다 발급받는 임시 토큰을 메모리에서만 사용한다. 토큰을 파일·Git 설정·원격 주소·기록에 저장하지 않는다. 기존 접근 범위를 유지하고 Vercel 자동 배포 차단 설정을 검사한다.

Codex 로그인이 만료되면 `codex login`으로 다시 로그인해야 한다. GitHub 인증은 기존 Windows Git 자격 증명을 재사용하며, 만료 시 인증 오류를 반환한다. 플랫폼이 사용자 동의나 승인을 요구하면 이를 자동 수락하거나 우회하지 않고 중단한다.

변경 파일이 남아 있거나 검사·빌드·GitHub push가 실패하면 Sites 게시를 진행하지 않는다. `deploy` 중 빌드가 제품 버전을 갱신하면 그 변경을 검토·커밋한 뒤 다시 실행한다. 다른 커밋을 강제 덮어쓰지 않는다.

## 새 PC 설정

Node.js, Python 3, pnpm 11.25.0, Git, Codex CLI와 Sites 플러그인이 필요하다. 같은 계정으로 Codex와 GitHub에 한 번 로그인한 뒤 `pnpm install --frozen-lockfile`을 실행한다. 설치된 Sites 플러그인 위치는 자동으로 찾는다.

Git 원격 이름: `github` = GitHub 소스 저장소, `origin` = Sites 전용 저장소. 일반 `git push origin` 대신 위 배포 명령을 사용한다.

## 검증 범위

배포마다 기존 회귀 검사 전체, TypeScript 검사, Sites 빌드를 실행한다. 팝업의 실제 터치 조작과 휴대폰 스피커 출력은 별도 기기 검증이다.

공식 근거: https://learn.chatgpt.com/docs/auth 및 https://learn.chatgpt.com/docs/non-interactive-mode . RPC 입력 형식은 현재 설치된 `codex app-server generate-json-schema --experimental` 출력으로 확인했다.

## 파일 전송 호환성

현재 Codex App Server 직접 호출은 파일 경로를 업로드 객체로 변환하지 않는 경우가 있다. 이 정확한 형식 오류가 발생하면 공식 source-only 저장 방식으로 전환하고 Sites 서버가 업로드된 동일 커밋을 빌드하도록 한다. 로컬 검사·빌드는 먼저 완료하며, 다른 권한·인증·검사 오류에는 이 대체 경로를 적용하지 않는다.

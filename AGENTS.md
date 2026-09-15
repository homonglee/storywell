# StoryWell 작업 지침

- **기준 작업 폴더는 `C:\Users\tiger\Projects\StoryWell`이다.** Codex와 헤르메스 모두 이 폴더를 사용한다. Google Drive의 이전 폴더는 과거 이력 보관용이다.
- 작업 시작 시 `PROJECT_STATUS.md`, `WORK_LOG.md`, `git status -sb`, `git log -5 --oneline`을 읽는다. 동시에 다른 에이전트가 수정 중인 파일을 덮어쓰지 않는다.
- 현재 Sites 서비스의 최신 소스를 기준으로 수정하고 Sites의 기존 주소와 접근 범위, D1·R2 데이터를 유지한다.
- 모든 앱 변경의 릴리스 순서는 반드시 `작업 및 검증 → 로컬 커밋 → GitHub push → ChatGPT Sites 배포`로 한다. GitHub push 성공 전 Sites에 배포하지 않는다.
- Vercel 배포는 사용하지 않는다. GitHub는 소스 기준점이며 게시 대상은 기존 ChatGPT Sites 주소다. `vercel.json`의 `git.deploymentEnabled=false`를 유지한다.
- 검증은 `powershell -NoProfile -File ops/storywell.ps1 verify`, 배포는 `powershell -NoProfile -File ops/storywell.ps1 deploy`를 사용한다. 기존 Codex 로그인과 임시 Sites 인증을 재사용한다. 원격 origin에 일반 Git 인증창으로 로그인하려고 하지 않는다.
- 기능 추가나 오류 수정 후 배포 전 반드시 프로젝트 build를 실행한다. build가 코드 지문을 비교해 `lib/app-version.ts`의 제품 버전을 자동으로 올린다.
- 같은 코드 재빌드와 문서·운영 도구만 바뀐 경우 제품 버전을 올리지 않는다. 자동 갱신된 `lib/app-version.ts`, `release-state.json`은 기능 코드와 함께 커밋한다.
- 작업 완료 시 변경 이유와 검증 결과를 `WORK_LOG.md`에 기록하고 커밋한다. 배포 명령은 결과를 `outputs/deployments/`와 `storywell-deployments` Git notes에 남긴다.
- 비밀번호·토큰·API 키를 소스, Git 설정, 작업 기록에 저장하지 않는다. 로그인 만료나 플랫폼의 실제 승인 요청은 우회하지 말고 필요한 조치를 알린다.
- Sites 게시 번호와 제품 버전은 별개다. 헤더와 브라우저 제목은 공통 `APP_NAME`을 사용한다.

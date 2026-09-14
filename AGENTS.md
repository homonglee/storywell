# StoryWell 작업 지침

- 현재 Sites 서비스의 최신 소스를 기준으로 수정하고 Sites의 기존 주소와 접근 범위를 유지한다.
- 모든 앱 변경의 릴리스 순서는 반드시 `작업 및 검증 → GitHub push → ChatGPT Sites 배포`로 한다. GitHub push가 성공하기 전에는 ChatGPT Sites에 배포하지 않는다.
- Vercel 배포는 사용하지 않는다. GitHub는 소스 기준점으로만 사용하고, 실제 공개 배포 대상은 기존 ChatGPT Sites 주소로 유지한다.
- 기능 추가나 오류 수정 후 배포 전에 반드시 프로젝트 build를 실행한다. build가 코드 지문을 비교해 lib/app-version.ts의 제품 버전을 자동으로 올린다.
- 같은 코드의 재빌드는 버전을 유지한다. 문서만 바뀐 경우 버전을 올리지 않는다.
- 자동으로 바뀐 lib/app-version.ts와 release-state.json을 기능 코드와 함께 커밋한다. 그 커밋의 빌드 결과를 Sites에 게시한다.
- Sites 게시 번호는 제품 버전과 별개다. 헤더와 브라우저 제목은 공통 APP_NAME을 사용한다.

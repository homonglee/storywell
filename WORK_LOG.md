# StoryWell 작업 기록

## 2026-09-15 — Ver 2.13 확인·게시 및 로컬 작업 환경

- 헤르메스 인계와 커밋 `ecbe258`을 확인했다. GitHub까지 업로드됐지만 Sites Git 인증에서 멈춘 상태였다.
- 기능 변경은 원고 듣기 상단 버튼·팝업, 모바일 배치, 매뉴얼, 자동 버전 파일이다. 저장 API·DB 스키마 변경은 없다.
- 기존 자동 검사 59개, TypeScript, Sites 빌드 통과. 제품 버전은 2.13 유지.
- Sites 게시 번호 18, 배포 `appgdep_6aa897e1e8588191958ead2f9a21e528` 성공. 기존 공유 범위 유지.
- 사용자 요청에 따라 기준 저장소를 `C:\Users\tiger\Projects\StoryWell`로 이전했다.
- 원고 듣기 기능 코드는 그대로 보존하고, 배포 도구·작업 지침·기록 체계를 추가했다.
- `python ops/deploy_sites.py`의 status/verify/deploy 명령은 현재 Codex 로그인을 사용한다. 상태 조회 실검증 성공, 운영 도구 검사 6개 통과.
- 배포마다 임시 Sites 토큰을 메모리에서만 사용한다. 성공 기록은 로컬 JSON과 Git notes로 보관하여 HEAD를 바꾸지 않고 같은 커밋에 연결한다.
- Windows에서는 기존 Linux 전용 설치·패키징 래퍼가 실패했다. 고정 pnpm 설치와 공식 build staging 도구를 사용한 Windows 패키징으로 처리했다.
- 실제 휴대폰 음성 출력은 이번 PC 검증 범위에 포함하지 않았다. 최종 자동 배포 실행 결과는 `git notes --ref=storywell-deployments show HEAD`로 확인한다.

- 이 PC의 PowerShell 스크립트 실행 정책을 유지하기 위해 Python 명령을 직접 사용한다. 전역 실행 정책은 변경하지 않았다.

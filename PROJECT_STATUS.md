# PROJECT STATUS

## 완료사항

- 기준 프로젝트: `C:\Users\tiger\Projects\StoryWell`, 브랜치 `main`.
- 제품 버전: **StoryWell Ver 2.15**.
- 집필 진행률 퍼센트 바로 뒤에 모든 회차 원고의 공백 포함 총 글자 수를 표시한다. 기존 1화 원고 형식도 중복 없이 합산한다.
- 자동 검사 60개, TypeScript 검사, Sites 빌드, 390×844 모바일 렌더링을 통과했다. 모바일에서 `집필 진행률 1% 총 329자`가 겹침·잘림 없이 표시됐다.
- 헤르메스 기능 커밋: `ecbe2586728f81a1389bac63d19bb0be936ddcb3` — 상단 고정 원고 듣기 버튼 및 접근 가능한 팝업.
- 회차별 듣기 위치, 선택 위치부터 듣기, 음성·속도·톤 제어를 유지했다.
- 2026-09-15 Codex 재검증: 원고 듣기 11개를 포함한 자동 검사 59개, TypeScript 검사, Sites 빌드 통과.
- 기존 Sites 주소에 Ver 2.13 게시 완료: Sites 게시 번호 18, 배포 `appgdep_6aa897e1e8588191958ead2f9a21e528`, 상태 `succeeded`.
- GitHub와 Sites에 같은 기능 소스를 업로드했다.
- 작업 폴더를 Google Drive 밖의 로컬 C 드라이브로 이전했다.
- 헤르메스 배포용 `python ops/deploy_sites.py` 명령을 추가했다. 상태 조회는 기존 Codex 로그인 재사용으로 실제 성공했다.

## 미완료사항

- 실제 휴대폰 스피커 출력 검증은 기기에서 확인해야 한다. 헤르메스 인계 기록에는 1280×900, 390×844 팝업·스크롤·Escape 검증 통과가 남아 있다.
- 배포별 최신 결과는 `outputs/deployments/` 및 Git notes `storywell-deployments`를 확인한다.
- Ver 2.15 소스 커밋 `b2feb2d`는 GitHub `main`에 push했다. Sites 게시는 아직 하지 않았다. 현재 헤르메스 셸에서 Codex CLI를 찾지 못해 `python ops/deploy_sites.py verify`가 `[WinError 2]`로 중단됐다.

## 주요 결정사항

- Codex와 헤르메스는 이 C 드라이브 저장소를 공통 사용한다.
- `작업·검증 → 로컬 커밋 → GitHub push → Sites 게시 → 결과 기록` 순서를 유지한다.
- Sites 게시 인증은 기존 Codex ChatGPT 로그인으로 임시 자격 증명을 발급받는다. 매번 Git 인증창에 로그인하지 않는다.
- 로그인 만료나 플랫폼 승인 요청은 자동 우회하지 않는다.
- Vercel을 사용하지 않고 기존 URL·접근 범위·데이터·OpenAI 연결을 유지한다.

## 다음 작업

1. Codex CLI가 보이는 환경에서 `python ops/deploy_sites.py verify`를 다시 실행한다.
2. `python ops/deploy_sites.py deploy`로 Ver 2.15를 게시하고 성공 결과를 확인한다.

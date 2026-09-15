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

- 직접 MCP 호출의 파일 업로드 변환 누락을 확인했다. 정확한 archive 타입 불일치에 한해 Sites의 공식 원격 빌드 방식으로 전환한다. 그 외 오류는 중단한다.

## 2026-09-15 — Ver 2.15 전체 원고 글자 수 표시

- 집필 진행률 퍼센트 다음에 모든 회차 원고의 공백 포함 총 글자 수를 천 단위 구분 기호와 함께 표시했다.
- 회차별 `episodeDrafts`를 합산하고, 기존 형식의 1화 `manuscript`가 별도로 남은 경우 중복 없이 포함한다.
- TDD로 신규 합산 검사를 실패→통과시켰고 전체 자동 검사 60개, TypeScript, `git diff --check`, Sites 빌드를 통과했다.
- 390×844 헤드리스 Chrome에서 `집필 진행률 1% 총 329자`가 한 줄에 겹침·잘림 없이 표시되는 것을 확인했다.
- 기능 소스 커밋 `b2feb2d`를 GitHub `main`에 push했다.
- `python ops/deploy_sites.py verify`는 현재 헤르메스 셸에서 Codex CLI를 찾지 못해 `[WinError 2]`로 중단됐다. Sites 게시는 보류한다.

## 2026-09-15 — Codex 최종 배포 인수 검증

- C 드라이브 기준 저장소에서 헤르메스의 `b2feb2d` 작업을 인수하고 전체 원고 글자 수 계산과 기존 듣기 기능 보존을 확인했다.
- `python ops/deploy_sites.py verify` 재실행으로 자동 검사 60개, TypeScript, Sites 빌드를 통과했다. 운영 도구 검사 6개도 통과했다.
- 첫 빌드의 Windows dist 접근 오류는 추적되지 않은 기존 산출물을 `.sites-runtime/dist-before-final-215`에 보존한 뒤 해결했다.
- 제품 버전 2.15와 코드 지문이 일치해 재빌드로 버전이 추가 상승하지 않았다. 배포 기록의 오래된 고정 검사 개수는 전체 회귀 검사 표기로 수정했다.
- GitHub 반영 후 기존 Sites 주소와 공유 범위로 게시한다. 최종 성공 여부와 게시 번호는 해당 배포 커밋의 `storywell-deployments` Git notes 및 `outputs/deployments/`에 기록한다.

### 최종 게시 결과

- `python ops/deploy_sites.py deploy` 성공. 제품 Ver 2.15, Sites 게시 번호 20, 배포 `appgdep_6aa91647be08819181a9ef5a56fe0ed1`, 상태 `succeeded`.
- 게시 소스는 `a335f42ab6c464cad4fc245e368f8905c34b5e82`이며 GitHub와 Sites에 모두 먼저 반영했다.
- 검증한 로컬 빌드 파일을 네이티브 Sites 업로드로 게시 번호 20에 저장한 뒤 지정 배포 명령이 그 파일을 재사용했다.
- 기존 주소, 사용자 접근 범위, 저장 데이터와 런타임 연결을 유지했다. Vercel 배포는 실행하지 않았다.
- 성공 기록 JSON을 `outputs/deployments/`에 저장하고 동일 배포 커밋의 Git notes를 GitHub에 동기화했다. 이 완료 기록 갱신은 문서만 변경하므로 제품 버전 상승과 재배포는 필요 없다.

## 2026-09-15 — Ver 2.16 집필 화면 맨 위로 이동

- 모든 작품·회차의 집필 탭에 오른쪽 아래 고정 `맨 위로` 버튼을 추가했다. 페이지와 원고 입력창 내부 스크롤을 함께 맨 위로 이동한다.
- 높이 48px의 버튼에 읽을 수 있는 이름을 제공하고 휴대폰 안전 여백, 페이지 하단 여백, 모션 감소 설정을 반영했다. 편집 내용·선택 위치·듣기 북마크는 변경하지 않는다.
- 다른 탭에서는 버튼을 숨기며 기존 대화상자와 모바일 메뉴보다 낮은 레이어에 둔다. 사용 설명에도 동작을 추가했다.
- `python ops/deploy_sites.py verify`: 자동 검사 60개, TypeScript, Sites 빌드 통과. 로컬 기본 경로 HTTP 200 확인. 실제 휴대폰 터치 검증은 수행하지 않았다.
- 코드 지문 변경으로 제품 버전이 2.16으로 자동 상승했다. GitHub 반영 후 기존 Sites 주소에 게시하며 최종 결과는 배포 커밋의 Git notes와 `outputs/deployments/`에 기록한다.

- Ver 2.16 게시 완료: Sites 게시 번호 21, 배포 `appgdep_6aa9412d332881919feb6d98e437c532`, 상태 `succeeded`. 배포 소스 `3eb479e29dbd41e0b11521a5fddb8a5f15b73dd9`의 Git notes와 로컬 JSON에 성공 기록을 남겼다. 기존 주소·공유 범위·데이터를 유지했으며 Vercel은 사용하지 않았다.

## 2026-09-15 — Ver 2.17 팝업과 낭독 수명 분리

- 원고 듣기의 재생 상태를 팝업 컴포넌트에서 상위 집필 화면의 훅으로 옮겼다. 팝업 닫기나 StoryWell 탭 전환이 재생을 취소하지 않는다. 상단 원고 듣기 버튼에서 재생 상태를 표시하고 도구를 다시 열 수 있다.
- 작품·회차·원고 변경 또는 앱 페이지 이탈 시에는 기존 낭독을 정리한다. 늦게 도착한 이전 낭독 이벤트는 다음 구간을 시작하지 않는다.
- 안드로이드의 네이티브 pause/resume에 의존하지 않고 기억한 위치에서 재시작하도록 고쳤다. 백그라운드에서 브라우저가 음성을 중단하면 위치를 보존하고 제한을 안내한다.
- 자동 검사 64개(낭독 15개), TypeScript, Sites 빌드 통과. React 점검에서 효과 정리, 상태 소유권, 키·문서 변경과 늦은 이벤트 무효화를 확인했다. 제품 버전 2.17로 자동 갱신됐다.
- 중요한 범위: 이 변경은 무료 브라우저 음성으로 앱 안에서 듣기를 유지하는 개선이다. 휴대폰 앱 전환·화면 잠금 중 음성 재생을 보장하지 않는다. 기기 종류와 별도 API 비용이 있는 음성 파일 방식 허용 여부를 사용자에게 질문했으며 아직 답변이 없다. 유료 TTS API는 연결하거나 호출하지 않았다.
- 근거: Chromium Android의 CanSpeakNow는 기본적으로 보이는 Activity를 요구하고 음성 엔진은 그 상태가 바뀌면 중단한다. https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_environment_android_impl.cc 및 https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_android.cc . 미디어 파일의 잠금 화면 제어는 https://developer.chrome.com/blog/media-session 참고.

- 무료 브라우저 음성 개선 Ver 2.17 게시 완료: Sites 게시 번호 22, 배포 `appgdep_6aa944f76ff88191983843e10a6a0f20`, 상태 `succeeded`. 소스 `6b9046916a547ee253944c80259835648c418af2`의 Git notes와 로컬 JSON 기록을 GitHub에 동기화했다. 화면 잠금 중 재생은 비용·기기 답변을 기다리는 미완료 작업으로 남긴다.

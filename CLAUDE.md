# CLAUDE.md — hkt-adventure-online

엔진(`dkwkekzz/hkt-adventure-proto` 의 `web/`)을 프로세스로 띄워 사람에게 여는 서비스다. 설계는 `design/`, 구현은 `src/`, 작업 계획은 `plan/`.
엔진이 밖에 내놓은 면의 사실(CLI · 머리글 · Console · Link · Store · 자격)은 엔진의 `web/ONLINE.md` §1 이 전부다 — `npm run engine` 뒤 `engine/web/ONLINE.md` 에 있다.

```text
design/       설계. 목표 · 모듈 셋 · 연결 넷 · 앱(README.md), 쓰는 방식(method.md), 흐름 일곱(01-flows/), 책임 셋(02-roles/), 피드백(00-feedback/)
plan/         design 을 src 에 세우는 순서와 상태. 다음 단계는 진행표의 첫 ☐ · ◐
notes/        사람이 읽는 설명서 — 이미 선 것을 쓰는 법(auth-token.md — 키 · 토큰의 설정 · 발급 · 주입). 설계가 아니다. 설계 · 코드가 바뀌면 같은 커밋에서 고친다
src/
  protocol/   소켓 선언 — api(로그인 · 입장) · engine(엔진의 면을 베낀 것) · vault(Vault · Ledger) · operator. 타입 · 데이터뿐, 아무것도 import 하지 않는다
  account/    계정 (design/02-roles/account.md) — Directory · Signer · Identity · Account · Token
  storage/    저장장치 (design/02-roles/storage.md) — Vault · Ledger. 밖에 내보내는 것은 openVault 하나
  fleet/      함대 (design/02-roles/fleet.md) — Fleet · Shard · Assignment · Ports · Spawner · Process · Probe · Clock · Operator
  apps/main/  서비스 프로세스 — Service(흐름 1 · 7) · Api(http — GET / 게스트 페이지 · /health · POST /login · /enter) · Static(뷰어의 /play · /viewer.js · /assets · /keymap.json) · stdin 의 Operator · 설정
  tools/      boundary(경계 검사) · index(설계 색인) · shot(화면 확인, 검사 밖)
engine.lock   엔진의 저장소와 핀한 커밋. scripts/engine.sh 가 engine/ 에 세운다(git 밖)
service.config.json   서비스의 값 — 엔진 자리 · 데이터셋 · keymap · 뷰어 묶음의 자리 · NPC 묶음 · 포트 범위 · 한계 · 주기. 게임 명사는 여기에만
```

## 지키는 것

- **설계는 `design/method.md` 의 방식으로만 쓴다.** 흐름에 없는 호출, 책임에 없는 데이터는 구현에 없다. 구현에 필요한 것이 설계에 없으면 코드보다 먼저 설계를 고친다. 개념 하나 = 파일 하나, 이름은 책임 문서 그대로. 테스트는 그 모듈의 `tests/` 에, 이름은 흐름의 `개념.기능`.
- **결합은 프로세스 경계다.** 엔진의 코드를 import 하지 않는다. 엔진에 닿는 길은 `fleet/spawner.ts` 하나, 엔진의 면은 `protocol/engine.ts` 하나에 베낀다. 엔진을 올리면(`engine.lock`) `ONLINE.md` §1 을 다시 읽고 `protocol/engine.ts` 를 같은 커밋에서 고친다.
- **게임 상태의 진실은 엔진의 Store 다.** 서비스는 Store 디렉터리의 안을 읽지도 쓰지도 않는다 — 통째로 베끼고 되돌리기만. 명부는 Console 의 `grant` · `revoke` 로만.
- **게임 명사는 `service.config.json` 에만.** 모듈 · 앱의 코드와 책임 · 흐름 문서에 없다(규칙 N).
- **엔진에 손대는 것은 엔진이 "(밖)" 으로 비워 둔 자리뿐이다**(`ONLINE.md` §3.2). 엔진 저장소에 PR 로 들고, 들어간 커밋을 `engine.lock` 에 핀한다.
- **확인한 것만 실행 근거로 쓴다.** 실행한 검증과 예상만 한 것을 구분해 보고한다. 화면이 직관 확인이면 그 세션에서 `npm run shot` 으로 찍어 보인다.
- 문서와 코드 주석은 한국어, 파일 이름은 영어. Human 에게 하는 답변도 한국어.
- 살아 있는 문서(CLAUDE.md · README · design)에는 현재 상태만 적는다. 경위는 git 이 든다.

## 경계

`npm run boundary:check`(= `npm run check` 의 앞단)가 강제한다. 규칙은 `src/tools/boundary/rules.ts`, 줄마다 `tests/boundary.spec.ts` 에 하나.

```text
 S. protocol/** 은 아무것도 import 하지 않는다
 A. account/** 은 protocol/ 만 import 한다
 T. storage/** 은 protocol/ 만 import 한다
 F. fleet/**   은 protocol/ 만 import 한다 — 저장장치는 Vault 소켓, 토큰은 앱이 준 issue 함수
    모듈의 tests/ 는 세움에 다른 모듈의 index.ts 를 쓸 수 있다. 두 모듈을 같이 세우는 조립 테스트는 apps/*/tests/ 에
 P. apps 는 모듈의 index.ts 만 import 하고, 모듈의 객체에 부르는 것은 흐름에서 누가 가 Service · Api 인 단계뿐이다 —
    directory.resolve · signer.issue · signer.verify · fleet.start · fleet.enter · fleet.stopAll · fleet.clock.stop · fleet.operator.command
 N. 모듈 · 앱 · protocol 의 코드(테스트 밖)와 design 의 책임 · 흐름 문서에 게임 명사가 없다
 E. node:child_process 와 엔진의 진입점 · 인자 짓기(ENGINE_* · hostArgv · agentArgv · bundleArgv)는 fleet/spawner.ts 에만.
    엔진 체크아웃의 파일 자리(VIEWER_*)는 fleet/spawner.ts 와 apps/main/static.ts(뷰어의 페이지 · 실물을 준다)에만
```

## 명령

```text
npm install            의존(tsx · typescript · vitest). 런타임 의존은 없다 — node 22 의 http · crypto · child_process
npm run engine         engine.lock 의 커밋을 engine/ 에 세운다(git fetch --depth 1 + npm ci). ENGINE_REPO=로컬 클론 이면 거기서
npm run check          경계 검사 + 설계 색인 + tsc + 테스트 전부   ← 코드 손대면 이것
                       engine/ 이 있으면 진짜 엔진 위의 조립(src/apps/main/tests/engine.spec.ts)도 돈다. ENGINE_DIR 로 다른 체크아웃을
npm run index          설계 색인 — 흐름의 단계 `개념.기능` 이 책임에 있는가를 흐름마다 찍는다
HOST_AUTH_KEY=… npm start [-- config.json]
                       서비스 — 시작 때 뷰어를 한 번 묶고, http://localhost:8000/ 의 게스트 페이지 → 「들어가기」 → /play?ws=<자기 샤드>. stdin 은 Operator(help).
                       env: PORT(Api 포트) · SERVICE_PUBLIC_HOST · SERVICE_SECURE=1(https/wss 주소) · SERVICE_PAGE_URL(프록시 뒤의 페이지 주소) · SERVICE_STORAGE · SERVICE_ENGINE
npm run shot [-- --url http://localhost:8000 --out out/shot]
                       떠 있는 서비스를 헤드리스 크로미움으로 — 게스트 페이지와 샤드의 뷰어를 찍는다(playwright 가 깔린 자리에서)
```

# hkt-adventure-online — 설계

엔진(`hkt-adventure-proto/web`)을 프로세스로 띄워 사람에게 여는 서비스다.
엔진이 밖에 내놓은 면(CLI · stdout 머리글 · Console 글 · Link · Store 레이아웃 · 자격)의 사실은 엔진 저장소의 `web/ONLINE.md` §1 이 들고, 여기는 그 위에 서는 서비스의 흐름과 책임만 든다.
엔진은 `engine.lock` 의 커밋 하나로 핀한다(`scripts/engine.sh`). 그 커밋의 사실을 코드로 베낀 것은 `src/protocol/engine.ts` 하나다.

## 목표

- 사람은 이 서비스에 로그인하고 입장하면 세계(샤드)의 주소를 받아 브라우저로 바로 논다. 사람은 모두 같은 세계에 붙고, 계정마다 자기 묶음(요정 파티) 하나를 맡는다 — 엔진의 사람의 묶음(`--party`, `ONLINE.md` §1.3).
- 게임 상태의 진실은 세계 스냅샷(엔진의 Store)이다. 서비스는 그 안을 읽지도 쓰지도 않는다.
- 서비스가 소유하는 것은 넷이다. 신원(로그인 → Account.id) · 배정(세계 → 포트 · Store 자리) · 저장장치(Store 디렉터리의 내구성) · 프로세스(호스트 · NPC 에이전트의 생애).
- 게임 규칙은 서비스에 없다. 코드와 책임 문서에 게임 명사가 없다. 데이터셋 경로 · NPC body 이름은 설정 값(`service.config.json`)으로만 든다.

## 원칙

1. 결합은 프로세스 경계다. CLI 인자 · stdin/stdout 글 · WebSocket JSON · Store 디렉터리 레이아웃. 엔진 코드를 import 하지 않는다.
2. 상태를 바꾸는 것은 흐름의 단계만이다. 모듈은 자기 책임 문서의 개념만 알고, 다른 모듈은 소켓(`src/protocol/`) 하나로 만난다.
3. 엔진에 손대는 것은 엔진이 "(밖)" 으로 비워 둔 자리를 채우는 것뿐이다(`ONLINE.md` §3.2). 엔진의 흐름 · 책임 · 경계 규칙을 바꾸지 않는다.
4. 샤드 하나 = 호스트 하나 = 세계 하나 = Store 자리 하나. 사람은 모두 그 세계에 붙는다. 입장의 한계는 성능(설정의 capacity)뿐이고 그 밖의 입장 제한은 없다.

## 모듈 셋과 연결 넷

```text
┌ 서비스 ──────────────────────────────────────────────────────────┐        ┌ 엔진(밖) ───────────────┐
│  계정 account        함대 fleet ─Engine─────────────────────────┼───────►│ 호스트 프로세스 (세계)   │
│      ▲                  │  ▲                                     │        │ NPC 에이전트 프로세스    │
│      │ Ledger    Vault  │  │ Operator                            │        └────────────────────────┘
│      │                  ▼  │                                     │
│      └────────── 저장장치 storage                                 │        ┌ 클라이언트(밖) ┐
│                                                                   │◄─Api──►│ 브라우저 · 에이전트 │
└───────────────────────────────────────────────────────────────────┘        └────────────────┘
```

| 모듈 | 하는 일 | 모르는 것 | 책임 |
|---|---|---|---|
| 계정 account | 신원을 Account.id 로 바꾼다. 토큰을 서명하고 푼다 | 샤드 · 프로세스 · 게임 | [account.md](02-roles/account.md) |
| 함대 fleet | 세계(샤드 — 호스트 하나 + NPC 에이전트 하나 + Store 자리 하나)를 띄우고 지키고 내린다. 사람의 상한(capacity)을 지킨다. 운영자의 글을 받는다 | 신원의 출처. 세계 안. 와이어 글 넷의 안 | [fleet.md](02-roles/fleet.md) |
| 저장장치 storage | 세계의 Store 디렉터리를 내구성 있는 자리에 둔다. 서비스 자신의 표를 저장한다 | 파일의 안. 누가 어느 자리를 쓰는가 | [storage.md](02-roles/storage.md) |

연결은 넷이다. 선언은 전부 `src/protocol/` 에 있다.

- Api — 클라이언트 → 앱. 로그인과 입장 둘. 값만 건넌다. 게임의 글(Link)은 여기를 지나지 않는다. `protocol/api.ts`.
- Engine — 함대 → 엔진(밖). 프로세스를 띄우는 인자, stdin 의 Console 글, stdout 의 머리글과 status 글. `protocol/engine.ts`.
- Vault · Ledger — 함대 · 계정 → 저장장치. 자리 하나를 내고 베끼고 되돌린다. 표를 읽고 쓴다. `protocol/vault.ts`.
- Operator — 운영자(밖) → 함대. 글 한 줄, 답 글 한 줄. `protocol/operator.ts`.

계정과 함대 사이에는 소켓이 없다. 앱이 계정의 답(Account.id · 토큰을 내는 함수)을 함대에 값으로 넘긴다.
클라이언트와 엔진 사이의 접속 · 창 · 끊김은 엔진의 흐름 2 · 3 · 9 이고 서비스에는 단계가 없다.

## 앱 main

앱은 모듈이 아니라 프로세스(밖)의 조립이다. 흐름에서 트리거가 (밖)인 단계만 모듈에 닿는다(경계 규칙 P).

### Service
- 데이터: config(불변) · vault · directory · signer · fleet · api(http 서버) · 전부 참조.
- 기능: start 는 흐름 1. stop 은 흐름 7. 두 번 불려도 한 번.
- 생애: 프로세스가 만든다. 프로세스와 함께 사라진다.

### Api
- 데이터: server(http) · port(불변) · files(Static).
- 기능: login 은 흐름 2, enter 는 흐름 3 의 머리. `GET /` 는 게스트로 들어가는 페이지 한 장(브라우저가 login · enter 를 부르고 받은 주소로 간다). `GET /health` 는 `ok`. 그 밖의 GET 은 Static 에 묻는다.
- 생애: Service.start 가 연다. Service.stop 이 닫는다.

### Static
- 데이터: web(엔진 체크아웃의 web 자리) · viewerOut(Fleet.start 가 묶은 viewer.js) · keymap(엔진 web 상대의 Keymap 파일, 없으면 null). 전부 불변.
- 기능: serve(path) 는 엔진의 dev 가 샤드마다 주던 넷을 서비스의 한 주소에서 준다 — `/play`(엔진의 뷰어 페이지) · `/viewer.js(.map)` · `/assets/…`(엔진의 실물, `ext/…` 는 엔진 저장소 뿌리의 out/character/) · `/keymap.json`. 뿌리 밖은 없다. 파일의 안은 보지 않는다.
- 생애: Service.start 가 만든다.
- 엔진의 파일을 읽는 것은 Spawner 와 이것 둘뿐이다(경계 규칙 E). 그래서 샤드는 소켓만 연다(엔진의 host).

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Api login | 클라이언트 → 앱 | `POST /login {provider, subject?}` | `{token, subject}` 또는 `{why}` |
| Api enter | 클라이언트 → 앱 | `POST /enter {token}` | `{page, ws}` 또는 `{why}` |
| Api static | 브라우저 → 앱 | `GET /play?token=…&ws=…` · `/viewer.js` · `/assets/…` · `/keymap.json` | 파일 |

## 명세 둘

| 명세 | 폴더 | 파일 하나 | 답하는 질문 |
|---|---|---|---|
| 흐름 | `01-flows/` | 외부 입력 하나 | 외부 입력이 시간 순으로 어느 개념을 어떻게 움직이는가 |
| 책임 | `02-roles/` | 모듈 하나 | 모듈이 어떤 데이터를 들고 어떤 기능을 제공하는가 |
| 피드백 | `00-feedback/` | 파일 하나 | 아직 설계가 되지 않은 열린 것 |

| 흐름 | 트리거 | 한 줄 |
|---|---|---|
| [1 시작](01-flows/01-start.md) | 프로세스가 서비스를 띄운다 | 저장장치에서 표를 되찾고 함대를 세우고 Api · Operator 를 연다. 샤드는 띄우지 않는다 |
| [2 로그인](01-flows/02-login.md) | 클라이언트의 신원 | 신원을 Account.id 로, Account.id 를 서명된 토큰으로 |
| [3 입장](01-flows/03-enter.md) | 클라이언트의 토큰 | 토큰을 Account.id 로, 세계를 찾거나 세워 띄우고(상한이면 거절) 주소를 준다 |
| [4 호스트의 글](01-flows/04-engine-line.md) | 엔진 프로세스의 stdout 한 줄 또는 종료 | 머리글이면 ready, status 글이면 lastStatus, 종료면 state |
| [5 박자](01-flows/05-tick.md) | Clock 의 간격 | 세계에 status 를 묻고, 사람 없이 오래 쉬면 내리고, 때가 되면 베낀다 |
| [6 운영자 명령](01-flows/06-operator.md) | 운영자의 글 한 줄 | 세계를 보고 내리고 되돌리고, 호스트의 Console 로 글을 넘긴다 |
| [7 종료](01-flows/07-stop.md) | 프로세스의 종료 신호 | 세계를 내리고(저장된다) Api 를 닫고 끝난다 |

쓰는 방식은 [method.md](method.md).

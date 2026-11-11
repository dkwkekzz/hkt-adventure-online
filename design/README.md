# hkt-adventure-online — 설계

엔진(`hkt-adventure-proto/web`)을 프로세스로 띄워 사람에게 여는 서비스다.
엔진이 밖에 내놓은 면(CLI · stdout 머리글 · Console 글 · Link · Store 레이아웃 · 자격)의 사실은 엔진 저장소의 `web/ONLINE.md` §1 이 들고, 여기는 그 위에 서는 서비스의 구조 · 흐름 · 책임만 든다.
엔진은 `engine.lock` 의 커밋 하나로 핀한다(`scripts/engine.sh`). 그 커밋의 사실을 코드로 베낀 것은 `src/protocol/engine.ts` 하나다.

## 목표

- 사람은 로그인하고 캐릭터를 골라 입장하면 게이트웨이의 주소 하나를 받아 바로 논다. 어느 호스트에 배정됐는지 모르고, 존을 옮겨도 접속은 그대로다.
- 받을 수 있는 사람의 수에 구조의 천장이 없다. 사람이 늘면 프로세스와 서버를 늘린다. 프로세스 하나가 받는 수(상한)는 재서 설정에 두는 값이고 구조는 그 값에 기대지 않는다.
- 캐릭터의 진실은 서비스의 캐릭터 저장소다. 존의 진실(땅 · NPC)은 그 인스턴스의 Store 다. 서비스는 둘 다 안을 읽지 않는다 — 통째로 옮기고 백업하고 복원하기만.
- 게임 규칙은 서비스에 없다. 코드와 책임 · 흐름 문서에 게임 명사가 없다. 존 이름 · 데이터셋 경로 · NPC body 이름은 설정 값(`service.config.json`)으로만 든다.

## 원칙

1. 개념 하나는 책임 하나다. 흐름 하나는 그런 개념들의 단계 n 개로 이루어진다 — 단계 하나 = 개념 하나의 기능 하나.
2. 엔진과의 결합은 프로세스 경계다. CLI 인자 · stdin/stdout 글 · WebSocket JSON · Store 디렉터리 · 캐릭터 파일. 엔진 코드를 import 하지 않는다.
3. 클라이언트가 아는 주소는 둘이다 — API 서버(http)와 게이트웨이(WebSocket). 호스트는 내부망에만 있다.
4. 사람의 글이 지나는 길(클라이언트 ↔ 게이트웨이 ↔ 호스트)에는 모두가 지나는 프로세스가 없다. 컨트롤 플레인은 들어올 때 · 존을 옮길 때 · 떠날 때만 닿는다. 컨트롤 플레인이 잠시 없어도 붙어 있는 사람은 계속 논다.
5. 오래 남아야 하는 상태는 스토리지에만 있다. API 서버 · 게이트웨이는 상태가 없어 수를 늘리면 되고, 컨트롤 플레인의 표는 스토리지와 노드 · 게이트웨이의 보고로 다시 선다.
6. 캐릭터 하나의 값은 한때에 인스턴스 하나만 든다. 그것을 지키는 것은 스토리지의 lease 하나다.
7. 엔진에 손대는 것은 엔진이 "(밖)" 으로 비워 둔 자리를 채우는 것뿐이다(`ONLINE.md` §3.2).

## 용어

| 용어 | 뜻 |
|---|---|
| 존(zone) | 닫힌 공간 하나. 데이터셋 하나와 설정 값(상한 · 예비 용량 · NPC 묶음)이다. 엔진에게는 세계 하나다 |
| 인스턴스(instance) | 존 하나를 도는 것 하나 — 호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나. 이름은 `<존>-<번호>`. 같은 존의 다른 인스턴스에 있는 사람은 서로 보이지 않는다 |
| 캐릭터 | 계정이 든 것 하나. 엔진이 명부에 적는 이름(`host.Account.id`)이 Character.id 다. 엔진에게는 사람의 묶음 하나다 |
| 세션(session) | 캐릭터 하나가 인스턴스 하나에 배정되어 있는 것. 입장이 잡고(`pending`) 게이트웨이가 이으면(`active`) 끊긴 뒤 재접속 유예(`grace`)까지 산다. 인스턴스의 상한은 세션의 수로 센다 |
| 로드 · 언로드 | 캐릭터의 값을 인스턴스에 올리는 것과, 인스턴스에서 내려 스토리지에 저장하는 것. 값은 파일 하나(캐릭터 파일)이고 서비스는 안을 보지 않는다 |
| lease | 캐릭터의 값을 지금 누가(어느 인스턴스가) 들고 있는가. 번호가 늘기만 한다 |
| 노드(node) | 인스턴스를 띄우는 서버 하나 |
| 빌드 | 엔진의 커밋(`engine.lock`). 뷰어와 호스트는 같은 빌드끼리만 만난다 |

## 구조

모듈은 책임의 묶음이고(`src/<모듈>/`), 개념은 책임 하나다(`src/<모듈>/<개념>.ts`). 프로세스는 `src/apps/` 가 개념을 조립해 띄우는 단위다. 한 모듈의 개념이 여러 프로세스에 갈려 살 수 있다.

```text
 Client (밖) — 브라우저 · 에이전트 · 다른 클라이언트
      │ HTTPS                              │ WebSocket — 엔진의 Link 글 넷
      ▼                                    ▼
┌ API server (api) × N ───────┐    ┌ Gateway (gateway) × N ──────┐
│ account · Api · Static      │    │ gateway                     │
└──────┬──────────────────────┘    └──────┬──────────────┬───────┘
       │ SessionRpc                       │ SessionRpc   │ Link (그대로 넘긴다)
═══════╪══════════════════════════════════╪══════════════╪═════════  내부망
       ▼                                  ▼              │
┌ Control plane (control) × 1 (+ standby 1) ────┐        │
│ session · fleet(표 · 고르기) · Operator         │        │
└──────┬─────────────────────────┬──────────────┘        │
       │                         │ NodeRpc               ▼
       │                 ┌ Node agent (node) × 서버 ────────────────┐
       │                 │ fleet(프로세스 · 올리고 내리기)             │
       │                 │   인스턴스 × n                            │
       │                 │     호스트(엔진, 밖) ◄── Link             │
       │                 │     NPC 에이전트(엔진, 밖)                │
       │                 └──────┬───────────────────────────────────┘
       ▼                         ▼
┌ Storage — MongoDB(계정 · 캐릭터 · 표 · lease · 캐릭터의 값) + object storage(Store · 백업) ┐
```

### 모듈 다섯과 그 개념

개념마다의 데이터 · 기능은 책임 문서가 든다. 여기는 무엇이 어디에 사는가만.

| 모듈 | 개념 — 책임 하나 | 프로세스 | 책임 문서 |
|---|---|---|---|
| 계정 account | Directory — 신원을 계정으로 바꾼다 | api · control | [account.md](02-roles/account.md) |
| | Characters — 계정의 캐릭터를 든다 | api · control | |
| | Banlist — 차단된 계정을 든다 | api · control | |
| | Signer — 토큰을 내고 푼다 | api · gateway · control · node | |
| 게이트웨이 gateway | Acceptor — 새 소켓이 누구의 것인지 확인한다 | gateway | [gateway.md](02-roles/gateway.md) |
| | Connection — 클라이언트의 소켓과 호스트의 소켓을 잇는다 | gateway | |
| | RateLimiter — 글의 크기 · 빈도 · 접속 수를 지킨다 | gateway | |
| | Keepalive — 죽은 선을 찾는다 | gateway | |
| | GateReporter — 든 접속을 알린다 | gateway | |
| 세션 session | Admission — 지금 들어와도 되는가를 본다 | control | [session.md](02-roles/session.md) |
| | ZoneMap — 캐릭터가 설 존을 든다 | control | |
| | Placer — 슬롯이 빈 인스턴스를 고른다 | control | |
| | Sessions — 세션을 들고 슬롯을 센다 | control | |
| | Queue — 슬롯을 기다리는 줄을 든다 | control | |
| | Gates — 살아 있는 게이트웨이를 든다 | control | |
| | Mover — 캐릭터를 인스턴스 사이로 옮긴다 | control | |
| | Router — 게이트웨이에 뒤를 바꾸거나 닫으라고 알린다 | control | |
| | Reconciler — 보고와 세션을 맞춘다 | control | |
| 플릿 fleet | Registry — 인스턴스의 표를 든다 | control | [fleet.md](02-roles/fleet.md) |
| | Nodes — 노드의 표와 살아 있음을 든다 | control | |
| | Scheduler — 띄울 노드를 고른다 | control | |
| | Scaler — 예비 용량을 맞춘다 | control | |
| | Recoverer — 죽은 인스턴스의 뒤를 수습한다 | control | |
| | Runner — 인스턴스의 프로세스를 띄우고 내린다 | node | |
| | Spawner — 엔진 프로세스를 띄운다 | node · api(뷰어 묶기) | |
| | Ports — 포트를 낸다 | node | |
| | Probe — 호스트의 글 한 줄을 읽는다 | node | |
| | Console — 호스트에 글을 쓰고 답을 받는다 | node | |
| | Loader — 캐릭터의 값을 올리고 내린다 | node | |
| | Backuper — Store 를 백업해 올린다 | node | |
| | NodeReporter — 노드가 든 것을 알린다 | node | |
| | Clock — 간격마다 부른다 | gateway · control · node | |
| 스토리지 storage | Database — 표의 줄을 읽고 쓴다 | api · control | [storage.md](02-roles/storage.md) |
| | CharacterStore — 캐릭터의 값을 둔다 | node · control | |
| | Leases — 값을 지금 누가 들고 있는가를 든다 | node · control | |
| | SnapshotStore — 인스턴스의 Store 와 백업을 둔다 | node · control | |
| | LeaderLock — 활성 컨트롤 플레인이 하나임을 지킨다 | control(잡는다) · 나머지(찾는다) | |
| 앱 | Service · Api · Static · Elector · Operator · Monitor | 아래 「앱」 | |

### 프로세스 넷

| 프로세스 | 듣는 것 | 상태 | 늘리는 법 |
|---|---|---|---|
| API 서버 api | 밖의 http | 없음 | 수를 늘린다 |
| 게이트웨이 gateway | 밖의 WebSocket | 열린 소켓뿐 — 죽으면 그 사람들이 다시 들어온다 | 수를 늘린다 |
| 컨트롤 플레인 control | 내부의 SessionRpc · NodeRpc · Operator | 표 — 스토리지와 보고로 다시 선다 | 하나와 대기 하나(흐름 13). 사람의 수에 따라 늘지 않는다 |
| 노드 에이전트 node | 내부의 NodeRpc | 이 서버의 인스턴스 | 서버를 늘린다 |

- 엔진의 호스트 · NPC 에이전트는 노드가 띄우는 자식 프로세스다(밖).
- 넷을 한 프로세스에 조립한 것이 개발의 `main` 이다 — 소켓이 함수 부름이 될 뿐 흐름은 같다.
- 같은 프로세스 안의 개념은 앱이 넘긴 값(함수)으로 만나고, 다른 프로세스의 개념은 내부망의 소켓으로 만난다.

### 서버의 구성

서버의 종류는 넷이다. 프로세스를 어느 서버에 올리는가는 규모가 정하고, 구조는 같다.

```text
                      Internet
        ┌────────────────┴────────────────┐
        ▼ HTTPS                           ▼ WSS
┌ Edge 서버 × E ──────────────────────────────────┐   밖에 열린 것은 여기의 두 포트뿐
│  api 프로세스            gateway 프로세스 × 코어   │   (앞에 load balancer 를 둔다)
└───────┬─────────────────────────┬───────────────┘
        │ SessionRpc              │ SessionRpc · Link
════════╪═════════════════════════╪════════════════════  내부망
        ▼                         │
┌ Control plane 서버 × 1 (+ standby 1) ┐  │
│  control 프로세스                     │  │
└───────┬──────────────────────────────┘  │
        │ NodeRpc                         ▼ Link
┌ Node 서버 × N ──────────────────────────────────┐
│  node 프로세스 × 1                               │
│  인스턴스 × 코어 — 호스트 + NPC 에이전트           │
└───────┬─────────────────────────────────────────┘
        ▼
┌ Storage — MongoDB replica set(계정 · 캐릭터 · 표 · lease · 캐릭터의 값) + object storage(Store · 백업) ┐
```

| 규모 | 올리는 법 |
|---|---|
| 개발 | 프로세스 하나(`main`)에 넷을 조립. 스토리지의 뒤는 디렉터리 하나. 소켓은 함수 부름 |
| 서버 하나 | 프로세스 넷을 한 서버에. 인스턴스는 그 서버의 코어만큼 |
| 서버 여럿 | 서버의 종류마다 따로. 사람이 늘면 노드 서버를, 접속이 늘면 엣지 서버를 더한다 |

- Node 서버의 수는 `동시에 붙은 사람 ÷ (인스턴스의 상한 × 서버의 코어)` 에 존마다의 예비 용량을 더한 것이다. 인스턴스 하나가 코어 하나를 쓴다.
- Edge 서버의 수는 열린 소켓의 수가 정한다. 게이트웨이는 글을 풀지 않고 넘기므로 인스턴스보다 훨씬 많은 사람을 한 프로세스가 든다.
- Control plane 서버는 사람의 수에 따라 늘지 않는다. 닿는 것이 들어올 때 · 존을 옮길 때 · 떠날 때뿐이기 때문이다.
- 서버 하나가 사라질 때 유실되는 것 — Edge: 그 접속(다시 들어온다). 노드: 그 인스턴스들의 마지막으로 저장한 뒤의 진행(흐름 12). 컨트롤 플레인: 없음(그동안 새 입장 · 존 이동이 기다린다). 스토리지는 제품의 내구성에 맡긴다.

### 연결 일곱

선언은 전부 `src/protocol/` 에 있다. 값만 건넌다.

| 연결 | 방향 | 싣는 것 | 선언 |
|---|---|---|---|
| Api | 클라이언트 → API 서버 | 로그인 · 캐릭터 · 입장 | `protocol/api.ts` |
| Link | 클라이언트 ↔ 게이트웨이 ↔ 호스트 | 엔진의 글 넷. 게이트웨이는 첫 글(`Host 2`)의 자격만 읽고 바꾼다 | 엔진의 것 — `protocol/engine.ts` |
| SessionRpc | API 서버 · 게이트웨이 ↔ 컨트롤 플레인 | API 서버의 enter · forget. 게이트웨이의 attach · detach · report. 컨트롤 플레인의 reroute · kick | `protocol/session.ts` |
| NodeRpc | 컨트롤 플레인 ↔ 노드 | 컨트롤 플레인의 launch · stop · command · load · unload. 노드의 register · report · handoff · exited | `protocol/node.ts` |
| Engine | 노드 → 엔진(밖) | 프로세스의 인자, stdin 의 Console 글, stdout 의 머리글 · status · 떠남 줄, 캐릭터 파일 | `protocol/engine.ts` |
| Storage | 개념 → 스토리지 | 표의 줄 · 캐릭터의 값 · lease · Store 와 백업 · 활성의 잠금 | `protocol/storage.ts` |
| Operator | 운영자(밖) → 컨트롤 플레인 | 글 한 줄, 답 글 한 줄 | `protocol/operator.ts` |

- SessionRpc · NodeRpc 의 글마다 한계가 있다. 답이 없으면 실패로 치고 그 흐름의 「실패하면」으로 간다. 같은 글을 다시 보내도 결과가 같다.
- 컨트롤 플레인이 보내는 글과 스토리지에 쓰는 것에는 term 이 실린다(흐름 13). 더 작은 term 의 것은 버려진다.
- 서명 키(`HOST_AUTH_KEY`)는 API 서버 · 게이트웨이 · 컨트롤 플레인 · 노드가 든다. 운영자의 토큰은 다른 키(`OPERATOR_KEY`)이고 컨트롤 플레인만 든다.

### 엔진의 면

엔진의 사실은 `ONLINE.md` §1 이 주인이다. 이 구조가 기대는 면과 그 근거. 엔진의 설계에는 섰고 코드에는 아직 없는 면은 엔진의 plan 번호로 가리킨다(`ONLINE.md` §3.2 ⑤ ~ ⑨) — 서면 `engine.lock` 을 올리고 `protocol/engine.ts` 에 베낀다.

| 면 | 쓰는 곳 | 근거 |
|---|---|---|
| host 의 인자 · 머리글 · exit 0 / 2 · `HOST_AUTH_KEY` | 흐름 3 · 4 | §1.1 · §1.3 |
| Link 의 글 넷 · 닫힘 코드 | 흐름 9 | §1.2 |
| Console 의 `status` · `grant` · `stop` | 흐름 3 · 5 · 6 · 7 | §1.5 |
| 사람의 묶음이 접속한 동안만 세계에 서고 끊으면 무대 밖에 둔다 | 흐름 9 · 11 | §1.3 |
| 로드 — `--handoff <dir>` 를 든 호스트에 Console `load <account> [공간]`. `<dir>/<account>.json` 의 값으로 그 계정의 묶음을 세운다(파일이 없으면 틀에서 낳는다). 맡은 묶음이 없는 계정의 접속은 거절(4002) | 흐름 3 · 9 · 10 | 엔진의 설계(`host.md` Host.load) — 엔진 plan 268 |
| 언로드 · 스냅샷 — Console `unload <account>`(값을 파일에 쓰고 세계에서 지운다. 그 계정의 열린 선은 1001 로 닫는다) · `keep [account]`(값만 쓴다 — 계정 없이 부르면 맡은 묶음 전부를 한 번에, 같은 창 사이의 값으로) | 흐름 5 · 10 · 11 | 엔진의 설계(`host.md` Host.unload · keep) — 엔진 plan 268 |
| 이동 요청 줄 — 묶음이 다른 존으로 가는 자리에 닿으면 stdout 에 `떠남 — <account> → <to>`. to 는 컨텐츠의 글이고 서비스는 `<존>` 또는 `<존>@<공간>` 으로 읽는다 | 흐름 4 · 10 | 엔진의 설계(`world.md` RuleKind depart) — 엔진 plan 269. 어느 자리가 어느 존으로 가는가는 엔진의 피드백 192 |
| status 글의 꼬리 ` · 지연 N`(지난 창이 박자를 넘긴 ms) | 흐름 5 | 엔진의 설계(`host.md` Driver.lag) — 엔진 plan 269 |
| 뷰어가 같은 선에 다시 온 `Link 1` 의 열림을 새 열림으로 받는다 | 흐름 10 | 엔진의 설계(`viewer.md` Client.reopen) — 엔진 plan 270 |
| 뷰어가 닫힌 뒤 돌아갈 주소 — 페이지의 `?exit=<주소>` 가 있으면 닫힘 코드를 붙여 그리로 간다 | 흐름 11 · 12 | 엔진의 설계(`viewer.md` Client) — 엔진 plan 270 |
| 통째 저장과 백업 — 한 번의 저장이 통째로 되거나 안 된다. Console `backup <dir>` 이 다음 창 끝의 저장을 dir 에 베끼고 stdout 에 `backup 끝 — <dir> · now N` | 흐름 5 | 엔진의 설계(`host.md` Store.commit · backup) — 엔진 plan 267 |

## 앱

앱은 모듈이 아니라 프로세스(밖)의 조립이다. 흐름의 머리(밖에서 온 것을 받는 단계)가 여기 있다.

### Service
- 데이터: role:`api`|`gateway`|`control`|`node`|`main`(불변) · config(불변) · 그 role 의 개념들.
- 기능: start 는 흐름 1. stop 은 흐름 7. 두 번 불려도 한 번.
- 생애: 프로세스가 만든다.

### Api
- 데이터: server(http) · build(불변, 이 서버의 빌드) · pageUrl(불변, 이 빌드의 뷰어 페이지 주소).
- 기능: listen 은 http 를 연다. close 는 닫는다. login 은 흐름 2. characters · create · choose · delete 는 흐름 8. enter 는 흐름 3. `GET /` 는 들어가는 페이지 한 장.
- 생애: API 서버의 Service.start 가 만든다.

### Static
- 데이터: web(엔진 체크아웃의 web 자리) · viewerOut(묶은 viewer.js) · keymap. 불변.
- 기능: serve(path) 는 뷰어의 페이지 · 묶음 · 실물 · Keymap 을 준다. 파일의 안은 보지 않는다.
- 생애: API 서버의 Service.start 가 만든다.

### Elector
- 데이터: lock(참조 — LeaderLock) · role:`standby`|`settling`|`active`.
- 기능: elect 는 흐름 13 — 자리를 잡으면 활성으로, 못 잡으면 대기로.
- 생애: 컨트롤 플레인의 Service.start 가 만든다.

### Operator
- 데이터: verify(운영자의 토큰 → 이름) · operators:set<이름>(설정) · db(참조 — 표 `audit`).
- 기능: command(글 한 줄) → 답 글 한 줄. 흐름 6.
- 생애: 컨트롤 플레인의 Service.start 가 만든다.

### Monitor
- 데이터: role(불변) · build(불변).
- 기능: health 는 이 프로세스가 듣고 있는가. metrics 는 그 role 의 수치(흐름 14).
- 생애: Service.start 가 만든다. 프로세스마다 하나.

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Api login | 클라이언트 → API 서버 | `POST /login {provider, subject?}` | `{token, subject}` 또는 `{why}` |
| Api characters · create · choose · delete | 클라이언트 → API 서버 | `{token}` · `{token, name}` · `{token, character}` | 캐릭터들 · 캐릭터 · `{token}`(캐릭터의 토큰) 또는 `{why}` |
| Api enter | 클라이언트 → API 서버 | `POST /enter {token}`(캐릭터의 토큰) | `{page, gate}` · `{wait: 순번}` 또는 `{why}` |
| Api static | 브라우저 → API 서버 | `GET /play` · `/viewer.js` · `/assets/…` · `/keymap.json` | 파일 |

## 명세 둘

| 명세 | 폴더 | 파일 하나 | 답하는 질문 |
|---|---|---|---|
| 흐름 | `01-flows/` | 외부 입력 하나 | 그 입력을 어느 개념들이 어떤 차례로 처리하는가 |
| 책임 | `02-roles/` | 모듈 하나 | 개념마다의 책임 하나와 그 데이터 · 기능 |
| 피드백 | `00-feedback/` | 파일 하나 | 아직 설계가 되지 않은 열린 것 |

| 흐름 | 트리거 | 어느 프로세스 | 한 줄 |
|---|---|---|---|
| [1 시작](01-flows/01-start.md) | 프로세스가 뜬다 | 넷 다 | 제 role 의 개념을 세우고 듣는다 |
| [2 로그인](01-flows/02-login.md) | 클라이언트의 신원 | api | 신원을 계정으로, 계정을 토큰으로 |
| [3 입장](01-flows/03-enter.md) | 클라이언트의 캐릭터 토큰 | api → control → node | 인스턴스에 세션을 잡고 게이트웨이의 주소를 준다. 없으면 띄우거나 대기열 |
| [4 호스트의 글](01-flows/04-engine-line.md) | 엔진 프로세스의 stdout 한 줄 또는 종료 | node | 글을 읽어 인스턴스의 상태를 고친다 |
| [5 주기 작업](01-flows/05-tick.md) | Clock 의 간격 | node · gateway · control | 저장하고 알리고, 보고와 표를 맞춘다 |
| [6 운영자 명령](01-flows/06-operator.md) | 운영자의 글 한 줄 | control | 명령 하나를 그 일을 맡은 개념 하나에 넘긴다 |
| [7 종료](01-flows/07-stop.md) | 프로세스의 종료 신호 | 넷 다 | 사람을 옮기고 저장하고 내린다 |
| [8 캐릭터](01-flows/08-character.md) | 클라이언트의 계정 토큰 | api | 캐릭터를 보고 만들고 지우고 고른다 |
| [9 접속](01-flows/09-connect.md) | 클라이언트의 소켓 | gateway → control → node | 값을 인스턴스에 올리고 호스트와 잇는다 |
| [10 존 이동](01-flows/10-transfer.md) | 호스트의 떠남 줄 | node → control → node → gateway | 값을 내려 다른 인스턴스에 올리고 뒤를 바꿔 잇는다 |
| [11 접속 종료](01-flows/11-disconnect.md) | 클라이언트의 소켓이 닫힌다 | gateway → control → node | 유예가 지나면 값을 내려 저장한다 |
| [12 장애 복구](01-flows/12-failover.md) | 인스턴스가 죽었다 | control | lease 를 끊고 사람을 다시 배정하고 다시 띄운다 |
| [13 컨트롤 플레인 전환](01-flows/13-leader.md) | 컨트롤 플레인의 Clock | control | 활성 하나가 일하고, 바뀌면 표를 다시 세운다 |
| [14 관측](01-flows/14-observe.md) | 수집기의 http 요청 | 넷 다 | 듣고 있는가와 수치를 답한다 |

쓰는 방식은 [method.md](method.md).

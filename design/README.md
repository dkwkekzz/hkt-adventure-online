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

1. 엔진과의 결합은 프로세스 경계다. CLI 인자 · stdin/stdout 글 · WebSocket JSON · Store 디렉터리 · 캐릭터 파일. 엔진 코드를 import 하지 않는다.
2. 클라이언트가 아는 주소는 둘이다 — API 서버(http)과 게이트웨이(WebSocket). 호스트는 내부망에만 있다.
3. 사람의 글이 지나는 길(클라이언트 ↔ 게이트웨이 ↔ 호스트)에는 모두가 지나는 프로세스가 없다. 컨트롤 플레인은 들어올 때 · 존을 옮길 때 · 떠날 때만 닿는다. 컨트롤 플레인이 잠시 없어도 붙어 있는 사람은 계속 논다.
4. 상태는 스토리지에만 있다. API 서버 · 게이트웨이는 상태가 없어 수를 늘리면 되고, 컨트롤 플레인의 표는 스토리지와 노드 · 게이트웨이의 보고로 다시 선다.
5. 캐릭터 하나는 한때에 호스트 하나만 든다. 그것을 지키는 것은 스토리지의 lease(Lease) 하나다.
6. 상태를 바꾸는 것은 흐름의 단계만이다. 모듈은 자기 책임 문서의 개념만 알고, 다른 모듈은 소켓(`src/protocol/`) 하나로 만난다.
7. 엔진에 손대는 것은 엔진이 "(밖)" 으로 비워 둔 자리를 채우는 것뿐이다(`ONLINE.md` §3.2).

## 용어

| 용어 | 뜻 |
|---|---|
| 존(zone) | 닫힌 공간 하나. 데이터셋 하나와 설정 값(상한 · 예비 용량 · NPC 묶음)이다. 엔진에게는 세계 하나다 |
| 인스턴스(instance) | 존 하나를 도는 것 하나 — 호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나. 이름은 `<존>-<번호>`. 같은 존의 다른 인스턴스에 있는 사람은 서로 보이지 않는다 |
| 캐릭터 | 계정이 든 것 하나. 엔진이 명부에 적는 이름(`host.Account.id`)이 Character.id 다. 엔진에게는 사람의 묶음 하나다 |
| 로드 · 언로드(load · unload) | 캐릭터의 값을 인스턴스에 올리는 것(load)과 인스턴스에서 내려 스토리지에 저장하는 것(unload). 값은 파일 하나(캐릭터 파일)이고 서비스는 안을 보지 않는다. 두 인스턴스 사이로 잇는 것이 핸드오프(handoff)다 |
| 세션(session) | 캐릭터 하나가 인스턴스 하나에 배정되어 있는 것. 입장이 잡고(`pending`) 게이트웨이가 이으면(`active`) 끊긴 뒤 재접속 유예(`grace`)까지 산다. 인스턴스의 상한은 세션의 수로 센다 |
| lease | 캐릭터의 값을 지금 누가(어느 인스턴스가) 들고 있는가. 번호가 늘기만 한다 |
| 노드(node) | 인스턴스를 띄우는 서버 하나 |

## 구조

모듈(책임)과 프로세스(띄우는 단위)는 다르다. 모듈은 `src/<모듈>/` 의 코드이고, 프로세스는 `src/apps/` 가 모듈을 조립한 것이다. 모듈 하나가 여러 프로세스에 들고, 프로세스 하나가 여러 모듈을 든다.

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
│ session · fleet(Fleet) · Operator             │        │
└──────┬─────────────────────────┬──────────────┘        │
       │                         │ NodeRpc               ▼
       │                 ┌ Node agent (node) × 서버 ────────────────┐
       │                 │ fleet(NodeAgent)                         │
       │                 │   인스턴스 × n                            │
       │                 │     호스트(엔진, 밖) ◄── Link             │
       │                 │     NPC 에이전트(엔진, 밖)                │
       │                 └──────┬───────────────────────────────────┘
       │ Database                │ SnapshotStore
       │ CharacterStore          │ CharacterStore
       ▼                         ▼
┌ Storage (밖의 제품) — DB(표 · lease) + object storage(캐릭터의 값 · Store · 백업) ┐
```

### 모듈 다섯

| 모듈 | 하는 일 | 모르는 것 | 책임 |
|---|---|---|---|
| 계정 account | 신원을 계정과 캐릭터로 바꾼다. 토큰을 서명하고 푼다. 차단된 계정을 든다 | 존 · 인스턴스 · 프로세스 | [account.md](02-roles/account.md) |
| 게이트웨이 gateway | 클라이언트의 소켓을 들고, 그 캐릭터가 배정된 호스트와 글을 그대로 넘긴다. 크기 · 빈도를 지킨다 | 글의 안. 어느 호스트로 갈지 정하는 법 | [gateway.md](02-roles/gateway.md) |
| 세션 session | 캐릭터를 어느 존의 어느 인스턴스에 배정할지 정하고 기억한다. 세션 · 접속 표 · 대기열 | 프로세스를 띄우는 법. 캐릭터의 값 | [session.md](02-roles/session.md) |
| 플릿 fleet | 인스턴스를 노드에 띄우고 지키고 내린다. 캐릭터의 값을 인스턴스에 로드 · 언로드한다 | 누가 누구인가. 세계 안 | [fleet.md](02-roles/fleet.md) |
| 스토리지 storage | 서비스의 표 · 캐릭터의 값과 lease · 인스턴스의 Store 를 프로세스보다 오래 사는 자리에 둔다 | 값의 안. 누가 어느 자리를 쓰는가 | [storage.md](02-roles/storage.md) |

### 프로세스 넷

| 프로세스 | 든 모듈 | 듣는 것 | 상태 | 늘리는 법 |
|---|---|---|---|---|
| API 서버 api | 계정 · 스토리지(Database) · 플릿(Spawner 의 bundle) + Api · Static | 밖의 http | 없음 | 수를 늘린다 |
| 게이트웨이 gateway | 게이트웨이 · 계정(Signer 의 verify) | 밖의 WebSocket | 열린 소켓뿐 — 죽으면 그 사람들이 다시 들어온다 | 수를 늘린다 |
| 컨트롤 플레인 control | 세션 모듈 · 플릿(Fleet) · 계정(Directory · Signer 의 issue) · 스토리지(Database · CharacterStore · SnapshotStore 의 백업) + Operator | 내부의 SessionRpc · NodeRpc · Operator | 표 — 스토리지와 보고로 다시 선다 | 하나와 대기 하나. 존의 묶음마다 따로 둘 수 있다(세션 모듈의 표는 존마다 갈린다) |
| 노드 에이전트 node | 플릿(NodeAgent) · 스토리지(SnapshotStore · CharacterStore) | 내부의 NodeRpc | 이 서버의 인스턴스 | 기계를 늘린다 |

- 엔진의 호스트 · NPC 에이전트는 노드가 띄우는 자식 프로세스다(밖). 스토리지는 밖의 제품이고 스토리지 모듈이 그 손이다.
- 뷰어의 묶음 · 실물은 API 서버의 Static 이 준다. 앞에 캐시(CDN)를 두어도 모양은 같다.
- 넷을 한 프로세스에 조립한 것이 개발의 `main` 이다 — 소켓이 함수 부름이 될 뿐 흐름은 같다.

### 모듈이 프로세스에 드는 법

모듈의 개념마다 어느 프로세스에 사는가. 한 모듈의 개념이 여러 프로세스에 갈려 살 수 있다.

| 모듈 | 개념 | API 서버 | 게이트웨이 | 컨트롤 플레인 | 노드 |
|---|---|---|---|---|---|
| 계정 | Directory | ● | | ●(ban · list) | |
| 계정 | Signer | ●(issue · verify) | ●(verify) | ●(issue) | ●(issue — NPC) |
| 게이트웨이 | Gateway · Connection · RateLimiter | | ● | | |
| 세션 모듈 | SessionManager · Zone · Session · Presence · Queue | | | ● | |
| 플릿 | Fleet · Node · Instance · Assignment | | | ● | |
| 플릿 | NodeAgent · GameServer · Ports · Process · Probe | | | | ● |
| 플릿 | Spawner | ●(bundle) | | | ●(host · agent) |
| 스토리지 | Database | ● | | ● | |
| 스토리지 | CharacterStore | | | ●(expire) | ●(checkout · checkin) |
| 스토리지 | SnapshotStore | | | ●(copy · restore · list) | ●(pull · push · copy · prune) |
| 앱 | Api · Static | ● | | | |
| 앱 | Operator | | | ● | |

- 같은 프로세스 안의 모듈은 앱이 넘긴 값(함수)으로 만난다 — 컨트롤 플레인 안의 세션 모듈 ↔ 플릿, API 서버 안의 Api → 계정.
- 다른 프로세스의 모듈은 내부망의 소켓으로 만난다 — SessionRpc(API 서버 · 게이트웨이 ↔ 컨트롤 플레인) · NodeRpc(컨트롤 플레인 ↔ 노드). 선언은 같고 나르는 길만 다르다.
- 스토리지는 모든 프로세스가 같은 것을 본다. 프로세스끼리 값을 직접 주고받지 않고 스토리지를 사이에 두는 자리는 캐릭터의 값(CharacterStore)과 인스턴스의 Store(SnapshotStore)다.

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
┌ Storage — DB(표 · lease) + object storage(캐릭터의 값 · Store · 백업) ┐
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
| Link | 클라이언트 ↔ 게이트웨이 ↔ 호스트 | 엔진의 글 넷. 게이트웨이는 첫 글(`Host 2`)의 자격만 읽고 바꾼다. 나머지는 그대로 | 엔진의 것 — `protocol/engine.ts` |
| SessionRpc | API 서버 · 게이트웨이 ↔ 컨트롤 플레인 | API 서버의 enter. 게이트웨이의 attach · detach · heartbeat. 컨트롤 플레인의 reroute · kick | `protocol/session.ts` |
| NodeRpc | 컨트롤 플레인 ↔ 노드 | 컨트롤 플레인의 launch · stop · command · load · unload. 노드의 report · handoff · exited | `protocol/node.ts` |
| Engine | 노드 → 엔진(밖) | 프로세스의 인자, stdin 의 Console 글, stdout 의 머리글 · status · 이동 요청 줄, 캐릭터 파일 | `protocol/engine.ts` |
| SnapshotStore · Database · CharacterStore | 모듈 → 스토리지 | 자리 · 백업 · 표 · 캐릭터의 값과 lease | `protocol/storage.ts` |
| Operator | 운영자(밖) → 컨트롤 플레인 | 글 한 줄, 답 글 한 줄 | `protocol/operator.ts` |

- 세션 모듈과 플릿은 같은 프로세스(컨트롤 플레인)에 있어도 서로를 import 하지 않는다. 세션 모듈은 플릿이 내놓은 기능 넷(instances · launch · load · unload)을, 플릿은 세션 모듈이 내놓은 기능 둘(transfer · failover)을 앱이 값(함수)으로 넘긴 것으로만 부른다.
- 호스트의 `HOST_AUTH_KEY` 는 컨트롤 플레인과 노드가 든다. 게이트웨이 · API 서버는 푸는 것(verify)만 한다.

### 엔진의 면

엔진의 사실은 `ONLINE.md` §1 이 주인이다. 이 구조가 기대는 면과 그 근거.

| 면 | 쓰는 곳 | 근거 |
|---|---|---|
| host 의 인자 · 머리글 · exit 0 / 2 · `HOST_AUTH_KEY` | 흐름 3 · 4 | §1.1 · §1.3 |
| Link 의 글 넷 · 닫힘 코드 | 흐름 9 | §1.2 |
| Console 의 `status` · `grant` · `stop` · `save` | 흐름 3 · 5 · 6 | §1.5 |
| 사람의 묶음이 접속한 동안만 세계에 서고 끊으면 무대 밖에 둔다 | 흐름 9 · 11 | §1.3 |
| 로드 — Console 의 글 하나가 캐릭터 파일의 값으로 그 계정의 묶음을 세운다(파일이 없으면 틀에서 낳는다) | 흐름 9 · 10 | 엔진에 없다 — 피드백 4 |
| 언로드 · 스냅샷 — Console 의 글 하나가 그 계정의 묶음의 값을 캐릭터 파일에 쓴다. 언로드는 세계에서 지운다 | 흐름 5 · 10 · 11 | 엔진에 없다 — 피드백 4 |
| 이동 요청 줄 — 묶음이 다른 존으로 가는 자리에 닿으면 stdout 에 계정과 존 이름을 한 줄 | 흐름 4 · 10 | 엔진에 없다 — 피드백 4 |
| status 글의 틱 지연 칸 | 흐름 5 | 엔진에 없다 — 피드백 4 |
| 클라이언트가 접속 가운데 다시 온 `Link 1` 의 열림을 새 열림으로 받는다 | 흐름 10 | 엔진에 없다 — 피드백 4 |

## 앱

앱은 모듈이 아니라 프로세스(밖)의 조립이다. 흐름에서 트리거가 (밖)인 단계만 모듈에 닿는다(경계 규칙 P).

### Service
- 데이터: role:`api`|`gateway`|`control`|`node`|`main`(불변) · config(불변) · 그 role 이 든 모듈의 객체 · 듣는 서버.
- 기능: start 는 흐름 1. stop 은 흐름 7. 두 번 불려도 한 번.
- 생애: 프로세스가 만든다. 프로세스와 함께 사라진다.

### Api
- 데이터: server(http) · port(불변) · files(Static).
- 기능: login 은 흐름 2. characters · create · choose 는 흐름 8. enter 는 흐름 3 의 머리. `GET /` 는 들어가는 페이지 한 장. `GET /health` 는 이 프로세스가 듣는가. 그 밖의 GET 은 Static 에 묻는다.
- 생애: API 서버의 Service.start 가 연다. Service.stop 이 닫는다.

### Static
- 데이터: web(엔진 체크아웃의 web 자리) · viewerOut(묶은 viewer.js) · keymap(없으면 null). 전부 불변.
- 기능: serve(path) 는 뷰어의 페이지 · 묶음 · 실물 · Keymap 을 준다. 뿌리 밖은 없다. 파일의 안은 보지 않는다.
- 생애: API 서버의 Service.start 가 만든다.

### Operator
- 데이터: fleet · sessions · directory(참조).
- 기능: command(글 한 줄) → 답 글 한 줄. 흐름 6.
- 생애: 컨트롤 플레인의 Service.start 가 만든다.

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Api login | 클라이언트 → API 서버 | `POST /login {provider, subject?}` | `{token, subject}` 또는 `{why}` |
| Api characters · create · choose | 클라이언트 → API 서버 | `{token}` · `{token, name}` · `{token, character}` | 캐릭터들 · 캐릭터 · `{token}`(캐릭터의 토큰) 또는 `{why}` |
| Api enter | 클라이언트 → API 서버 | `POST /enter {token}`(캐릭터의 토큰) | `{page, gate}` · `{wait: 순번}` 또는 `{why}` |
| Api static | 브라우저 → API 서버 | `GET /play` · `/viewer.js` · `/assets/…` · `/keymap.json` | 파일 |

## 명세 둘

| 명세 | 폴더 | 파일 하나 | 답하는 질문 |
|---|---|---|---|
| 흐름 | `01-flows/` | 외부 입력 하나 | 외부 입력이 시간 순으로 어느 개념을 어떻게 움직이는가 |
| 책임 | `02-roles/` | 모듈 하나 | 모듈이 어떤 데이터를 들고 어떤 기능을 제공하는가 |
| 피드백 | `00-feedback/` | 파일 하나 | 아직 설계가 되지 않은 열린 것 |

| 흐름 | 트리거 | 어느 프로세스 | 한 줄 |
|---|---|---|---|
| [1 시작](01-flows/01-start.md) | 프로세스가 뜬다 | 넷 다 | 제 role 의 모듈을 세우고 듣는다. 노드는 컨트롤 플레인에 자기를 알린다 |
| [2 로그인](01-flows/02-login.md) | 클라이언트의 신원 | API 서버 | 신원을 계정으로, 계정을 토큰으로. 차단된 계정은 거절 |
| [3 입장](01-flows/03-enter.md) | 클라이언트의 캐릭터 토큰 | API 서버 → 컨트롤 플레인 → 노드 | 배정될 인스턴스를 찾거나 띄우고 세션을 잡아 게이트웨이의 주소를 준다. 빈 슬롯이 없으면 대기열 |
| [4 호스트의 글](01-flows/04-engine-line.md) | 엔진 프로세스의 stdout 한 줄 또는 종료 | 노드 | 머리글이면 ready, status 면 사람 수 · 지연, 이동 요청 줄이면 흐름 10, 종료면 흐름 12 |
| [5 주기 작업](01-flows/05-tick.md) | Clock 의 간격 | 노드 · 컨트롤 플레인 · 게이트웨이 | 노드는 status 를 묻고 캐릭터의 값을 스냅샷으로 저장하고 보고한다. 컨트롤 플레인은 예비 용량을 맞추고 쉬는 것을 내리고 대기열을 민다 |
| [6 운영자 명령](01-flows/06-operator.md) | 운영자의 글 한 줄 | 컨트롤 플레인 | 인스턴스를 보고 내리고 되돌리고, 존을 닫고 열고, 사람을 내보내고 막는다 |
| [7 종료](01-flows/07-stop.md) | 프로세스의 종료 신호 | 넷 다 | 노드는 캐릭터의 값을 언로드하고 인스턴스를 내린다. 나머지는 듣기를 닫는다 |
| [8 캐릭터](01-flows/08-character.md) | 클라이언트의 계정 토큰 | API 서버 | 캐릭터를 보고 만들고 골라 캐릭터의 토큰을 받는다 |
| [9 접속](01-flows/09-connect.md) | 클라이언트의 소켓 | 게이트웨이 → 컨트롤 플레인 → 노드 | 토큰과 세션을 확인하고 캐릭터의 값을 인스턴스에 로드한 뒤 호스트와 잇는다 |
| [10 존 이동](01-flows/10-transfer.md) | 호스트의 이동 요청 줄 | 노드 → 컨트롤 플레인 → 노드 → 게이트웨이 | 값을 언로드해 다른 인스턴스에 로드하고 게이트웨이가 뒤를 바꿔 잇는다 |
| [11 접속 종료](01-flows/11-disconnect.md) | 클라이언트의 소켓이 닫힌다 | 게이트웨이 → 컨트롤 플레인 → 노드 | 재접속 유예가 지나면 값을 언로드하고 세션을 지운다 |
| [12 장애 복구](01-flows/12-failover.md) | 호스트의 죽음 또는 노드 · 게이트웨이의 보고가 끊김 | 컨트롤 플레인 | lease 를 끊고 그 사람들을 다른 인스턴스에 다시 배정한다 |

쓰는 방식은 [method.md](method.md).

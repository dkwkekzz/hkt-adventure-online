# 세션 session — 책임

세션(session) 모듈이란, 캐릭터를 어느 존의 어느 인스턴스에 배정할지 정하고, 배정한 곳을 기억하는 것이다.

- 프로세스를 띄우는 법도 캐릭터의 값도 모른다.
- 인스턴스 하나에 배정하는 수는 그 존의 상한(`capacity`)을 넘지 않는다. 세는 것은 세션이다.
- 세션은 스토리지에 두지 않는다. 컨트롤 플레인이 바뀌면 노드와 게이트웨이의 보고로 다시 선다(Reconciler).

| 개념 | 책임 하나 |
|---|---|
| Admission | 그 캐릭터가 지금 들어와도 되는가를 본다 |
| ZoneMap | 캐릭터가 설 존을 든다 |
| Placer | 그 존에서 슬롯이 빈 인스턴스를 고른다 |
| Sessions | 세션(캐릭터 ↔ 인스턴스)을 들고 슬롯을 센다 |
| Queue | 슬롯을 기다리는 줄을 든다 |
| Gates | 살아 있는 게이트웨이를 든다 |
| Mover | 캐릭터 하나를 한 인스턴스에서 다른 인스턴스로 옮긴다 |
| Router | 게이트웨이에 접속의 뒤를 바꾸거나 닫으라고 알린다 |
| Reconciler | 노드 · 게이트웨이의 보고와 세션을 맞춘다 |

## 개념

### Admission
- 데이터: owner(캐릭터 → 계정) · banned(계정 → bool) — 계정의 기능 둘, 앱이 준다. sessions(참조).
- 기능: check(character) 는 캐릭터의 줄이 없거나 그 계정이 차단됐으면 거절한다. 그 계정의 다른 캐릭터가 세션을 들고 있으면 그것을 내보내게 한다(한 계정은 한때에 캐릭터 하나 — 나중 입장이 이긴다).
- 생애: Service.start 가 만든다.

### ZoneMap
- 데이터: zones:map<이름, Zone> · db(참조 — 표 `lastZone`: Character.id → 존 이름, 표 `zones`: 존 이름 → closed) · entry(불변, 처음 서는 존).
- 기능: zoneOf(character) 는 마지막에 있던 존(없으면 entry). 닫혀 있으면 거절. remember(character, zone) 은 마지막 존을 적는다. forget(character) 는 그 줄을 지운다. close(zone) · open(zone) 은 그 존의 입장을 막고 푼다.
- 생애: Service.start 가 만든다.

### Zone
- 데이터: name · dataset · capacity:int(인스턴스 하나의 상한 — 잰 값) · spare:int(미리 비워 두는 슬롯의 수). 불변. closed:bool.
- 기능: 없음. 설정의 줄 하나.

### Placer
- 데이터: sessions(참조) · ready(존 → 인스턴스들, 플릿의 기능 — 앱이 준다).
- 기능: pick(zone, build) 는 그 존의 ready 인 인스턴스 가운데 빌드가 같고 잡힌 슬롯이 상한보다 작은 것 — 여럿이면 가장 찬 것(사람이 모이게). 없으면 null.
- 생애: Service.start 가 만든다.

### Sessions
- 데이터: rows:map<Character.id, Session>.
- 기능: get(character). hold(character, instance, build) 는 세션을 `pending` 으로 잡는다(만료 `pendingMs`). activate(character, gate) 는 `active` 로. suspend(character) 는 `grace` 로(만료 `graceMs`). reserve(character, to) 는 옮겨 갈 인스턴스에 슬롯을 잡아 둔다. move(character) 는 세션의 인스턴스를 잡아 둔 곳으로 바꾼다. drop(character) 는 지운다. of(instance) 는 그 인스턴스의 세션들. count(instance) 는 그 인스턴스에 잡힌 슬롯의 수(잡아 둔 것 포함). expired() 는 만료된 세션들.
- 생애: Service.start 가 만든다. 스토리지에 두지 않는다.

### Session
- 데이터: character · account · build · instance · to:인스턴스|null · gate · state:`pending`(값이 아직 로드되지 않았다)|`active`|`grace`(끊겼다 — 값은 인스턴스에 있다) · until.
- 기능: 없음.

### Queue
- 데이터: zone(불변) · waiting:list<{Character.id, build, 마지막으로 물은 때}>.
- 기능: push(character, build) → 순번. position(character) 는 순번 — 물은 때를 고친다. next(build) 는 그 빌드의 사람을 앞에서부터 하나 꺼낸다. drop(character) 는 줄에서 뺀다(오래 묻지 않은 사람도).
- 생애: 존마다 Service.start 가 만든다.

### Gates
- 데이터: rows:map<이름, {address, seen, closing}>.
- 기능: seen(gate, address, closing) 은 보고가 온 때를 적는다. pick() 은 살아 있고 closing 이 아닌 게이트웨이 하나. dead() 는 보고가 한계(`gateLimitMs`)를 넘겨 끊긴 것들.
- 생애: Service.start 가 만든다.

### Mover
- 데이터: sessions(참조) · load · unload(플릿의 기능 둘 — 앱이 준다) · busy:set<Character.id>.
- 기능: move(character, zone, spot) 는 흐름 10 을 차례로 한다. 한 캐릭터의 이동은 한 번에 하나다 — 하는 동안 온 다른 일은 끝난 뒤에 한다.
- 생애: Service.start 가 만든다.

### Router
- 데이터: gates(참조) · rpc(참조, SessionRpc) · issue(Character.id → Token, 앱이 준다).
- 기능: reroute(character, instance) 는 그 캐릭터의 게이트웨이에 새 호스트의 주소와 새 토큰을 보낸다. kick(character, code) 는 그 접속을 그 코드로 닫게 한다(4000 · 4002 면 뷰어가 스스로 다시 들어오지 않는다).
- 생애: Service.start 가 만든다.

### Reconciler
- 데이터: sessions(참조) · router(참조) · unload(플릿의 기능 — 앱이 준다).
- 기능: match(보고) 는 보고와 세션이 어긋난 것을 고친다. 노드의 보고 — 로드돼 있는데 세션이 없는 캐릭터는 언로드시키고, 세션이 있는데 로드돼 있지 않으면 세션을 지우고 접속을 닫게 한다. 게이트웨이의 보고 — 접속이 있는데 세션이 `grace` 면 `active` 로, `active` 인데 접속이 없으면 `grace` 로, 세션이 없는 접속은 닫게 한다. 지우는 것은 두 번 잇달아 어긋날 때만 한다(방금 한 일과 엇갈린 보고에 속지 않게). 세션이 하나도 없으면(컨트롤 플레인이 막 바뀌었다) 보고에서 세션을 다시 세운다.
- 생애: Service.start 가 만든다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| SessionRpc enter | API 서버 → 컨트롤 플레인 | Character.id · 빌드 | `{page, gate}` · 순번 또는 까닭 |
| SessionRpc forget | API 서버 → 컨트롤 플레인 | Account.id · Character.id | 됨 또는 까닭 |
| SessionRpc attach · detach · report · reroute · kick | 게이트웨이 ↔ 컨트롤 플레인 | [gateway.md](gateway.md) 의 소켓 표 | |
| Database get · put · remove | 세션 모듈 → 스토리지 | 표 `lastZone` · `zones` 의 줄 하나 | 값 또는 null |

## 미정

- 없음.

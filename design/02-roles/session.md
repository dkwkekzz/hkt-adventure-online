# 세션 session — 책임

세션(session) 모듈이란, 캐릭터를 어느 존의 어느 인스턴스에 배정할지 정하고, 배정한 곳을 기억하는 것이다.

- 프로세스를 띄우는 법을 모른다. 플릿이 내놓은 기능 넷(instances · launch · load · unload)을 앱이 준 함수로만 부른다.
- 캐릭터의 값을 모른다. 마지막에 있던 존의 이름만 든다.
- 인스턴스 하나에 배정하는 수는 그 존의 상한(`capacity`)을 넘지 않는다. 세는 것은 세션(Session)다 — 게이트웨이도 호스트도 아니고 여기가 센다.
- 존마다의 표는 서로 닿지 않는다. 존의 묶음마다 컨트롤 플레인 프로세스를 따로 두어도 된다.
- 세션 하나에 닿는 일(attach · transfer · disconnect · kick · failover · 만료)은 한 번에 하나다. 앞의 일이 끝난 뒤 다음을 한다 — 이동 가운데 온 detach 는 이동이 끝난 세션에 재접속 유예를 건다.
- 접속 표는 스토리지에 두지 않는다. 컨트롤 플레인이 다시 서면 게이트웨이의 heartbeat 와 노드의 보고로 다시 선다.

```text
SessionManager ← Service(컨트롤 플레인)
├ Zone × 설정의 존
├ Presence
├ Queue × 존
└ Session × 캐릭터
```

## 개념

### SessionManager
- 데이터: zones:map<이름, Zone> · presence · queues:map<존, Queue> · seats:map<Character.id, Session> · fleet(플릿의 기능 넷, 앱이 준다) · issue(Character.id → Token, 앱이 준다) · gates:map<게이트웨이의 이름, {address, seen}> · db(참조 — 표 `lastZone`) · config:{entry(처음 서는 존), graceMs, pendingMs}.
- 기능: enter(character, build) 는 흐름 3 — 존을 정하고 세션을 잡아 Ticket 을 주거나, 빈 슬롯이 없으면 Queue 에 세워 순번을 준다. attach(character, gate) 는 흐름 9 — 세션을 확인하고 값을 로드시킨 뒤 호스트의 주소와 토큰을 준다. transfer(character, zone) 은 흐름 10. disconnect(character) 는 흐름 11 — 재접속 유예를 건다. failover(instance) 는 흐름 12. migrate(instance) 는 그 인스턴스의 캐릭터를 같은 존의 다른 인스턴스로 transfer 한다(흐름 6). heartbeat(gate, characters) 는 게이트웨이의 보고를 받는다. close(zone) · open(zone) 은 그 존의 입장을 차단하고 푼다. forget(character) 는 세션이 없을 때만 그 캐릭터의 값(CharacterStore 의 erase)과 마지막 존을 지운다(흐름 8). stats 는 존마다의 세션 수 · 대기열 길이(흐름 14). kick(character, why) 는 게이트웨이에 닫으라 하고 세션을 지운다. tick 은 재접속 유예 · 잡아 둔 세션의 만료와 대기열(흐름 5).
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Zone
- 데이터: name(불변) · dataset(불변) · capacity:int(불변, 인스턴스 하나의 상한 — 잰 값) · spare:int(불변, 미리 비워 두는 슬롯의 수) · closed:bool.
- 기능: 없음.
- 생애: 설정의 줄마다 SessionManager 가 만든다.

### Session
- 데이터: character(불변) · build(불변, 클라이언트의 빌드) · instance · state:`pending`(입장이 잡았다)|`active`(게이트웨이가 이었다)|`grace`(끊겼다 — 재접속 유예) · until(만료 시각 또는 null).
- 기능: 없음.
- 생애: SessionManager.enter 가 만든다. 언로드 뒤 또는 만료로 사라진다.

### Presence
- 데이터: rows:map<Character.id, {instance, gate}>.
- 기능: put(character, instance, gate) · get(character) · drop(character) · of(instance) 는 그 인스턴스의 캐릭터들 · count(instance) 는 그 인스턴스에 잡힌 세션의 수(pending · active · grace 전부).
- 생애: SessionManager 와 함께.

### Queue
- 데이터: zone(불변) · waiting:list<{Character.id, build, seen(마지막으로 물은 때)}>.
- 기능: push(character) → 순번(이미 있으면 그 순번). next() 는 맨 앞 하나를 꺼낸다. drop(character) 는 줄에서 뺀다. position(character) 는 순번 — 물은 때를 고친다. stale(limit) 은 물은 지 limit 을 넘긴 캐릭터들.
- 생애: 존마다 SessionManager 가 만든다.

### Ticket
- 데이터: gate(게이트웨이의 주소) · page(뷰어 페이지의 주소). 불변.
- 기능: 없음. 입장의 답.
- 생애: enter 마다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| SessionRpc forget | API 서버 → 컨트롤 플레인 | Character.id | 됨 또는 까닭 |
| SessionRpc enter | API 서버 → 컨트롤 플레인 | Character.id · 빌드 | Ticket · 순번 또는 까닭 |
| SessionRpc attach · detach · heartbeat | 게이트웨이 → 컨트롤 플레인 | [gateway.md](gateway.md) 의 소켓 표 | |
| SessionRpc reroute · kick | 컨트롤 플레인 → 게이트웨이 | [gateway.md](gateway.md) 의 소켓 표 | |
| Database get · put | 세션 모듈 → 스토리지 | 표 `lastZone` 의 줄 하나 | 존 이름 또는 null |

## 미정

- 없음.

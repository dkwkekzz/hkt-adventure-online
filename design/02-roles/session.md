# 세션 session — 책임

세션(session) 모듈이란, 캐릭터를 어느 존의 어느 인스턴스에 배정할지 정하고, 배정한 곳을 기억하는 것이다.

- 프로세스를 띄우는 법을 모른다. 플릿이 내놓은 기능 다섯(instances · launch · load · unload · reload)을 앱이 준 함수로만 부른다.
- 캐릭터의 값을 모른다. 마지막에 있던 존의 이름만 든다.
- 인스턴스 하나에 배정하는 수는 그 존의 상한(`capacity`)을 넘지 않는다. 세는 것은 세션(Session)이다 — 게이트웨이도 호스트도 아니고 여기가 센다. 옮기는 가운데의 세션은 떠나는 곳과 가는 곳 둘 다에 센다.
- 세션 하나에 닿는 일(attach · transfer · disconnect · kick · failover · 만료 · 맞춤)은 한 번에 하나다. 일하는 동안 세션은 busy 이고, 그동안 온 일은 끝난 뒤에 한다.
- 표는 스토리지에 두지 않는다. 진실은 노드와 게이트웨이가 든 것이고(로드된 캐릭터 · 열린 접속), 표는 그 보고와 맞춘 것이다 — 어긋나면 표가 아니라 보고를 믿고 고친다(reconcile · heartbeat). 단, 세션이나 인스턴스를 지우는 맞춤은 그것이 마지막으로 바뀐 뒤에 지은 보고로만 한다 — 늦게 닿은 묵은 보고가 방금 한 일을 뒤집지 못한다. 그래서 글 하나가 사라지거나 컨트롤 플레인이 바뀌어도 한 주기 뒤에는 맞는다.
- 스토리지에 두는 것은 둘이다 — 마지막 존(`lastZone`), 존의 닫힘(`zones`). 컨트롤 플레인이 바뀌어도 남아야 하는 것이다.

```text
SessionManager ← Service(컨트롤 플레인)
├ Zone × 설정의 존
├ Presence
├ Queue × 존
└ Session × 캐릭터
```

## 개념

### SessionManager
- 데이터: zones:map<이름, Zone> · presence · queues:map<존, Queue> · sessions:map<Character.id, Session> · fleet(플릿의 기능 다섯 instances · launch · load · unload · reload, 앱이 준다) · accounts(계정의 기능 넷 owner · banned · owns · remove, 앱이 준다) · issue(Character.id · 서명 키의 자리 → Token, 앱이 준다) · gates:map<게이트웨이의 이름, {address, seen, closing}> · characters(참조 — CharacterStore 의 erase · versions · rollback) · db(참조 — 표 `lastZone` · `zones`) · ops:int(일의 번호 — 이 활성이 load · unload · reload 를 시킬 때마다 하나 오르는 수 하나. term 과 함께 실려, 세션이 지워지거나 컨트롤 플레인이 바뀌어도 뒤에 낸 것이 언제나 크다) · settling:bool(막 활성이 됐다 — 흐름 13) · config:{entry(처음 서는 존), graceMs, pendingMs, queueMs, gateLimitMs}.
- 기능: enter(character, build) 는 흐름 3 — 존을 정하고 세션을 잡아 Ticket 을 주거나, 빈 슬롯이 없으면 Queue 에 세워 순번을 준다. attach(character, gate) 는 흐름 9 — 세션을 확인하고 값을 로드시킨 뒤 호스트의 주소와 토큰을 준다. transfer(character, zone, spot, why, from) 은 흐름 10 — 가는 곳에 슬롯을 잡고(Session.to) 언로드 · 로드 · 바꿔 잇기를 차례로 한다. why 는 누가 불렀나(`move` 사람의 이동 · `migrate` 비움 · `failover` 장애 복구), from 은 사람의 이동을 알린 인스턴스. disconnect(character, gate) 는 흐름 11 — 세션이 `active` 이고 그 게이트웨이가 접속 표의 것일 때만 재접속 유예를 건다. failover(instance) 는 흐름 12. migrate(instance) 는 그 인스턴스의 세션을 같은 존의 다른 인스턴스로 옮긴다(흐름 6 · 7). reconcile(instance, loaded) 는 노드가 알린 로드된 캐릭터들과 세션을 맞춘다(흐름 5). heartbeat(gate, connections, closing) 는 게이트웨이가 알린 접속들과 세션을 맞춘다(흐름 5). close(zone) · open(zone) 은 그 존의 입장과 사람이 건너오는 이동을 막고 푼다. 표 `zones` 에 적는다. kick(character, why) 는 게이트웨이에 닫으라 하고 값을 언로드시키고 세션을 지우고 대기열에서도 뺀다(Queue.drop). forget(account, character) 는 흐름 8 의 지움 — 그 캐릭터가 그 계정의 것이고 세션이 없을 때만, 캐릭터의 줄(계정의 remove) · 값(CharacterStore 의 erase) · 마지막 존을 지우고 대기열에서 뺀다. 그 캐릭터에 닿는 다른 일과 겹치지 않는다(한 번에 하나). versions(character) · rollback(character, 때) 는 세션이 없을 때만 CharacterStore 의 그것을 부른다(흐름 6). tick 은 세션의 만료 · 대기열 · 끊긴 게이트웨이(흐름 5). count(instance) 는 그 인스턴스에 잡힌 슬롯의 수, waiting(zone) 은 그 존의 대기열에 선 사람의 빌드들 — 플릿에 내놓는다. stats 는 존마다의 세션 수 · 대기열 길이(흐름 14).
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Zone
- 데이터: name(불변) · dataset(불변) · capacity:int(불변, 인스턴스 하나의 상한 — 잰 값) · spare:int(불변, 미리 비워 두는 슬롯의 수) · closed:bool(표 `zones` 의 값).
- 기능: 없음.
- 생애: 설정의 줄마다 SessionManager 가 만든다.

### Session
- 데이터: character(불변) · account(그 캐릭터의 계정 — 한 계정에 세션 하나) · build(불변, 클라이언트의 빌드) · instance · to:인스턴스|null(옮기는 가운데 잡아 둔 가는 곳) · state:`pending`(입장이 잡았다 — 값은 아직 어디에도 로드되지 않았다)|`active`(게이트웨이가 이었다)|`grace`(끊겼다 — 재접속 유예. 값은 인스턴스에 있다) · until(만료 시각 또는 null) · busy:bool · since:{node, gate}(이 세션이 마지막으로 바뀐 때의 그 노드 · 게이트웨이의 보고 순번).
- 기능: 없음.
- 생애: SessionManager.enter 가 만든다. 언로드 뒤 · 만료 · 맞춤으로 사라진다.

### Presence
- 데이터: rows:map<Character.id, {instance, gate}>.
- 기능: put(character, instance, gate) · get(character) · drop(character) · of(instance) 는 그 인스턴스의 캐릭터들 · count(instance) 는 그 인스턴스에 잡힌 슬롯의 수 — instance 가 그것인 세션(pending · active · grace 전부)과 to 가 그것인 세션.
- 생애: SessionManager 와 함께.

### Queue
- 데이터: zone(불변) · waiting:list<{Character.id, build, seen(마지막으로 물은 때)}>.
- 기능: push(character) → 순번(이미 있으면 그 순번). next() 는 맨 앞 하나를 꺼낸다. drop(character) 는 줄에서 뺀다. position(character) 는 순번 — 물은 때를 고친다. stale(limit) 은 물은 지 limit 을 넘긴 캐릭터들.
- 생애: 존마다 SessionManager 가 만든다. 컨트롤 플레인이 바뀌면 빈다.

### Ticket
- 데이터: gate(게이트웨이의 주소) · page(뷰어 페이지의 주소). 불변.
- 기능: 없음. 입장의 답.
- 생애: enter 마다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| SessionRpc enter | API 서버 → 컨트롤 플레인 | Character.id · 빌드 | Ticket · 순번 또는 까닭 |
| SessionRpc forget | API 서버 → 컨트롤 플레인 | Account.id · Character.id | 됨 또는 까닭 |
| SessionRpc attach · detach · heartbeat | 게이트웨이 → 컨트롤 플레인 | [gateway.md](gateway.md) 의 소켓 표 | |
| SessionRpc reroute · kick | 컨트롤 플레인 → 게이트웨이 | [gateway.md](gateway.md) 의 소켓 표 | |
| Database get · put | 세션 모듈 → 스토리지 | 표 `lastZone` · `zones` 의 줄 하나 | 값 또는 null |
| CharacterStore erase · versions · rollback | 세션 모듈 → 스토리지 | Character.id · 때 | 됨 · 때들 |

## 미정

- 없음.

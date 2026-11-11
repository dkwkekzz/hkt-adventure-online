# 배치 placement — 책임

배치란, 캐릭터를 어느 존의 어느 인스턴스에 놓을지 정하고, 놓인 자리를 기억하는 것이다.

- 프로세스를 띄우는 법을 모른다. 함대가 내놓은 기능 넷(instances · launch · lend · reclaim)을 앱이 준 함수로만 부른다.
- 캐릭터의 값을 모른다. 마지막에 있던 존의 이름만 든다.
- 인스턴스 하나에 놓는 수는 그 존의 상한(`capacity`)을 넘지 않는다. 세는 것은 자리(Seat)다 — 관문도 호스트도 아니고 여기가 센다.
- 존마다의 표는 서로 닿지 않는다. 존의 묶음마다 제어 프로세스를 따로 두어도 된다.
- 접속 표는 저장에 두지 않는다. 제어가 다시 서면 관문의 beat 와 노드의 보고로 다시 선다.

```text
Placement ← Service(제어)
├ Zone × 설정의 존
├ Presence
├ Queue × 존
└ Seat × 캐릭터
```

## 개념

### Placement
- 데이터: zones:map<이름, Zone> · presence · queues:map<존, Queue> · seats:map<Character.id, Seat> · fleet(함대의 기능 넷, 앱이 준다) · issue(Character.id → Token, 앱이 준다) · gates:map<관문의 이름, {address, seen}> · ledger(참조 — 표 `lastZone`) · config:{entry(처음 서는 존), graceMs, seatMs}.
- 기능: enter(character) 는 흐름 3 — 존을 정하고 자리를 잡아 Ticket 을 주거나, 자리가 없으면 Queue 에 세워 순번을 준다. claim(character, gate) 는 흐름 9 — 자리를 확인하고 값을 들이게 한 뒤 호스트의 주소와 토큰을 준다. move(character, zone) 은 흐름 10. leave(character) 는 흐름 11 — 유예를 건다. lost(instance) 는 흐름 12. evacuate(instance) 는 그 인스턴스의 캐릭터를 같은 존의 다른 인스턴스로 move 한다(흐름 6). beat(gate, characters) 는 관문의 보고를 받는다. close(zone) · open(zone) 은 그 존의 입장을 막고 푼다. kick(character, why) 는 관문에 닫으라 하고 자리를 비운다. tick 은 유예 · 잡아 둔 자리의 만료와 대기열(흐름 5).
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Zone
- 데이터: name(불변) · dataset(불변) · capacity:int(불변, 인스턴스 하나의 상한 — 잰 값) · spare:int(불변, 미리 비워 두는 자리의 수) · closed:bool.
- 기능: 없음.
- 생애: 설정의 줄마다 Placement 가 만든다.

### Seat
- 데이터: character(불변) · instance · state:`held`(입장이 잡았다)|`taken`(관문이 이었다)|`grace`(끊겼다 — 유예) · until(만료 시각 또는 null).
- 기능: 없음.
- 생애: Placement.enter 가 만든다. 거둠 뒤 또는 만료로 사라진다.

### Presence
- 데이터: rows:map<Character.id, {instance, gate}>.
- 기능: put(character, instance, gate) · get(character) · drop(character) · of(instance) 는 그 인스턴스의 캐릭터들 · count(instance) 는 그 인스턴스에 잡힌 자리의 수(held · taken · grace 전부).
- 생애: Placement 와 함께.

### Queue
- 데이터: zone(불변) · waiting:list<Character.id>.
- 기능: push(character) → 순번(이미 있으면 그 순번). next() 는 맨 앞 하나를 꺼낸다. drop(character). position(character).
- 생애: 존마다 Placement 가 만든다.

### Ticket
- 데이터: gate(관문의 주소) · page(뷰어 페이지의 주소). 불변.
- 기능: 없음. 입장의 답.
- 생애: enter 마다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Seat enter | 앞문 → 제어 | Character.id | Ticket · 순번 또는 까닭 |
| Seat claim · left · beat | 관문 → 제어 | [gateway.md](gateway.md) 의 소켓 표 | |
| Seat swap · kick | 제어 → 관문 | [gateway.md](gateway.md) 의 소켓 표 | |
| Ledger get · put | 배치 → 저장 | 표 `lastZone` 의 줄 하나 | 존 이름 또는 null |

## 미정

- 없음.

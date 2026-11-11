# 흐름 10. 존 건넘 — 호스트의 건넘 글

트리거: 호스트의 stdout 한 줄. 캐릭터의 묶음이 다른 존으로 가는 자리에 닿았다(캐릭터 · 존 이름). 운영자의 `drain`(흐름 6)과 잃음(흐름 12)도 2 부터 같은 길을 간다.
한 줄: 갈 인스턴스에 자리를 잡고, 값을 지금의 인스턴스에서 거둬 저장에 넣고, 갈 인스턴스에 들이고, 관문이 뒤의 소켓을 바꿔 잇는다. 클라이언트의 소켓은 그대로다.

## 순서

```text
Probe.read — 건넘 글 ─► Berth crossed                    [함대 — 노드]  ⇐ 흐름 4
Fleet.crossed ─► Placement.move                         [함대 → 배치 — 제어]
  Fleet.instances · Presence.count · Fleet.launch       갈 자리 — 흐름 3 의 4 · 5
  Fleet.reclaim ─► Warden.reclaim                       [함대 — 떠나는 노드]
    Shard.reclaim                                       [엔진]
    Locker.checkin(release)                             [저장]
  Fleet.lend ─► Warden.lend                             [함대 — 가는 노드]
    Locker.checkout                                     [저장]
    Shard.lend                                          [엔진]
  Presence.put · Ledger.put(lastZone)                   [저장]
  Seat swap ─► Gateway.swap ── Session.swap             [관문]
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Fleet.crossed(instance, character, zone) | 배치의 move 로 넘긴다 | |
| 2 | Placement.move(character, zone) | 갈 Instance 를 흐름 3 의 4 · 5 처럼 고른다(없으면 띄운다). Zone.closed 이거나 자리를 낼 수 없으면 아무것도 하지 않는다 — 캐릭터는 제자리에 있다 ✕ | 갈 Instance |
| 3 | Fleet.reclaim(지금의 instance, character) → Warden.reclaim | Shard.reclaim — 거둠의 Console 글. 엔진이 값을 건넴 파일에 쓰고 묶음을 세계에서 지운다. Locker.checkin(release)으로 넣고 임대를 푼다 | 값이 저장에 |
| 4 | Fleet.lend(갈 instance, character) → Warden.lend | Locker.checkout → Shard.lend. 흐름 9 의 4 · 5 와 같다. 실패하면 지금의 인스턴스에 다시 들인다 | 묶음이 갈 인스턴스에 |
| 5 | Placement → Presence.put · Ledger.put | Seat 의 instance 를 바꾸고 마지막 존을 적는다 | |
| 6 | Placement → Seat swap → Gateway.swap | 그 캐릭터의 관문에 새 address 와 새 토큰을 보낸다 | |
| 7 | Session.swap(address, token) | 옛 upstream 을 닫고 새 호스트에 `Host 2` 를 보낸다. 새 호스트의 `Link 1` 열림이 클라이언트에 간다 | 클라이언트 ◇ |

## 멈추는 자리

- Session `open` — 뒤가 새 호스트. 임대를 갈 인스턴스가 든다.

## 이어지는 흐름

- 4 · 5 · 11.

## 규칙

- 캐릭터의 값은 한때에 한 인스턴스에만 있다. 거둠이 들임보다 먼저이고, 그 사이의 진실은 저장이다.
- checkout 이 임대의 번호를 올리므로, 떠난 인스턴스가 뒤늦게 넣는 값은 거절된다(흐름 5 의 2).
- 건넘 가운데 클라이언트가 보낸 글은 버린다.
- 같은 존의 다른 인스턴스로 옮기는 것(`drain` · 잃음)도 이 흐름이다.

## 미정

- 없음.

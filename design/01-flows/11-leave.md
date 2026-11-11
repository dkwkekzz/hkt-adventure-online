# 흐름 11. 떠남 — 클라이언트의 소켓이 닫힌다

트리거: 관문이 든 클라이언트의 소켓이 닫힌다. 클라이언트가 끊었거나 선이 끊겼다.
한 줄: 자리에 유예를 걸고, 유예가 지나도록 돌아오지 않으면 값을 거둬 넣고 자리를 비운다.

## 순서

```text
Session.close ─► Seat left                              [관문]
Placement.leave ── Seat(grace)                          [배치 — 제어]  ◇
  … 유예가 지난다 — Placement.tick                        ⇐ 흐름 5
Fleet.reclaim ─► Warden.reclaim                         [함대]
  Shard.reclaim                                         [엔진]
  Locker.checkin(release)                               [저장]
Presence.drop · Ledger.put(lastZone)                    [저장]
Queue.next                                              ⇒ 흐름 5 의 8
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Session.close | upstream 을 닫는다. 호스트는 그 묶음을 무대 밖에 둔다(엔진의 끊김). 제어에 Seat left | |
| 2 | Placement.leave(character) | Seat 를 `grace` 로, 만료는 `graceMs` 뒤 | Seat ◇ |
| 3 | (유예 안에 다시 온다) | 흐름 3 의 2 → 흐름 9. 들임을 건너뛰고 같은 인스턴스에 잇는다 | |
| 4 | Placement.tick → Fleet.reclaim | 유예가 지났다. Warden.reclaim — Shard.reclaim 으로 값을 거두고 Locker.checkin(release)으로 넣는다 | 값이 저장에 |
| 5 | Placement → Presence.drop · Ledger.put | 자리를 비우고 마지막 존을 적는다. 그 존에 기다리는 사람이 있으면 Queue.next | |

## 멈추는 자리

- 캐릭터의 값이 저장에, 임대는 비었다. 자리 하나가 났다.

## 이어지는 흐름

- 3 입장 · 5 박자.

## 규칙

- 유예 동안 자리는 센다. 새로고침 · 잠깐의 끊김이 건넴을 부르지 않게 하는 값이다.
- 관문이 죽어 left 가 오지 않은 것은 beat 의 끊김으로 안다(흐름 12).

## 미정

- 없음.

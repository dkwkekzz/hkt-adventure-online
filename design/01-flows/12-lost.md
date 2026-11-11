# 흐름 12. 잃음 — 호스트의 죽음 또는 보고가 끊김

트리거: 노드의 Berth exited(호스트가 끝났다), 또는 제어의 박자가 본 끊김 — Machine 의 보고가 한계를 넘겼다, 관문의 beat 가 한계를 넘겼다.
한 줄: 잃은 인스턴스가 든 임대를 끊고, 거기 있던 사람을 마지막으로 넣은 값으로 다른 인스턴스에 다시 놓는다. 인스턴스는 다시 띄운다.

## 순서

```text
Fleet.exited — 또는 Fleet.tick 이 본 Machine 의 끊김       [함대 — 제어]
  Locker.expire                                         [저장]
  Placement.lost                                        [배치]
    Presence.of
    Placement.move × 캐릭터                              ⇒ 흐름 10 의 2 · 4 ~ 7
    Seat kick — 놓을 자리가 없으면                         [관문]
  Fleet.launch — 한계 안이면                              ⇒ 흐름 3 의 5
Placement.tick 이 본 관문의 끊김                           [배치 — 제어]
  Placement.leave × 그 관문의 캐릭터                      ⇒ 흐름 11 의 2
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Fleet.exited(instance, code) | 내리는 가운데였으면 `stopped`(값은 이미 거뒀다), 아니면 `failed` 와 셈 하나. 코드 2 면(같은 인자로 다시 띄워도 같다) 셈을 한계 위로 | Instance |
| 1′ | Fleet.tick | 보고가 끊긴 Machine 의 Instance 를 전부 `failed` 로 하고 Machine 을 지운다 | |
| 2 | Fleet → Locker.expire(instance) | 그 인스턴스가 든 임대를 전부 비운다. 값은 마지막으로 넣은 것이다 | |
| 3 | Fleet → Placement.lost(instance) | Presence.of 의 캐릭터마다 같은 존의 다른 인스턴스로 Placement.move — 거둠(흐름 10 의 3)은 건너뛴다. 놓으면 관문이 뒤를 바꿔 잇는다 | 사람이 다시 놓인다 |
| 4 | Placement → Seat kick | 놓을 자리가 없는 캐릭터는 관문이 닫고(1001) 자리를 지운다. 클라이언트는 다시 입장한다(흐름 3 — 대기열일 수 있다) ✕ | |
| 5 | Fleet → Fleet.launch | 셈이 한계(`restartLimit`) 안이면 같은 이름으로 다시 띄운다(같은 Store 자리 — 호스트의 마지막 저장에서 이어간다). 넘으면 `failed` 로 두고 운영자가 본다 | |
| 6 | Placement.tick | beat 가 끊긴 관문의 캐릭터마다 Placement.leave — 유예가 걸린다. 클라이언트는 다른 관문으로 다시 들어온다 | ⇒ 흐름 11 |

## 멈추는 자리

- 사람은 다른 인스턴스에 있거나 닫혔다. 잃은 인스턴스는 다시 뜨는 가운데이거나 `failed`.

## 이어지는 흐름

- 3 · 5 · 10 · 11.

## 규칙

- 잃는 것은 마지막으로 넣은 뒤의 진행뿐이다(흐름 5 의 2).
- 끊긴 줄 알았던 노드의 호스트가 살아 있어도 값이 둘이 되지 않는다. 임대의 번호가 달라 그 호스트의 넣기는 거절되고, 노드는 그 캐릭터를 지운다(흐름 5 의 2). 그 노드가 다시 알리면 제어는 표에 없는 인스턴스를 내리게 한다(흐름 1 의 8).
- 제어가 죽은 동안에는 이 흐름이 돌지 않는다. 붙어 있는 사람은 그대로 놀고, 죽은 호스트의 사람은 제어가 다시 설 때까지 기다린다.

## 미정

- 없음.

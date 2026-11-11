# 흐름 5. 박자 — Clock 의 간격

트리거: Clock. 노드 · 제어 · 관문이 저마다 제 간격으로.
한 줄: 노드는 호스트에 status 를 묻고 든 캐릭터의 값을 베껴 넣고 제어에 보고한다. 제어는 존마다 여유를 맞추고 쉬는 인스턴스를 내리고 자리의 만료와 대기열을 본다. 관문은 살아 있음을 알린다.

## 순서

```text
노드   Warden.tick                                      [함대 — 노드]
         Shard.command status × ready                   [엔진]  ⇐ 흐름 4
         Shard.copy × 든 캐릭터 — 넣을 때마다             [엔진]
           Locker.checkin                               [저장]
         Berth report ─► Fleet.report                   [함대 — 제어]
제어   Fleet.tick                                       [함대 — 제어]
         보고가 끊긴 Machine                              ⇒ 흐름 12
         Fleet.launch × 여유가 모자란 존                   ⇒ 흐름 3 의 5
         Fleet.retire × 쉬는 인스턴스
           Berth stop ─► Warden.stop ── Vault.push · Vault.copy · Vault.prune   [저장]
       Placement.tick                                   [배치]
         Seat 의 만료 — held 는 비우고 grace 는          ⇒ 흐름 11
         Queue.next × 자리가 난 존
         beat 가 끊긴 관문                                ⇒ 흐름 12
관문   Gateway.beat ─► Placement.beat                   [관문 → 배치]
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Warden.tick → Shard.command(`status`) | ready 인 Shard 마다. 답은 흐름 4 가 읽는다 | 사람 수 · 지연 |
| 2 | Warden → Shard.copy · Locker.checkin | 넣는 주기(`checkinEvery` 박자)마다, 든 캐릭터마다 값을 건넴 파일에 베끼게 하고 그 임대로 넣는다(release 아님). 거절되면(임대의 번호가 다르다 — 이 인스턴스는 그 캐릭터를 잃었다) Shard.reclaim 으로 세계에서 지우고 값은 버린다 | 캐릭터의 값 |
| 3 | Warden → Berth report | 인스턴스마다 state · players · lag · 접속한 캐릭터들 | |
| 4 | Fleet.report(machine, 보고) | Machine 의 seen, Instance 의 players · lag. 사람이 없으면 idle 셈 하나, 있으면 0 | |
| 5 | Fleet.tick | 보고가 한계(`reportLimitMs`)를 넘겨 끊긴 Machine 은 흐름 12 | |
| 6 | Fleet.tick → Fleet.launch | 존마다, 빈 자리의 합(Zone.capacity × 인스턴스 수 − 놓인 수)이 Zone.spare 보다 작으면 하나 더 띄운다. 지연(lag)이 한계를 넘은 인스턴스는 빈 자리가 없는 것으로 센다 | Instance |
| 7 | Fleet.tick → Fleet.retire | idle 이 한계(`idleLimit`)를 넘었고 내려도 그 존의 여유가 남으면 내린다. Warden.stop 이 든 값을 전부 거두고 호스트를 내리고 Vault.push 로 Store 를 올리고 Vault.copy · Vault.prune 으로 사본 하나를 남긴다 | `stopped` |
| 8 | Placement.tick | `held` 인 채 만료된 Seat 는 지운다. `grace` 가 만료된 Seat 는 흐름 11 의 4 로. 자리가 난 존마다 Queue.next 로 맨 앞을 꺼내 Seat 를 `held` 로 잡는다 | |
| 9 | Gateway.beat → Placement.beat(gate, characters) | 관문의 이름 · 주소 · 붙은 캐릭터들. 배치는 그 관문의 seen 을 고치고, 접속 표에 없는 캐릭터는 놓인 인스턴스(노드의 보고)와 맞춰 되찾는다 | 접속 표 |

## 멈추는 자리

- 캐릭터의 값이 저장에(마지막으로 넣은 것). 제어의 표가 지금의 것.

## 이어지는 흐름

- 3 입장 · 4 호스트의 글 · 11 떠남 · 12 잃음.

## 규칙

- 호스트가 죽으면 잃는 것은 마지막으로 넣은 뒤의 진행이다. 넣는 주기가 그 크기다.
- 도는 인스턴스의 Store 는 올리지도 베끼지도 않는다. 엔진의 Store 는 파일을 제자리에 쓴다.
- NPC 에이전트는 늘 붙어 있다. 쉼은 사람의 자리로만 센다.
- 여유(Zone.spare)는 입장이 띄움을 기다리지 않게 미리 띄워 두는 것이다. 존의 마지막 인스턴스는 사람이 없어도 여유가 0 이 아니면 남는다.

## 미정

- 없음.

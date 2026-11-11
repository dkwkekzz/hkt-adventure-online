# 흐름 5. 주기 작업 — Clock 의 간격

트리거: Clock. 노드 · 컨트롤 플레인 · 게이트웨이가 저마다 제 간격으로.
한 줄: 노드는 호스트에 status 를 묻고 든 캐릭터의 값을 스냅샷으로 저장하고 컨트롤 플레인에 보고한다. 컨트롤 플레인은 존마다 예비 용량을 맞추고 쉬는 인스턴스를 내리고 세션의 만료와 대기열을 본다. 게이트웨이는 살아 있음을 알린다.

## 순서

```text
노드   NodeAgent.tick                                      [플릿 — 노드]
         GameServer.command status × ready                   [엔진]  ⇐ 흐름 4
         GameServer.snapshot × 든 캐릭터 — 저장할 때마다             [엔진]
           CharacterStore.checkin                               [스토리지]
         GameServer.backup × 백업 때                    [엔진]
           SnapshotStore.push · SnapshotStore.copy · SnapshotStore.prune   [스토리지]
         NodeRpc heartbeat ─► Fleet.heartbeat                   [플릿 — 컨트롤 플레인]
컨트롤 플레인   Fleet.tick                                       [플릿 — 컨트롤 플레인]
         보고가 끊긴 Node                              ⇒ 흐름 12
         Fleet.launch × 예비 용량이 모자란 존                   ⇒ 흐름 3 의 5
         Fleet.terminate × 쉬는 인스턴스
           NodeRpc stop ─► NodeAgent.stop ── SnapshotStore.push · SnapshotStore.copy · SnapshotStore.prune   [스토리지]
       SessionManager.tick                                   [세션]
         Session 의 만료 — pending 는 비우고 grace 는          ⇒ 흐름 11
         Queue.next × 슬롯이 난 존
         heartbeat 가 끊긴 게이트웨이                                ⇒ 흐름 12
게이트웨이   Gateway.heartbeat ─► SessionManager.heartbeat                   [게이트웨이 → 세션]
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | NodeAgent.tick → GameServer.command(`status`) | ready 인 GameServer 마다. 답은 흐름 4 가 읽는다 | 사람 수 · 지연 |
| 2 | NodeAgent → GameServer.snapshot · CharacterStore.checkin | 저장 주기(`checkinEvery` 박자)마다, 든 캐릭터마다 값을 캐릭터 파일에 스냅샷으로 쓰게 하고 그 lease 로 저장한다(release 아님). 거절되면(lease 의 번호가 다르다 — 이 인스턴스는 그 캐릭터의 lease 를 잃었다) GameServer.unload 으로 세계에서 지우고 값은 버린다 | 캐릭터의 값 |
| 3 | NodeAgent → NodeRpc heartbeat | 인스턴스마다 state · players · lag · 접속한 캐릭터들 | |
| 4 | Fleet.heartbeat(node, 보고) | Node 의 seen, Instance 의 players · lag. 사람이 없으면 idle 셈 하나, 있으면 0 | |
| 5 | Fleet.tick | 보고가 한계(`reportLimitMs`)를 넘겨 끊긴 Node 은 흐름 12 | |
| 6 | Fleet.tick → Fleet.launch | 존마다, 빈 슬롯의 합(Zone.capacity × 인스턴스 수 − 배정된 수)이 Zone.spare 보다 작으면 하나 더 띄운다. 지연(lag)이 한계를 넘은 인스턴스는 빈 슬롯이 없는 것으로 센다 | Instance |
| 7 | Fleet.tick → Fleet.terminate | idle 이 한계(`idleLimit`)를 넘었고 내려도 그 존의 예비 용량이 남으면 내린다. NodeAgent.stop 이 든 값을 전부 언로드하고 호스트를 내리고 SnapshotStore.push 로 Store 를 올리고 SnapshotStore.copy · SnapshotStore.prune 으로 백업 하나를 남긴다 호스트가 한계 안에 끝나지 않으면 Process.kill. 포트는 Ports.free | `stopped`   |
| 7′ | NodeAgent.tick → GameServer.backup · SnapshotStore.push · SnapshotStore.copy · SnapshotStore.prune | 백업 주기(`backupEvery` 박자)마다 ready 인 GameServer 에 Console `backup <dir>` 을 쓰고 `backup 끝 — ` 줄을 기다린 뒤(흐름 4), 그 dir 를 올리고 백업 하나를 남기고 오래된 것을 지운다. 호스트는 멈추지 않는다 | 존의 값의 백업 |
| 8 | SessionManager.tick | `pending` 인 채 만료된 Session 는 지운다. `grace` 가 만료된 Session 는 흐름 11 의 4 로. 슬롯이 난 존마다 Queue.next 로 맨 앞을 꺼내 Session 을 `pending` 으로 잡는다 물은 지 한계(`queueMs`)를 넘긴 대기열의 캐릭터는 Queue.stale 의 것을 Queue.drop — 창을 닫은 사람이 줄에 남지 않는다 |  |
| 9 | Gateway.heartbeat → SessionManager.heartbeat(gate, characters) | 게이트웨이의 이름 · 주소 · 붙은 캐릭터들. 세션 모듈은 그 게이트웨이의 seen 을 고치고, 접속 표에 없는 캐릭터는 배정된 인스턴스(노드의 보고)와 맞춰 되찾는다 | 접속 표 |

## 멈추는 자리

- 캐릭터의 값이 스토리지에(마지막으로 저장한 것). 컨트롤 플레인의 표가 지금의 것.

## 이어지는 흐름

- 3 입장 · 4 호스트의 글 · 11 접속 종료 · 12 장애 복구.

## 규칙

- 호스트가 죽으면 유실되는 것은 마지막으로 저장한 뒤의 진행이다. 저장 주기가 그 크기다.
- 도는 인스턴스의 Store 자리를 그대로 올리지 않는다. 올리는 것은 엔진이 창 끝에 `backup` 으로 낸 사본이다 — 언제나 한 저장의 것이다. 그래서 사람이 늘 있어 내려가지 않는 인스턴스도 백업이 선다.
- NPC 에이전트는 늘 붙어 있다. 쉼은 사람의 세션으로만 센다.
- 예비 용량(Zone.spare)는 입장이 띄움을 기다리지 않게 미리 띄워 두는 것이다. 존의 마지막 인스턴스는 사람이 없어도 예비 용량이 0 이 아니면 남는다.

## 미정

- 없음.

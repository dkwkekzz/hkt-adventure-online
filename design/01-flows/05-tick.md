# 흐름 5. 주기 작업 — Clock 의 간격

트리거: Clock. 노드 · 컨트롤 플레인 · 게이트웨이가 저마다 제 간격으로.
한 줄: 노드와 게이트웨이는 든 것을 전부 알리고, 컨트롤 플레인은 그 보고와 제 표를 맞춘다 — 어긋난 것은 여기서 바로잡힌다. 그 위에 노드는 캐릭터의 값과 존의 Store 를 저장하고, 컨트롤 플레인은 예비 용량 · 쉬는 인스턴스 · 세션의 만료 · 대기열을 본다.

## 순서

```text
노드   NodeAgent.tick                                          [플릿 — 노드]
         GameServer.command status × ready                     [엔진]  ⇐ 흐름 4
         GameServer.snapshot × 저장 때 ── CharacterStore.checkin × 로드된 캐릭터   [엔진 · 스토리지]
         CharacterStore.checkin × held · SnapshotStore.push × unpushed   [스토리지]
         GameServer.backup × 백업 때 ── SnapshotStore.push · copy · prune          [엔진 · 스토리지]
       NodeAgent.heartbeat — 제 간격으로, tick 과 따로
         NodeRpc heartbeat ─► Fleet.heartbeat                  [플릿 — 컨트롤 플레인]
                                 SessionManager.reconcile      [세션]
컨트롤 플레인
       Fleet.tick                                              [플릿]
         보고가 끊긴 Node                                        ⇒ 흐름 12
         Fleet.launch × 예비 용량이 모자란 존                      ⇒ 흐름 3 의 6
         Fleet.terminate × 쉬는 인스턴스 · 다 비운 인스턴스
         SessionManager.migrate × 비우는 인스턴스에 남은 세션       ⇒ 흐름 10
           NodeRpc stop ─► NodeAgent.stop                      ⇒ 흐름 7 의 3
       SessionManager.tick                                     [세션]
         Session 의 만료 — pending 은 지우고 grace 는             ⇒ 흐름 11 의 4
         Queue.next × 슬롯이 난 존 · Queue.stale ── Queue.drop
         heartbeat 가 끊긴 게이트웨이                              ⇒ 흐름 12 의 6
       Service → Directory.sweep — 하루에 한 번                  [앱 → 계정]
게이트웨이
       Gateway.heartbeat ─► SessionManager.heartbeat           [게이트웨이 → 세션]
       Connection.ping × 접속
```

### A 노드

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | NodeAgent.tick → GameServer.command(`status`) | ready 인 GameServer 마다. 답은 흐름 4 가 읽는다. 답이 잇달아 `statusMiss` 번 없으면 멈춘 것으로 보고 Process.kill | 사람 수 · 지연. ⇒ 흐름 4 의 4 |
| 2 | NodeAgent → GameServer.snapshot · CharacterStore.checkin | 저장 주기(`checkinEvery` 박자)마다 GameServer 마다. 로드된 캐릭터 전부의 값을 한 번에 쓰게 하고(같은 창 사이의 값) 캐릭터마다 그 lease 로 저장한다(release 아님). 거절되면(lease 의 번호가 다르다 — 이 인스턴스는 그 캐릭터를 잃었다) GameServer.unload 로 세계에서 지우고 값은 버린다. 스토리지에 닿지 않으면 다음 주기에 다시 한다 | 캐릭터의 값 |
| 3′ | NodeAgent → SnapshotStore.push × unpushed | 내렸으나 올리지 못한 Store 자리를 다시 올린다. 거절되면(그 사이 다른 세대가 주인이 됐다) 버린다 | |
| 3 | NodeAgent → CharacterStore.checkin × held | 언로드는 했으나 저장하지 못한 캐릭터 파일을 다시 저장하고 lease 를 푼다. 되면 파일을 지운다. 거절되면(그 사이 lease 가 만료돼 다른 곳에 배정됐다) 버린다 | |
| 4 | NodeAgent → GameServer.backup · SnapshotStore.push · SnapshotStore.copy · SnapshotStore.prune | 백업 주기(`backupEvery` 박자)마다 ready 인 GameServer 에 Console `backup <dir>` 을 쓰고 `backup 끝 — ` 줄을 기다린 뒤(흐름 4), 그 dir 를 세대와 함께 올리고 백업 하나를 남기고 오래된 것을 지운다. 호스트는 멈추지 않는다. 올림이 거절되면(그 자리의 주인이 다른 세대다 — 이 호스트는 낡았다) NodeAgent.stop 을 discard 로 | 존의 값의 백업 |
| 5 | NodeAgent.heartbeat → NodeRpc heartbeat | 1 ~ 4 와 따로 제 간격으로 보낸다 — 스토리지가 느려 저장 · 백업이 밀려도 보고는 간다. 순번(seq)을 올려 싣고, 노드의 closing 과 인스턴스마다 이름 · 세대 · 포트 · state · players · lag · 로드된 캐릭터들 · 접속한 캐릭터들을 알린다 | |

### B 컨트롤 플레인 — 노드의 보고와 맞춘다

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 6 | Fleet.heartbeat(node, 보고) | 모르는 노드의 것이면(끊긴 것으로 보아 지웠다) register 를 다시 하라고 답한다. 같은 boot 의 순번이 앞에 받은 것보다 작으면 버린다. boot 가 바뀌었으면 순번을 새로 세고 그 노드에 걸린 since 를 전부 넘긴 것으로 본다(노드 에이전트가 다시 떴다 — 그 인스턴스들은 보고에 없고 7 ② 가 죽은 것으로 본다). Node 의 seen · closing. 보고된 Instance 의 state · players · lag · 포트(줄에 없으면 Assignment.put). 잡힌 슬롯이 0 이면(sessions 의 count) idle 셈 하나, 있으면 0. `unknown` 이던 것은 보고된 state 가 된다. `ready` 로 `stableMs` 를 버틴 인스턴스의 restarts 는 0 으로 | |
| 7 | Fleet.heartbeat — 인스턴스를 맞춘다 | ① 보고된 인스턴스가 표에 없거나, 표의 노드 · 세대가 이것과 다르면 그 노드에 NodeRpc stop 을 discard 로 보낸다(다른 곳에 다시 떴거나 지워졌다 — 올리지 않고 내린다). ② 표에 이 노드의 도는 것으로 있는데 보고에 없거나 `failed` 로 보고되면 죽은 것이다 ⇒ 흐름 12. 이 판정은 그 인스턴스가 마지막으로 바뀐 뒤의 순번(Instance.since)을 넘긴 보고로만 한다(`starting` 은 띄움의 답이 준 순번 뒤부터). ③ 내리는 가운데(`stopping`)인데 `ready` 로 보고되면 stop 을 다시 보낸다. `stopping` 이던 것이 보고에서 사라지면 죽은 것이 아니라 내려간 것이다 — 줄을 `stopped` 로 적는다(알림이 사라졌다). ④ 표에 `failed` 인데 같은 노드 · 같은 세대로 `ready` 라고 알리면(보고가 끊겼다 돌아왔고 아직 다시 띄우지 않았다) 줄을 도는 것으로 되돌린다 — 든 캐릭터는 이미 lease 를 잃어 2 가 지운다. 표에 `stopped` 인데 돈다고 알리면 stop 을 다시 보낸다 | |
| 8 | Fleet → SessionManager.reconcile(instance, loaded) | 로드된 캐릭터들을 세션과 맞춘다. ① 로드돼 있는데 그 인스턴스를 가리키는 세션(instance 또는 to)이 없으면 Fleet.unload — 값을 저장하고 lease 를 푼다(일의 번호는 세션이 없어도 세션 모듈이 낸다). ② `active` · `grace` 인 세션이 그 인스턴스를 가리키는데 로드돼 있지 않으면 세션을 지우고 SessionRpc kick(1001)을 보낸다. busy 인 세션은 건너뛰고, 둘 다 그 세션이 마지막으로 바뀐 뒤의 순번(Session.since 의 node)을 넘긴 보고로만 한다 | 세션 없이 lease 를 쥔 캐릭터가 없다 |

### C 컨트롤 플레인 — 제 박자

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 9 | Fleet.tick | tick 사이가 제 간격보다 크게 벌어졌으면(프로세스가 멈췄다 깼다) 아무것도 판정하지 않고 LeaderLock.renew 부터 한다 — 거절되면 물러나고(흐름 13 의 10), 되면 settling 으로 돌아가 보고를 다시 모은다. 그렇지 않으면 보고가 한계(`reportLimitMs`)를 넘겨 끊긴 Node 는 흐름 12 | |
| 10 | Fleet.tick → Fleet.launch | 존마다, 빈 슬롯의 합(Zone.capacity × 인스턴스 수 − 잡힌 슬롯 — sessions 의 count)이 Zone.spare 보다 작거나 대기열에 사람이 있으면(sessions 의 waiting) 한계 안의 `failed` 인스턴스가 있으면 먼저 그 이름으로 다시 띄운다(흐름 12 의 5 가 끊겼던 것). 그 밖에는 하나 더 띄운다 — 빌드는 설정의 `build`(새 사람을 받는 빌드), 대기열의 사람의 빌드가 다르면 그것으로도. 지연(lag)이 한계를 넘었거나 `draining` 인 인스턴스는 빈 슬롯이 없는 것으로 센다 | Instance |
| 11 | Fleet.tick → Fleet.terminate | idle 이 한계(`idleLimit`)를 넘었고 내려도 그 존의 예비 용량이 남는 인스턴스, 그리고 `draining` 이고 잡힌 슬롯이 0 인 인스턴스를 내린다. `stopping` 으로 하고 NodeRpc stop. 표의 줄을 `stopped` 로 적는 것은 노드가 Store 를 올리고 알린 뒤다(흐름 12 의 1) | ⇒ 흐름 7 의 3 |
| 11′ | Fleet.tick → SessionManager.migrate | `draining` 인 인스턴스와 내려가는 노드(Node.closing)의 인스턴스마다, 아직 남은 세션을 다시 옮겨 본다(흐름 10 의 2 부터) | |
| 12 | SessionManager.tick | `pending` 인 채 만료된 Session 은 지운다(그 사이 로드됐다면 8 이 언로드한다). `grace` 가 만료된 Session 은 흐름 11 의 4 로 | |
| 13 | SessionManager.tick → Queue.next · Queue.stale · Queue.drop | 슬롯이 난 존마다 맨 앞을 꺼내 입장의 검사(흐름 3 의 2 ~ 4 — 지워진 캐릭터 · 차단된 계정 · 닫힌 존 · 그 계정의 다른 세션)를 다시 하고, 지나면 Session 을 `pending` 으로 잡는다. 지나지 못하면 버리고 다음 사람. 물은 지 한계(`queueMs`)를 넘긴 캐릭터는 줄에서 뺀다 — 창을 닫은 사람이 줄에 남지 않는다 | |
| 14 | SessionManager.tick | heartbeat 가 한계(`gateLimitMs`)를 넘겨 끊긴 게이트웨이는 흐름 12 의 6 | |
| 15 | Service → Directory.sweep | 하루에 한 번, 캐릭터가 없고 오래(`accountIdleDays`) 오지 않은 계정을 지운다. 줄이 없는 캐릭터의 값이 남아 있으면 그것도 지운다(SessionManager.forget) | |

### D 게이트웨이

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 16 | Gateway.heartbeat → SessionManager.heartbeat(gate, connections, closing) | 같은 boot 의 순번이 앞에 받은 것보다 작으면 버린다. boot 가 바뀌었으면(게이트웨이가 다시 떴다) 순번을 새로 세고 그 게이트웨이에 걸린 since 를 전부 넘긴 것으로 본다. 게이트웨이의 seen · closing 을 고치고 접속들을 세션과 맞춘다. ① 접속이 있는데 세션이 `grace` 면 `active` 로(Presence.put). ② 이 게이트웨이의 것으로 적힌 `active` 세션이 보고에 없으면 SessionManager.disconnect — 재접속 유예를 건다. ③ 접속이 있는데 세션이 없으면 SessionRpc kick(1001). ④ 접속이 이어진 인스턴스가 세션의 인스턴스와 다르거나 없으면(뒤가 닫혀 기다린다) SessionRpc reroute 를 다시 보낸다. ⑤ 세션의 게이트웨이가 아닌 게이트웨이가 알린 접속은 SessionRpc kick(4000) — 다른 곳에서 다시 붙었는데 옛 접속이 남았다. busy 인 세션은 건너뛰고, ② ~ ⑤ 는 그 세션이 마지막으로 바뀐 뒤의 순번(Session.since 의 gate)을 넘긴 보고로만 한다 | 접속 표 |
| 17 | Connection.ping | 간격마다 클라이언트에 ping. 한계(`pongMs`) 안에 답이 없으면 Connection.close — 죽은 선이 세션을 쥐고 있지 않게 한다 | ⇒ 흐름 11 |

## 멈추는 자리

- 캐릭터의 값이 스토리지에(마지막으로 저장한 것). 컨트롤 플레인의 표가 노드 · 게이트웨이가 든 것과 같다.

## 이어지는 흐름

- 3 입장 · 4 호스트의 글 · 7 종료 · 11 접속 종료 · 12 장애 복구.

## 규칙

- 진실은 노드가 든 것(로드된 캐릭터)과 게이트웨이가 든 것(열린 접속)이다. 컨트롤 플레인의 표가 그것과 다르면 표를 고치거나, 표에 없는 것을 내리게 한다. 글 하나(load 의 답 · unload · detach · kick · reroute · exited · stop)가 사라져도 한 주기 뒤에는 맞는다 — 어떤 캐릭터도 세션 없이 lease 를 쥔 채, 어떤 세션도 접속 없이 `active` 인 채 남지 않는다.
- 호스트가 죽으면 캐릭터는 마지막으로 저장한 값으로, 땅은 호스트의 마지막 저장(다른 서버에 다시 뜨면 마지막 백업)으로 돌아간다. 유실되는 것은 그 뒤의 진행이고 저장 주기가 그 크기다. 캐릭터와 땅, 캐릭터와 캐릭터는 서로 다른 때의 값일 수 있다 — 그 사이에 주고받은 것은 어긋날 수 있다.
- 도는 인스턴스의 Store 자리를 그대로 올리지 않는다. 올리는 것은 엔진이 창 끝에 `backup` 으로 낸 사본이다 — 언제나 한 저장의 것이다. 사람이 늘 있어 내려가지 않는 인스턴스도 백업이 선다.
- NPC 에이전트는 늘 붙어 있다. 쉼은 사람의 세션으로만 센다.
- 예비 용량(Zone.spare)은 입장이 띄움을 기다리지 않게 미리 띄워 두는 것이다. 존의 마지막 인스턴스는 사람이 없어도 예비 용량이 0 이 아니면 남는다.
- 보고에는 그 프로세스가 뜬 때의 표지(boot)와 순번이 있다. 프로세스가 다시 뜨면 표지가 바뀌고 순번은 새로 센다. 노드 · 게이트웨이가 한 일의 답(띄움 · 로드 · 언로드 · attach)에 그때의 순번이 실려 오고, 컨트롤 플레인은 그것을 그 인스턴스 · 세션의 since 로 적는다. 지우는 맞춤(7 ② · 8 · 16 ② ~ ④)은 since 를 넘긴 보고로만 한다 — 일이 끝나기 전에 지은 보고가 늦게 닿아도 방금 로드한 세션을 지우거나 방금 뜬 인스턴스를 죽은 것으로 보지 않는다.
- 노드의 heartbeat 는 저장과 따로 간다. 스토리지가 느리거나 끊겨도 노드는 살아 있다고 알리고, 컨트롤 플레인은 그 노드를 죽은 것으로 보지 않는다.
- 컨트롤 플레인이 막 바뀐 동안(settling)에는 9 ~ 11′ 을 하지 않는다(흐름 13).

## 미정

- 없음.

# 흐름 12. 장애 복구 — 호스트의 죽음 또는 보고가 끊김

트리거: 노드의 NodeRpc exited(호스트가 끝났다), 또는 컨트롤 플레인의 주기 작업이 본 끊김 — Node 의 보고가 한계를 넘겼다, 게이트웨이의 heartbeat 가 한계를 넘겼다.
한 줄: 죽은 인스턴스가 든 lease 를 끊고, 거기 있던 사람을 마지막으로 저장한 값으로 다른 인스턴스에 다시 배정한다. 인스턴스는 다시 띄운다.

## 순서

```text
Fleet.exited — 또는 Fleet.tick 이 본 Node 의 끊김       [플릿 — 컨트롤 플레인]
  CharacterStore.expire                                         [스토리지]
  SessionManager.failover                                        [세션]
    Presence.of
    SessionManager.transfer × 캐릭터                              ⇒ 흐름 10 의 2 · 4 ~ 7
    SessionRpc kick — 배정할 슬롯이 없으면                         [게이트웨이]
  Fleet.launch — 한계 안이면                              ⇒ 흐름 3 의 5
SessionManager.tick 이 본 게이트웨이의 끊김                           [세션 — 컨트롤 플레인]
  SessionManager.disconnect × 그 게이트웨이의 캐릭터                      ⇒ 흐름 11 의 2
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Fleet.exited(instance, code) | 내리는 가운데였으면 `stopped`(값은 이미 거뒀다), 아니면 `failed` 와 셈 하나. 코드 2 면(같은 인자로 다시 띄워도 같다) 셈을 한계 위로 | Instance |
| 1′ | Fleet.tick | 보고가 끊긴 Node 의 Instance 를 전부 `failed` 로 하고 Node 를 지운다 | |
| 2 | Fleet → CharacterStore.expire(instance) | 그 인스턴스가 든 lease 를 전부 비운다. 값은 마지막으로 저장한 것이다 | |
| 3 | Fleet → SessionManager.failover(instance) | Presence.of 의 캐릭터마다 같은 존의 다른 인스턴스로 SessionManager.transfer — 언로드(흐름 10 의 3)는 건너뛴다. 배정되면 게이트웨이가 뒤를 바꿔 잇는다 그동안 게이트웨이의 Connection 은 `rerouting` 으로 클라이언트의 소켓을 든 채 기다린다(흐름 9 의 규칙). `grace` 인 Session 은 옮기지 않고 지운다 — 값은 스토리지에 있다 | 사람이 다시 배정된다  |
| 4 | SessionManager → SessionRpc kick | 배정할 슬롯이 없는 캐릭터는 게이트웨이가 닫고(1001) 세션을 지운다. 클라이언트는 다시 입장한다(흐름 3 — 대기열일 수 있다) ✕ | |
| 5 | Fleet → Fleet.launch | 셈이 한계(`restartLimit`) 안이면 같은 이름으로 다시 띄운다(같은 Store 자리 — 호스트의 마지막 저장에서 이어간다). 넘으면 `failed` 로 두고 운영자가 본다 | |
| 6 | SessionManager.tick | heartbeat 가 끊긴 게이트웨이의 캐릭터마다 SessionManager.disconnect — 재접속 유예가 걸린다. 클라이언트는 다른 게이트웨이로 다시 들어온다 | ⇒ 흐름 11 |

## 멈추는 자리

- 사람은 다른 인스턴스에 있거나 닫혔다. 죽은 인스턴스는 다시 뜨는 가운데이거나 `failed`.

## 이어지는 흐름

- 3 · 5 · 10 · 11.

## 규칙

- 유실되는 것은 마지막으로 저장한 뒤의 진행뿐이다(흐름 5 의 2).
- 끊긴 줄 알았던 노드의 호스트가 살아 있어도 값이 둘이 되지 않는다. lease 의 번호가 달라 그 호스트의 저장은 거절되고, 노드는 그 캐릭터를 지운다(흐름 5 의 2). 그 노드가 다시 알리면 컨트롤 플레인은 표에 없는 인스턴스를 내리게 한다(흐름 1 의 8).
- 컨트롤 플레인이 죽은 동안에는 이 흐름이 돌지 않는다. 붙어 있는 사람은 그대로 놀고, 죽은 호스트의 사람은 컨트롤 플레인이 다시 설 때까지 기다린다.

- 다시 배정하는 곳은 같은 빌드의 인스턴스뿐이다(흐름 10 의 2).
- 컨트롤 플레인 자신의 죽음은 흐름 13 이다.

## 미정

- 없음.

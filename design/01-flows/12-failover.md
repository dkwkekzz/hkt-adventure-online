# 흐름 12. 장애 복구 — 호스트의 죽음 또는 보고가 끊김

트리거: 노드의 NodeRpc exited(호스트가 끝났다), heartbeat 의 맞춤이 본 것(표에는 도는데 보고에 없거나 `failed` — 흐름 5 의 7), 또는 컨트롤 플레인의 주기 작업이 본 끊김 — Node 의 보고가 한계를 넘겼다, 게이트웨이의 heartbeat 가 한계를 넘겼다.
한 줄: 죽은 인스턴스가 든 lease 를 끊고, 거기 있던 사람을 마지막으로 저장한 값으로 다른 인스턴스에 다시 배정한다. 인스턴스는 세대를 올려 다시 띄운다.

## 순서

```text
Fleet.exited — 또는 Fleet.heartbeat · Fleet.tick 이 본 죽음   [플릿 — 컨트롤 플레인]
  Assignment.put                                        [스토리지]
  CharacterStore.expire                                 [스토리지]
  SessionManager.failover                               [세션]
    Presence.of
    SessionManager.transfer × 캐릭터                      ⇒ 흐름 10 의 2 ~ 9 (5 없이)
    SessionRpc kick — 배정할 슬롯이 없으면                   [게이트웨이]
  Fleet.launch — 한계 안이면                              ⇒ 흐름 3 의 6 ~ 8
SessionManager.tick 이 본 게이트웨이의 끊김                  [세션 — 컨트롤 플레인]
  SessionManager.disconnect × 그 게이트웨이의 캐릭터        ⇒ 흐름 11 의 2
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Fleet.exited(node, instance, epoch, code) | 알린 노드 · 세대가 표의 것과 다르면 버린다(다른 곳에 다시 뜬 뒤의 낡은 호스트다). 내리는 가운데(`stopping`)였거나 코드 0 이면 `stopped` — 노드가 Store 를 올린 뒤에 알린 것이다(흐름 7 의 3). 여기서 끝난다. 그 밖은 `failed` 와 셈 하나. 코드 2 면(같은 인자로 다시 띄워도 같다) 셈을 한계 위로. Assignment.put 으로 표에 적는다 | Instance |
| 1′ | Fleet.tick | 보고가 끊긴 Node 의 도는 Instance 를 전부 `failed` 로 하고 Node 를 지운다 | |
| 2 | Fleet → CharacterStore.expire(instance) | 그 인스턴스가 든 lease 를 전부 비우고 번호를 올린다. 값은 마지막으로 저장한 것이다. 그 호스트가 살아 있어도 뒤늦은 저장은 전부 거절된다 | |
| 3 | Fleet → SessionManager.failover(instance) | 그 인스턴스의 세션(Presence.of)과 그리로 옮기던 세션마다. `active` 는 같은 존의 다른 인스턴스로 SessionManager.transfer — 언로드는 없다. 그동안 게이트웨이의 Connection 은 `rerouting` 으로 클라이언트의 소켓을 든 채 기다린다(흐름 9 의 규칙). `pending` 은 인스턴스만 바꾼다. `grace` 는 지운다 — 값은 스토리지에 있다. 그리로 옮기던 세션은 그 이동이 로드의 실패로 간다(흐름 10 의 6) | 사람이 다시 배정된다 |
| 4 | SessionManager → SessionRpc kick | 배정할 슬롯이 없는 캐릭터는 게이트웨이가 닫고(1001) 세션을 지운다. 클라이언트는 다시 입장한다(흐름 3 — 대기열일 수 있다) ✕ | |
| 5 | Fleet → Fleet.launch | 셈이 한계(`restartLimit`) 안이면 같은 이름으로 세대를 올려 다시 띄운다. 같은 노드면 그 서버의 Store 자리(호스트의 마지막 저장)에서, 다른 노드면 올라가 있는 것(마지막 백업)에서 이어간다. 한계를 넘으면 `failed` 로 두고 운영자가 본다 | |
| 6 | SessionManager.tick | heartbeat 가 끊긴 게이트웨이의 캐릭터마다 SessionManager.disconnect — 재접속 유예가 걸린다. 클라이언트는 다른 게이트웨이로 다시 들어온다. 게이트웨이가 살아 있었고 heartbeat 만 늦은 것이면 다음 heartbeat 가 `active` 로 되돌린다(흐름 5 의 16) | ⇒ 흐름 11 |

## 멈추는 자리

- 사람은 다른 인스턴스에 있거나 닫혔다. 죽은 인스턴스는 다시 뜨는 가운데이거나 `failed`.

## 이어지는 흐름

- 3 · 5 · 10 · 11.

## 규칙

- 유실되는 것은 마지막으로 저장한 뒤의 진행뿐이다(흐름 5 의 규칙).
- 끊긴 줄 알았던 노드의 호스트가 살아 있어도 값이 둘이 되지 않는다. expire 가 lease 의 번호를 올려 그 호스트의 저장은 거절되고, 노드는 그 캐릭터를 지운다(흐름 5 의 2). 그 호스트가 올리는 Store 도 세대가 낮아 거절된다(흐름 5 의 4). 그 노드가 다시 알리면 컨트롤 플레인은 표와 다른 인스턴스를 올리지 않고 내리게 한다(흐름 5 의 7).
- 게이트웨이와 호스트 사이만 끊긴 때는 컨트롤 플레인이 모른다. Connection 이 `rerouting` 의 한계를 넘겨 닫히고 세션은 재접속 유예로 간다 — 사람이 돌아오면 같은 인스턴스에 다시 잇는다.
- 스토리지에 닿지 않는 동안에는 로그인 · 입장 · 존 이동 · 장애 복구가 실패하고 붙어 있는 사람은 그대로 논다. 컨트롤 플레인은 LeaderLock 을 늦추지 못해 대기로 물러난다(흐름 13) — 스토리지가 돌아오면 다시 잡는다.
- 컨트롤 플레인이 없는 동안에는 이 흐름이 돌지 않는다. 붙어 있는 사람은 그대로 놀고, 죽은 호스트의 사람은 게이트웨이가 `rerouting` 의 한계까지 기다리다 닫는다 — 돌아온 클라이언트는 컨트롤 플레인이 설 때까지 503 을 받고 다시 묻는다.
- 다시 배정하는 곳은 같은 빌드의 인스턴스뿐이다(흐름 10 의 3).
- 막 바뀐 컨트롤 플레인은 표를 세우는 동안(settling) 죽음을 판정하지 않는다(흐름 13).

## 미정

- 없음.

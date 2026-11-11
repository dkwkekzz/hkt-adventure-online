# 흐름 7. 종료 — 프로세스의 종료 신호

트리거: 프로세스. SIGINT · SIGTERM.
한 줄: 노드는 내려간다고 알려 사람을 다른 인스턴스로 옮기게 한 뒤 남은 값을 저장하고 인스턴스를 내린다. 게이트웨이는 새 접속을 받지 않게 알린 뒤 소켓을 닫는다. 컨트롤 플레인은 LeaderLock 을 놓는다. 어느 것도 다른 프로세스를 내리지 않는다.

## 순서

```text
Service.stop                                            [앱]
  node     NodeAgent.stopAll                            [플릿 — 노드]
             NodeRpc heartbeat(closing) ─► Fleet.heartbeat ── SessionManager.migrate   ⇒ 흐름 10
             NodeAgent.stop × GameServer — 비었거나 한계가 지나면
               GameServer.unload · CharacterStore.checkin        [엔진 · 스토리지]
               GameServer.stop                                    [엔진]
               SnapshotStore.push · SnapshotStore.copy · SnapshotStore.prune   [스토리지]
               NodeRpc exited ─► Fleet.exited                     ⇒ 흐름 12 의 1
  gateway  Gateway.stop ── Gateway.heartbeat(closing) · Connection.close × 접속   [게이트웨이]
  control  LeaderLock.resign · Clock.stop · 듣기 닫기      [스토리지 · 플릿]
  api      Api 닫기
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | node | NodeAgent.stopAll | closing 을 세워 NodeRpc heartbeat 를 보낸다 | |
| 2 | control | Fleet.heartbeat → SessionManager.migrate | Node 를 closing 으로 적는다 — 그 노드에는 띄우지도 배정하지도 않는다. 그 노드의 인스턴스마다 세션을 같은 존의 다른 인스턴스로 옮긴다(흐름 10 의 2 부터). 사람의 접속은 끊기지 않는다 | |
| 3 | node | NodeAgent.stop(instance) | 인스턴스가 비었거나 한계(`closingMs`)가 지나면 내린다. 남은 캐릭터를 GameServer.unload 해 CharacterStore.checkin(release)으로 저장하고(저장하지 못한 것은 spool 에 남아 다음 시작의 recover 가 한다), GameServer.stop(호스트가 저장하고 끝난다. 한계 안에 끝나지 않으면 Process.kill), Ports.free, SnapshotStore.push 로 Store 를 세대와 함께 올리고 SnapshotStore.copy · SnapshotStore.prune 으로 백업 하나를 남긴다. 그 뒤에 NodeRpc exited(코드 0)를 알린다 | 값 · Store 가 스토리지에 |
| 4 | control | Fleet.exited | `stopped` 로 적는다(흐름 12 의 1). 옮기지 못하고 남았던 세션은 흐름 5 의 8 이 지우고 게이트웨이가 닫는다 — 돌아온 클라이언트는 다른 인스턴스에 들어간다 | |
| 5 | gateway | Gateway.stop | closing 을 실은 heartbeat 를 먼저 보내 새 Ticket 이 이 게이트웨이를 가리키지 않게 한 뒤, Connection 마다 Connection.close(1001). 컨트롤 플레인에 detach 가 간다 — 닫힌 사람은 재접속 유예 안에 다른 게이트웨이로 돌아오고 값은 언로드되지 않는다 | ⇒ 흐름 11 |
| 6 | control | Service | 활성이면 LeaderLock.resign 으로 놓는다 — 대기가 바로 잡는다(흐름 13). Clock.stop. SessionRpc · NodeRpc · Operator 를 닫는다. 인스턴스는 내리지 않는다 | |
| 7 | api | Service | Api 를 닫는다 | |

## 멈추는 자리

- 스토리지. 다음 시작(흐름 1)이 되찾는다.

## 규칙

- 두 번 불려도 한 번.
- 컨트롤 플레인 · API 서버 · 게이트웨이의 종료는 도는 인스턴스에 닿지 않는다.
- 노드가 `stopped` 를 알리는 것은 Store 를 올린 뒤다. 컨트롤 플레인이 그 인스턴스를 다른 노드에 다시 띄울 때 올라가 있는 것이 마지막 것이다.
- 컨트롤 플레인이 없을 때 노드가 내려가면 2 가 없다. 한계 뒤 3 이 남은 값을 저장하고 내리고, 사람은 게이트웨이가 닫는다.

## 미정

- 없음.

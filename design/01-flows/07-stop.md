# 흐름 7. 종료 — 프로세스의 종료 신호

트리거: 프로세스. SIGINT · SIGTERM.
한 줄: 노드는 든 캐릭터의 값을 언로드해 저장하고 인스턴스를 내린다. 게이트웨이는 소켓을 닫는다. 컨트롤 플레인과 API 서버는 듣기를 닫는다. 어느 것도 다른 프로세스를 내리지 않는다.

## 순서

```text
Service.stop                                            [앱]
  node     NodeAgent.stopAll ── NodeAgent.stop × GameServer        [플릿 — 노드]
             GameServer.unload · CharacterStore.checkin             [엔진 · 스토리지]
             GameServer.stop · SnapshotStore.push                    [엔진 · 스토리지]
  gateway     Gateway.stop ── Connection.close × 접속          [게이트웨이]
  control  Clock.stop · 듣기 닫기                         [플릿]
  api      Api 닫기
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | node | NodeAgent.stopAll | GameServer 마다 NodeAgent.stop — 든 캐릭터를 전부 GameServer.unload 해 CharacterStore.checkin(release)으로 저장하고, GameServer.stop(호스트가 저장하고 끝난다. 한계 안에 끝나지 않으면 신호로), SnapshotStore.push 로 Store 를 올린다 | 값 · Store 가 스토리지에 |
| 2 | node | GameServer.exited → NodeRpc exited | 컨트롤 플레인은 그 인스턴스를 `stopped` 로 보고 붙어 있던 사람을 다시 배정한다 | ⇒ 흐름 12 의 3 |
| 3 | gateway | Gateway.stop | Connection 마다 Connection.close(1001). 컨트롤 플레인에 detach 가 간다 | ⇒ 흐름 11 |
| 4 | control | Service | Clock.stop. SessionRpc · NodeRpc · Operator 를 닫는다. 인스턴스는 내리지 않는다 — 표는 스토리지에 있고 다음 시작(흐름 1)이 되찾는다 | |
| 5 | api | Service | Api 를 닫는다 | |

## 멈추는 자리

- 스토리지. 다음 시작(흐름 1)이 되찾는다.

## 규칙

- 두 번 불려도 한 번.
- 컨트롤 플레인 · API 서버 · 게이트웨이의 종료는 도는 인스턴스에 닿지 않는다.

## 미정

- 없음.

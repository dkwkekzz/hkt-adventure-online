# 흐름 7. 종료 — 프로세스의 종료 신호

트리거: 프로세스. SIGINT · SIGTERM.
한 줄: 노드는 사람을 다른 인스턴스로 옮기게 한 뒤 남은 값과 Store 를 저장하고 인스턴스를 내린다. 게이트웨이는 접속을 닫는다. 컨트롤 플레인은 자리를 넘긴다. 어느 것도 다른 프로세스를 내리지 않는다.

## 순서

```text
Service.stop
  node     NodeReporter.report(closing) → Mover.move × 사람
           → Loader.unload × 남은 캐릭터 → Runner.stop → Backuper.upload → Registry.put
  gateway  GateReporter.report(closing) → Connection.close × 접속
  control  LeaderLock.resign
  api      Api.close
  전부     → Service.stop(스토리지를 닫는다)
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | node | NodeReporter.report | 내려간다고 알린다 — 그 노드에는 띄우지도 배정하지도 않게 된다 | |
| 2 | control | Mover.move | 그 노드의 인스턴스에 있는 사람을 같은 존의 다른 인스턴스로 옮긴다(⇒ 흐름 10). 접속은 끊기지 않는다 | |
| 3 | node | Loader.unload | 인스턴스가 비었거나 한계(`closingMs`)가 지나면, 남은 캐릭터의 값을 저장하고 lease 를 푼다 | 값이 스토리지에 |
| 4 | node | Runner.stop | 호스트를 내린다(호스트가 저장하고 끝난다) | |
| 5 | node | Backuper.upload | 내려간 Store 자리를 올리고 백업 하나를 남긴다 | Store 가 스토리지에 |
| 6 | control | Registry.put | 줄을 `stopped` 로 적는다 | |
| 7 | gateway | GateReporter.report | 내려간다고 알린다 — 새 입장이 이 게이트웨이를 받지 않는다 | |
| 8 | gateway | Connection.close | 접속을 전부 닫는다(1001). 사람은 재접속 유예 안에 다른 게이트웨이로 돌아온다 | ⇒ 흐름 11 |
| 9 | control | LeaderLock.resign | 활성이면 자리를 놓는다 — 대기가 바로 잡는다 | ⇒ 흐름 13 |
| 10 | api | Api.close | http 를 닫는다 | |
| 11 | 전부 | Service.stop | 스토리지를 닫는다 — 다른 개념이 다 내려간 뒤 | |

## 실패하면

- Store 를 올리지 못하면 그 서버의 자리에 남는다. 그 노드가 다시 뜨면 올린다.
- 옮길 곳이 없어 남은 사람은 4 에서 닫히고 다시 입장한다.

## 멈추는 자리

- 스토리지. 다음 시작(흐름 1)이 되찾는다.

## 규칙

- 컨트롤 플레인 · API 서버 · 게이트웨이의 종료는 도는 인스턴스에 닿지 않는다.
- 3 ~ 6 은 인스턴스 하나를 내리는 길이다. 예비 용량이 남아 내릴 때(흐름 5 의 12)와 운영자의 `stop`(흐름 6)도 이 길이다.

## 미정

- 없음.

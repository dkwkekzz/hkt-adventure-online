# 흐름 3. 입장 — 클라이언트의 캐릭터 토큰

트리거: Api 의 `enter`. 캐릭터의 토큰 하나. 닫힌 뷰어가 돌아와 다시 부르는 것도 같다.
한 줄: 캐릭터가 설 존의 인스턴스에 세션을 잡고 게이트웨이의 주소를 준다. 빈 슬롯이 없으면 인스턴스를 띄우고, 띄울 곳도 없으면 대기열에 세운다.

## 순서

```text
A  Api.enter → Signer.verify → Admission.check → Sessions.get → ZoneMap.zoneOf → Placer.pick
     → Sessions.hold → Gates.pick → 답
     Placer.pick 이 없다고 하면 B, B 도 안 되면 Queue.push → 순번
B  Scheduler.place → Registry.put → Runner.start
     → SnapshotStore.pull → Ports.take → Spawner.host → Probe.read → Console.command → Spawner.agent
     → Registry.put
```

### A 세션을 잡는다

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Api.enter | 요청을 받는다. 이 API 서버의 빌드를 함께 넘긴다 | |
| 2 | Signer.verify | 캐릭터의 토큰을 푼다. 틀리면 거절 | Character.id |
| 3 | Admission.check | 그 캐릭터가 지금 들어와도 되는가(줄이 있는가 · 차단 · 한 계정에 세션 하나). 안 되면 거절 | |
| 4 | Sessions.get | 이미 세션이 있으면 그대로 8 로. 대기열에 있으면 Queue.position 의 순번을 답한다 | |
| 5 | ZoneMap.zoneOf | 설 존을 정한다 — 마지막에 있던 존, 없으면 처음 서는 존. 닫혀 있으면 거절 | Zone |
| 6 | Placer.pick | 그 존에서 같은 빌드이고 슬롯이 빈 인스턴스를 고른다. 없으면 B 로 | Instance |
| 7 | Sessions.hold | 세션을 `pending` 으로 잡는다 | Session |
| 8 | Gates.pick | 살아 있는 게이트웨이 하나를 고른다 | |
| 9 | Api.enter | `{page, gate}` 를 답한다. page 는 이 빌드의 뷰어 페이지, gate 는 게이트웨이의 주소 | 클라이언트 ◇ |

### B 인스턴스를 띄운다

예비 용량(흐름 5)과 장애 복구(흐름 12)도 이 길로 띄운다.

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 10 | Scheduler.place | 그 빌드를 들고 여유가 있는 노드와 인스턴스의 이름을 고른다. 없으면 15 대신 Queue.push | Node · 이름 |
| 11 | Registry.put | 줄을 적는다(세대를 하나 올려 `starting`). 띄우기 전에 적는다 | Instance |
| 12 | Runner.start | 그 노드에서 아래 13 ~ 17 을 차례로 한다 | |
| 13 | SnapshotStore.pull | 그 인스턴스의 Store 를 내려 받는다(없으면 빈 디렉터리) | Store 자리 |
| 14 | Ports.take | 포트 하나를 받는다 | |
| 15 | Spawner.host | 엔진의 호스트를 띄운다 | Process |
| 16 | Probe.read | 머리글의 마지막 줄을 기다린다(흐름 4) | 준비됨 |
| 17 | Console.command | NPC 묶음마다 `grant` 를 쓴다 | 명부 |
| 18 | Spawner.agent | NPC 에이전트를 띄운다 | Process |
| 19 | Registry.put | 줄을 `ready` 로, 포트를 적는다 | A 의 6 으로 |

## 실패하면

- 띄울 노드가 없으면 Queue.push 로 대기열에 세우고 순번을 답한다. 클라이언트는 다시 묻는다.
- 그 빌드를 띄울 노드가 아예 없으면(물러나는 빌드) 「페이지를 다시 받아라」로 거절한다.
- 호스트가 한계 안에 서지 않으면 줄을 `failed` 로 하고 다른 노드에 한 번 더 띄운다.
- 컨트롤 플레인에 닿지 않으면 503 — 클라이언트가 잠시 뒤 다시 묻는다.

## 멈추는 자리

- 세션이 `pending` 으로 잡혔다. 클라이언트가 게이트웨이의 주소를 든다. 또는 대기열의 순번.

## 이어지는 흐름

- 9 접속.

## 규칙

- 인스턴스에 배정하는 수는 세션이 센다. 잡힌 슬롯이 Zone.capacity 를 넘지 않는다. 세션 없이는 게이트웨이를 지날 수 없다(흐름 9).
- 뷰어와 호스트는 같은 빌드(엔진의 커밋)끼리만 만난다.
- NPC 묶음의 grant 는 인스턴스가 `ready` 가 되기 전이다.
- 클라이언트는 호스트의 주소를 받지 않는다.

## 미정

- 없음.

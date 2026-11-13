# plan 02 — 관측

상태: ☑ · 어디: online · 흐름 14

프로세스마다의 Monitor 가 듣고 있는가 · 수치를 답하고, 흐름의 단계가 지나간 흔적을 지금 흘린다. 관측 페이지는 구조(프로세스 넷 · 밖 · 연결 여덟)의 그림 위에 마디의 state 와 연결을 넘는 글을 그리고, 흐름은 그 그림 위의 길로 놓는다.

## 세운 것

| | 무엇 | 자리 |
|---|---|---|
| ☑ | 흔적 · 수치 · 지도의 선언 — Trace · TraceFn · Metrics · StreamHead · FlowMap | `src/protocol/observe.ts` |
| ☑ | 관측의 지도 — README 의 프로세스 넷 · 연결 여덟(짝 · 닿는 개념) · 개념이 사는 프로세스, 흐름 파일의 단계. 단계마다 흔적을 남기는가(traced) · 섰는가(stand — 섰다 · 대신 · 없다)와 그 흔적의 자리(sites) · 서지 않은 단계의 plan. plan/README.md 의 진행표(plans) | `src/apps/main/map.ts` |
| ☑ | Monitor — 내부 주소(`monitorPort`)의 `/health` · `/metrics` · `/observe`(text/event-stream) · `/observe/page`. recent · units · tally · readers. 느린 읽는 이의 몫만 버린다 | `src/apps/main/monitor.ts` |
| ☑ | 관측 페이지 — 프로세스 · 밖의 상자(state · 섰는 개념 · 지난 단계), 노드 서버 안의 인스턴스(state · 사람 · 포트), 연결(넘은 수 · 마지막 끝)과 그 위를 움직이는 글. 흐름 · run 을 고르면 마디마다의 # 과 연결마다의 # 으로 길이 놓이고 「재생」이 차례로 보낸다. 보기 둘 — 「서버」(프로세스 · 인스턴스의 state, 운영자의 명령, 기계의 흐름마다의 셈, 서버의 흐름, 서버의 글)와 「사람」(인스턴스마다 묶은 사람들 — 이름 또는 가명 · person · 세션, 고른 사람의 state 줄 · 그 사람의 길만 움직이는 그림 · 그 사람의 일생). 이름 · 가명 · 세션 · 인스턴스로 찾고 person 으로 거른다. `?from=` 으로 여러 Monitor, `#people` 이면 사람 보기로 | `src/apps/main/monitor-page.ts` |
| ☑ | 사람의 칸 — 단계를 부른 자리가 계정을 넘기면 Monitor 가 가명(who)으로 바꾼다. 로그인(2 의 2 · 4 · 5) · 입장(3 의 2 · 6 · 9 · 14) | Api · Fleet · Monitor |
| ☑ | 사람의 state(person) — login(2 의 5) · pending(3 의 9), 호스트의 status 에서 접속한 계정이 늘면 active · 줄면 grace(4 의 3), 호스트가 끝나면 gone(4 의 5) | Api · Shard |
| ☑ | 단계마다의 흔적 — 흐름 1(1 · 2 · 3 · 7) · 2(1 · 2 · 4 · 5) · 3(1 · 2 · 6 · 9 · 11 · 14 ~ 19) · 4(1 ~ 5) · 5(1 · 3 · 12) · 6(1 · 4 · 5) · 7(4 · 10) | Service · Api · Fleet · Shard · Operator |
| ☑ | 색인이 코드의 흔적 `(흐름, #)` 이 흐름의 표에 있는가를 본다 | `npm run index` |
| ☑ | `/health` 는 Api 에서 Monitor 로 옮겼다 | |
| ☑ | 진행도를 실제대로 — 단계는 섰다(실선) · 대신(빗금, 지금 하는 파일과 갈 plan) · 없다(흐림, 갈 plan). 흐름 막대는 섰다 · 대신을 따로. 프로세스는 제 프로세스 · main 에 조립 · 설계만, 상태 점은 개념이 선 정도(다 초록 · 일부 노랑 · 없음 회색). 서버 보기의 plan 진행표 — 고르면 그 plan 의 서지 않은 단계 | `src/apps/main/monitor-page.ts` |
| ☑ | 화면 확인 넷 — 서버 보기 · 대신이 있는 흐름의 길 · plan 진행표 · 사람 보기 | `npm run shot` |

## 대신 하는 단계

지금의 src 는 design 의 개념을 다 가르지 않았다(plan 01). 아래 단계는 설계의 개념 대신 지금의 코드가 그 일을 하고 흔적을 남긴다. 그 개념이 서는 plan 에서 흔적을 그 개념을 부르는 자리로 옮기고 이 줄에서 지운다.
단계의 줄은 관측의 지도가 셈한 「대신」과 같다 — `src/apps/main/tests/monitor.spec.ts` 가 그 목록을 든다. 개념이 서면 지도가 먼저 바뀌고, 그 검사와 이 표를 같은 커밋에서 고친다.

| 단계 | 지금 하는 코드 | 옮길 plan |
|---|---|---|
| 3 의 6 Placer.pick | `Fleet.enter` | 05 |
| 3 의 8 Gates.pick | `Fleet.enter`(게이트웨이 하나 — gateUrl) | 05 |
| 9 의 3 Sessions.get · 9 의 8 Sessions.activate | `Fleet.attach`(입장한 계정의 표) | 05 |
| 11 의 2 Sessions.suspend | `Fleet.detach`(유예 없음) | 05 |
| 3 의 11 · 19 Registry.put | `Shard.boot` | 07 |
| 3 의 17 · 5 의 1 Console.command | `Shard.boot` · `Fleet.tick` | 07 |
| 4 의 3 Runner.line · 4 의 5 Runner.exited | `Shard.line` · `Shard.exited` | 07 |
| 7 의 4 Runner.stop | `Shard.stop` | 07 |
| 5 의 12 Scaler.balance | `Fleet.tick` | 07 |
| 5 의 3 Backuper.backup | `Fleet.tick`(SnapshotStore.copy — 내려가 올린 세계만) | 07 |
| 7 의 5 Backuper.upload | `Shard.exited` → `Fleet`(SnapshotStore.push — 백업은 5 의 3 이 다음 주기에) | 07 |
| 6 의 4 (명령의 개념) | `Operator` | 08 |
| session | 입장의 run — 설계는 Session.id | 05 |

## 덧붙임

- 세션은 세션 모듈(plan 05) 전이라 입장의 run 을 그 사람의 세션으로 싣는다(3 의 9). active · grace 는 흐름 9 의 8 · 흐름 11 의 2 가 서기 전이라 노드가 본 사실(흐름 4 의 3)로만 — grace 의 유예와 gone(흐름 11 의 4)은 plan 04 · 05 가 선다. 캐릭터 이름(name)은 캐릭터(plan 05)가 서면 싣는다 — 지금 관측 페이지의 사람은 가명으로만 보인다.
- 개발의 main 은 프로세스 넷을 한 프로세스에 조립한다 — 관측 페이지는 그래도 넷을 따로 그리고(「main 에 조립」), 흔적이 하나도 놓이지 않는 프로세스(지금은 gateway)는 점선 상자다.

## 직관 확인

서비스를 띄우고 입장 한 번 — 관측 페이지(`http://localhost:8001/observe/page`)에서 글이 클라이언트 → api → control → node → 엔진으로 움직이고, 엔진 프로세스 안의 인스턴스가 ready 가 된다. 흐름 3 을 고르면 api(1 · 2 · 9) · control(3 ~ 8 · 10 · 11 · 19) · node(12 ~ 18)와 SessionRpc 3 · 9 · NodeRpc 12 · 19 · Engine 15 ~ 18 · Storage 13 의 길이 놓인다.

진행도: 흐름 4 를 고르면 3 · 5(Runner.line · Runner.exited)가 빗금 — 「대신 · shard → plan 07」, 6(Ports.free)이 흐림 — 「plan 07」. control 의 점은 노랑(개념 8 / 25). plan 진행표에서 07 을 펴면 그 plan 의 것인 서지 않은 단계(37, 대신 10)가 나온다.

```bash
npm run shot -- --viewer off --monitor http://localhost:8001    # observe · observe-flow · observe-plan · observe-people
```

## 이어지는 것

- 프로세스 넷의 Monitor 와 RPC 글에 실리는 run — plan 08.
- 새 개념의 단계마다 흔적 — 그 개념을 세우는 plan 마다.

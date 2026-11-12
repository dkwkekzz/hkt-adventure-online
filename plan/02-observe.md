# plan 02 — 관측

상태: ◐ · 어디: online · 흐름 14

프로세스마다의 Monitor 가 듣고 있는가 · 수치를 답하고, 흐름의 단계가 지나간 흔적을 지금 흘린다. 관측 페이지는 구조(프로세스 넷 · 밖 · 연결 여덟)의 그림 위에 마디의 state 와 연결을 넘는 글을 그리고, 흐름은 그 그림 위의 길로 놓는다.

## 세운 것

| | 무엇 | 자리 |
|---|---|---|
| ☑ | 흔적 · 수치 · 지도의 선언 — Trace · TraceFn · Metrics · StreamHead · FlowMap | `src/protocol/observe.ts` |
| ☑ | 관측의 지도 — README 의 프로세스 넷 · 연결 여덟(짝 · 닿는 개념) · 개념이 사는 프로세스, 흐름 파일의 단계. 단계마다 코드가 그 흔적을 남기는가(traced) | `src/apps/main/map.ts` |
| ☑ | Monitor — 내부 주소(`monitorPort`)의 `/health` · `/metrics` · `/observe`(text/event-stream) · `/observe/page`. recent · units · tally · readers. 느린 읽는 이의 몫만 버린다 | `src/apps/main/monitor.ts` |
| ☑ | 관측 페이지 — 프로세스 · 밖의 상자(state · 섰는 개념 · 지난 단계), 노드 서버 안의 인스턴스(state · 사람 · 포트), 연결(넘은 수 · 마지막 끝)과 그 위를 움직이는 글. 흐름 · run 을 고르면 마디마다의 # 과 연결마다의 # 으로 길이 놓이고 「재생」이 차례로 보낸다. 보기 둘 — 「서버」(프로세스 · 인스턴스의 state, 운영자의 명령, 기계의 흐름마다의 셈, 서버의 흐름, 서버의 글)와 「사람」(인스턴스마다 묶은 사람들 — 이름 또는 가명 · person · 세션, 고른 사람의 state 줄 · 그 사람의 길만 움직이는 그림 · 그 사람의 일생). 이름 · 가명 · 세션 · 인스턴스로 찾고 person 으로 거른다. `?from=` 으로 여러 Monitor, `#people` 이면 사람 보기로 | `src/apps/main/monitor-page.ts` |
| ☑ | 사람의 칸 — 단계를 부른 자리가 계정을 넘기면 Monitor 가 가명(who)으로 바꾼다. 로그인(2 의 2 · 4 · 5) · 입장(3 의 2 · 6 · 9 · 14) | Api · Fleet · Monitor |
| ☑ | 사람의 state(person) — login(2 의 5) · pending(3 의 9), 호스트의 status 에서 접속한 계정이 늘면 active · 줄면 grace(4 의 3), 호스트가 끝나면 gone(4 의 5) | Api · Shard |
| ☑ | 단계마다의 흔적 — 흐름 1(1 · 2 · 3 · 7) · 2(1 · 2 · 4 · 5) · 3(1 · 2 · 6 · 9 · 11 · 14 ~ 19) · 4(1 ~ 5) · 5(1 · 3 · 12) · 6(1 · 4 · 5) · 7(4 · 10) | Service · Api · Fleet · Shard · Operator |
| ☑ | 색인이 코드의 흔적 `(흐름, #)` 이 흐름의 표에 있는가를 본다 | `npm run index` |
| ☑ | `/health` 는 Api 에서 Monitor 로 옮겼다 | |

## 남은 것 — 진행도를 실제대로

지금의 페이지는 진행도를 실제보다 좋게 보인다. 흐름 막대는 대신 하는 단계도 세고, control · node 상자는 프로세스가 따로 없는데도 「듣는 중」이며, 「개념 섰다」는 파일이 있는가만 본다.

| | 무엇 |
|---|---|
| ☐ | 단계를 셋으로 — 개념 그대로 섰다(실선) · 다른 코드가 대신 한다(빗금) · 없다(흐림). 흐름 막대도 둘을 따로 칠한다. 지도가 단계마다 「흔적을 남기는 파일이 그 개념의 파일인가」를 든다 |
| ☐ | 프로세스를 셋으로 — 제 프로세스로 떴다 · main 에 조립 · 설계만. 상태 점의 색은 그 프로세스의 개념이 선 정도로(control 은 지금 3 / 25 — 노랑) |
| ☐ | 서버 보기에 plan 진행표 — plan 01 ~ 08 의 ☑ · ◐ · ☐ 과, 남은 단계가 어느 plan 의 것인가 |

## 대신 하는 단계

지금의 src 는 design 의 개념을 다 가르지 않았다(plan 01). 아래 단계는 설계의 개념 대신 지금의 코드가 그 일을 하고 흔적을 남긴다. 그 개념이 서는 plan 에서 흔적을 그 개념을 부르는 자리로 옮기고 이 줄에서 지운다.

| 단계 | 지금 하는 코드 | 옮길 plan |
|---|---|---|
| 3 의 6 Placer.pick | `Fleet.enter` | 05 |
| 3 의 11 · 19 Registry.put | `Shard.boot` | 07 |
| 3 의 17 · 5 의 1 Console.command | `Shard.boot` · `Fleet.tick` | 07 |
| 4 의 3 Runner.line · 4 의 5 Runner.exited | `Shard.line` · `Shard.exited` | 07 |
| 7 의 4 Runner.stop | `Shard.stop` | 07 |
| 5 의 12 Scaler.balance | `Fleet.tick` | 07 |
| 5 의 3 Backuper.backup | `Fleet.tick`(Vault 의 베낌) | 03 · 07 |
| 6 의 4 (명령의 개념) | `Operator` | 08 |
| person 의 active · grace | 4 의 3(노드가 본 status) — 설계는 9 의 8 · 11 의 2 | 04 · 05 |
| session | 입장의 run — 설계는 Session.id | 05 |

## 덧붙임

- 세션은 세션 모듈(plan 05) 전이라 입장의 run 을 그 사람의 세션으로 싣는다(3 의 9). active · grace 는 흐름 9 의 8 · 흐름 11 의 2 가 서기 전이라 노드가 본 사실(흐름 4 의 3)로만 — grace 의 유예와 gone(흐름 11 의 4)은 plan 04 · 05 가 선다. 캐릭터 이름(name)은 캐릭터(plan 05)가 서면 싣는다 — 지금 관측 페이지의 사람은 가명으로만 보인다.
- 개발의 main 은 프로세스 넷을 한 프로세스에 조립한다 — 관측 페이지는 그래도 넷을 따로 그리고(「main 에 조립」), 흔적이 하나도 놓이지 않는 프로세스(지금은 gateway)는 점선 상자다.

## 직관 확인

서비스를 띄우고 입장 한 번 — 관측 페이지(`http://localhost:8001/observe/page`)에서 글이 클라이언트 → api → control → node → 엔진으로 움직이고, 엔진 프로세스 안의 인스턴스가 ready 가 된다. 흐름 3 을 고르면 api(1 · 2 · 9) · control(3 ~ 8 · 10 · 11 · 19) · node(12 ~ 18)와 SessionRpc 3 · 9 · NodeRpc 12 · 19 · Engine 15 ~ 18 · Storage 13 의 길이 놓인다.

```bash
npm run shot -- --viewer off --monitor http://localhost:8001
```

## 이어지는 것

- 프로세스 넷의 Monitor 와 RPC 글에 실리는 run — plan 08.
- 새 개념의 단계마다 흔적 — 그 개념을 세우는 plan 마다.

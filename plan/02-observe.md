# plan 02 — 관측

상태: ☑ · 어디: online · 흐름 14

프로세스마다의 Monitor 가 듣고 있는가 · 수치를 답하고, 흐름의 단계가 지나간 흔적을 지금 흘린다. 관측 페이지는 design/01-flows 에서 뽑은 흐름의 지도 위에 그것을 칠한다.

## 세운 것

| | 무엇 | 자리 |
|---|---|---|
| ☑ | 흔적 · 수치 · 지도의 선언 — Trace · TraceFn · Metrics · StreamHead · FlowMap | `src/protocol/observe.ts` |
| ☑ | 흐름의 지도 — 흐름 파일의 머리 · 트리거 · 한 줄 · 순서 블록 · 머리가 # 인 표. 단계마다 그 개념이 src 에 파일로 섰는가(built) | `src/apps/main/map.ts` |
| ☑ | Monitor — 내부 주소(`monitorPort`)의 `/health` · `/metrics` · `/observe`(text/event-stream) · `/observe/page`. recent · units · tally · readers. 느린 읽는 이의 몫만 버린다 | `src/apps/main/monitor.ts` |
| ☑ | 관측 페이지 — 흐름 열넷의 칸(단계마다 하나), 고른 흐름의 순서와 단계 · 셈, 단위의 state, 최근의 run, 흔적의 기록. `?from=` 으로 여러 Monitor | `src/apps/main/monitor-page.ts` |
| ☑ | 단계마다의 흔적 — 흐름 1(1 · 2 · 3 · 7) · 2(1 · 2 · 4 · 5) · 3(1 · 2 · 6 · 9 · 11 · 14 ~ 19) · 4(1 ~ 5) · 5(1 · 3 · 12) · 6(1 · 4 · 5) · 7(4 · 10) | Service · Api · Fleet · Shard · Operator |
| ☑ | 색인이 코드의 흔적 `(흐름, #)` 이 흐름의 표에 있는가를 본다 | `npm run index` |
| ☑ | `/health` 는 Api 에서 Monitor 로 옮겼다 | |

- 지금의 src 는 design 의 개념을 다 가르지 않았다(plan 01). 설계의 개념이 아직 파일로 서지 않은 단계(Registry.put · Console.command · Runner.line · Placer.pick · Scaler.balance · Backuper.backup)는 그 일을 하는 지금의 코드가 흔적을 남긴다. 관측 페이지는 그 단계를 점선으로 그린다. 그 개념이 서면 그 개념을 부르는 자리로 흔적이 옮겨 간다.

## 직관 확인

서비스를 띄우고 입장 한 번 — 관측 페이지(`http://localhost:8001/observe/page#3`)의 흐름 3 에 1 · 2 · 14 · 11 · 15 · 16 · 17 · 18 · 19 · 9 가 한 run 으로 칠해지고 단위 `<world>` 가 ready 가 된다.

```bash
npm run shot -- --viewer off --monitor http://localhost:8001
```

## 이어지는 것

- 프로세스 넷의 Monitor 와 RPC 글에 실리는 run — plan 08.
- 새 개념의 단계마다 흔적 — 그 개념을 세우는 plan 마다.

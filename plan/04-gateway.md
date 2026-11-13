# plan 04 — 게이트웨이

상태: ☑ · 어디: online · design/02-roles/gateway.md · 흐름 9 · 11

클라이언트는 게이트웨이의 주소 하나로 붙고, 게이트웨이가 호스트에 잇는다. 첫 글(`Host 2`)의 자격만 읽고 바꾼다.

## 세운 것

| | 무엇 | 자리 |
|---|---|---|
| ☑ | 게이트웨이 소켓 · SessionRpc 의 선언 — GatewaySocket · GatewayConfig, Attach · Detach · Report · GateReport | `src/protocol/gateway.ts` · `session.ts` |
| ☑ | Acceptor · Connection — 소켓을 받아 첫 글(`Host 2`)의 토큰으로 누구인지 알고(4001 · 4002), 같은 캐릭터의 옛 접속은 4000, attach 가 준 호스트에 새 토큰으로 잇고 글을 그대로 넘긴다. 호스트 쪽이 닫히면 엔진의 코드는 그대로, 그 밖은 rerouteMs 를 기다려 1001 | `src/gateway/` |
| ☑ | RateLimiter · Keepalive — 한 주소의 접속 수(429), 글의 크기 · 빈도(버리고 센다), ping 에 답이 없으면 1001 | `src/gateway/` |
| ☑ | GateReporter — 흐름 1 의 5 · 5 의 6 · 7 의 7. 받는 쪽(Gates.seen)은 plan 05 — 지금은 흔적만 | `src/gateway/` |
| ☑ | 입장의 답이 게이트웨이의 주소(`gate`) — 호스트의 주소는 클라이언트에게 가지 않는다. 뷰어 페이지의 `?ws=` 도 게이트웨이 | `Shard.address` · `protocol/api.ts` |
| ☑ | SessionRpc 의 대신 — Fleet.attach(흐름 9 의 3 · 8 · 9: 입장한 계정이고 세계가 ready 면 호스트의 내부 주소와 새 토큰) · Fleet.detach(11 의 2). 사람의 active · grace 는 여기서. 4 의 3 은 맞춰 보기로만 | `src/fleet/fleet.ts` |
| ☑ | 흐름 1 의 4 · 5, 5 의 5 · 6, 7 의 7 · 8, 9 의 1 · 2 · 3 · 8 ~ 11, 11 의 1 · 2 의 흔적 | |
| ☑ | 경계 규칙 G — gateway/** 은 protocol/ 만. P 에 gateway.listen · close, fleet.attach · detach | `src/tools/boundary/` |

## 관측에 보이는 것

- gateway 상자가 점선(설계만)에서 실선으로 — 「main 에 조립 · 듣는 중」, 「개념 6 / 6 섰다」, 점은 초록.
- Link 연결(클라이언트 — 게이트웨이 — 엔진)에 글이 지나고, Api 의 답 뒤 사람의 글이 게이트웨이를 거친다.
- 흐름 9 · 11 의 흔적 — 사람 보기의 person 이 9 의 8(active) · 11 의 2(grace)에서 온다. 4 의 3(노드가 본 status)은 맞춰 보기로만 남긴다.
- 흐름 막대 9 · 11 이 0 에서 오른다 — 9 는 섰다 5 · 대신 2 / 11, 11 은 1 · 1 / 6.

## 덧붙임

- 세션 모듈(plan 05) 전이라 세션은 입장한 계정의 표(Fleet.entered)로 대신한다 — 재접속 유예(graceMs)와 그 만료(11 의 3 ~ 6)는 없다. 세계가 떠 있는 동안 입장한 계정은 다시 붙을 수 있다.
- 다른 호스트로 뒤를 바꿔 잇는 Connection.reroute(흐름 10 의 12 · 12)는 plan 07 이 세운다 — 지금 호스트 쪽이 닫히면 rerouteMs 를 기다리고 1001 로 닫는다.
- 게이트웨이는 지금 하나(`gate-1`, Gates.pick 의 대신 — 3 의 8). 컨트롤 플레인의 Gates · reroute · kick 은 plan 05 · 07 · 08.
- 소켓은 `ws` 로 — 런타임 의존이 둘(mongodb · ws)이다.

## 직관 확인

클라이언트가 게이트웨이의 주소 하나로 붙고, 세션 없이 붙으면 4002. 관측 페이지의 흐름 9 가 칠해진다.
`npm run shot -- --monitor http://localhost:8001` — 뷰어(브라우저)가 `?ws=ws://localhost:8002` 로 붙어 묶음을 받고, 진짜 엔진 위의 조립(`engine.spec.ts`)이 게이트웨이를 지나 셋이 각자의 묶음을 받고 입장 없이는 4002 를 받는다.

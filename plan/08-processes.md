# plan 08 — 프로세스 넷

상태: ☐ · 어디: online · design/README.md 의 「프로세스 넷」 · 흐름 1 · 5 · 6 · 7 · 13 · 14

`main` 하나에 조립한 것을 api · gateway · control · node 넷으로 갈라 띄운다. 소켓이 함수 부름에서 내부망의 글이 된다.

## 세울 것

| | 무엇 |
|---|---|
| ☐ | 노드 — Runner · NodeReporter, 컨트롤 플레인의 Nodes · Reconciler, NodeRpc. 노드의 시작(흐름 1 의 8 · 9 — Runner.reap · Loader.recover)과 내려감(흐름 7 의 1 · 2 — 사람을 다른 노드로 옮기는 Mover.move) |
| ☐ | SessionRpc — API 서버 · 게이트웨이 ↔ 컨트롤 플레인 |
| ☐ | 운영자 — 흐름 6 의 명령 전부(세션의 `close` · `open` — ZoneMap, `kick` — Router, `ban` · `unban` — Banlist 를 포함), 운영자의 토큰(`OPERATOR_KEY` — Signer.verify, 흐름 6 의 2) · audit |
| ☐ | 컨트롤 플레인의 Clock — 흐름 5 의 C 를 한 간격에(지금은 세션 모듈 · 플릿이 제 간격을 든다), Directory.sweep(흐름 5 의 15 — 하루에 한 번) |
| ☐ | Elector — LeaderLock 과 term. 흐름 13 |
| ☐ | 관측 — 프로세스마다의 Monitor, SessionRpc · NodeRpc 의 글에 실리는 run, 관측 페이지의 `?from=` 으로 넷을 함께 |

## 관측에 보일 것

- 상자마다 제 Monitor — 「main 에 조립」이 아니라 그 프로세스의 state. 관측 페이지 하나가 `?from=` 으로 넷을 함께 읽고, 한 프로세스를 내리면 그 상자만 끊김이 된다.
- SessionRpc · NodeRpc 의 글에 run 이 실려 프로세스를 넘는 실행이 한 run 으로 이어진다.
- 흐름 1 · 7 의 role 마다의 단계, 흐름 13(전환) — 활성 · 대기가 control 상자에 보인다. 흐름 6 의 2 · 3(운영자의 토큰 · audit).

## 직관 확인

두 서버의 노드가 한 컨트롤 플레인에 알리고, 한 서버를 끄면 사람이 다른 서버로 옮겨진다. `close` · `drain` 으로 엔진을 바꿔 띄우는 동안 사람이 끊기지 않는다. 활성을 죽이면 대기가 잡고 붙어 있던 사람은 끊기지 않는다. 프로세스 넷의 `/metrics` 에 세션 수 · 틱 지연이 찍히고, 관측 페이지 하나가 넷의 흔적을 한 run 으로 잇는다.

# plan 08 — 프로세스 넷

상태: ☑ · 어디: online · design/README.md 의 「프로세스 넷」 · 흐름 1 · 5 · 6 · 7 · 12 · 13 · 14

`main` 하나에 조립한 것을 api · gateway · control · node 넷으로 갈라 띄운다. 소켓이 함수 부름에서 내부망의 글이 된다. `main` 은 그대로 넷을 한 프로세스에 조립한 것이다 — 흐름은 같고 글이 함수 부름일 뿐.

## 세울 것

| | 무엇 |
|---|---|
| ☑ | 노드 — NodeAgent(Runner · NodeReporter · Console · Loader · Backuper — `src/node/node-agent.ts`), 컨트롤 플레인의 Nodes · Node · Reconciler, NodeRpc(`src/protocol/node.ts` — NodeSocket · ControlSocket). 노드의 시작(흐름 1 의 7 ~ 11 — Spawner.missing · Runner.reap · Loader.recover · 알림)과 내려감(흐름 7 의 1 ~ 6 — 컨트롤 플레인이 사람을 다른 노드로 옮기고, 비거나 한계가 지나면 남은 값을 내리고 Store 를 올린다) |
| ☑ | SessionRpc — API 서버 · 게이트웨이 ↔ 컨트롤 플레인(`src/apps/main/rpc.ts` — `POST /rpc/<이름> {args, run, term}`). 활성은 스토리지의 자리(LeaderLock.holder)로 찾고, 대기는 503 으로 돌려보낸다. 받는 쪽은 낮은 term 의 글을 409 로 버린다 |
| ☑ | 운영자 — 흐름 6 의 명령 전부(nodes · instances · start · drain · undrain · stop · remove · host · backup · restore · purge · close · open · cordon · uncordon · forget · kick · ban · unban · versions · rollback), 운영자의 토큰(`OPERATOR_KEY` — `o<이름>`, 설정의 `operators`, 흐름 6 의 2) · audit(그 이름). 밖에서는 `POST /operator` |
| ☑ | 컨트롤 플레인의 Clock — 흐름 5 의 C 를 한 간격에(세션 모듈의 간격은 `tick` 이 되었다), Directory.sweep(흐름 5 의 15 — 하루에 한 번) |
| ☑ | Elector — LeaderLock 과 term. 흐름 13(잡으면 표를 다시 읽고 보고에서 세션을 다시 세운다 — settling, 알던 노드가 다 알렸거나 settleMs 가 지나면 active, 늦추지 못하면 standby) · 흐름 7 의 9(resign) |
| ☑ | 관측 — 프로세스마다의 Monitor(`/health` 는 컨트롤 플레인이면 활성 · 대기도), 글에 실리는 run, 관측 페이지의 `?from=` 으로 넷을 함께(같은 run 은 어느 Monitor 의 것이든 한 실행, 같은 role 은 수 · 활성 · 대기, 같은 인스턴스는 하나로, 노드는 따로). `npm run shot -- --from …` |

## 관측에 보일 것

- 상자마다 제 Monitor — 「main 에 조립」이 아니라 그 프로세스의 state. 관측 페이지 하나가 `?from=` 으로 넷을 함께 읽고, 한 프로세스를 내리면 그 상자만 끊김이 된다(한 번도 닿지 않은 Monitor 는 머리에 「닿지 않는다」).
- SessionRpc · NodeRpc 의 글에 run 이 실려 프로세스를 넘는 실행이 한 run 으로 이어진다 — 사람 보기의 길이 api → control → node → gateway 를 잇는다.
- 흐름 1 · 7 의 role 마다의 단계, 흐름 13(전환) — 활성 · 대기가 control 상자에 보인다(`× 2 · 활성 1 · 대기 1`). 흐름 6 의 2 · 3(운영자의 토큰 · audit).

## 직관 확인

두 서버의 노드가 한 컨트롤 플레인에 알리고, 한 서버를 끄면 사람이 다른 서버로 옮겨진다. `close` · `drain` 으로 엔진을 바꿔 띄우는 동안 사람이 끊기지 않는다. 활성을 죽이면 대기가 잡고 붙어 있던 사람은 끊기지 않는다. 프로세스 넷의 `/metrics` 에 세션 수 · 틱 지연이 찍히고, 관측 페이지 하나가 넷의 흔적을 한 run 으로 잇는다.

시험: `src/apps/main/tests/split.spec.ts`(가짜 엔진 — 노드 둘 · 컨트롤 플레인 둘을 한 시험 프로세스에 role 마다, 노드를 내리면 옮겨진다 · 활성을 내리면 대기가 잡는다 · `/operator`), `elector.spec.ts`, 세션의 Reconciler.

진짜 엔진 위에서는 한 서버에 여섯을 같은 디렉터리 스토리지로 띄운다:

```bash
export HOST_AUTH_KEY=k OPERATOR_KEY=o SERVICE_STORAGE=/tmp/hkt
MONITOR_PORT=8101 CONTROL_PORT=8010 npm start -- --role control
MONITOR_PORT=8102 CONTROL_PORT=8013 npm start -- --role control
MONITOR_PORT=8103 NODE_PORT=8011 NODE_NAME=node-1 NODE_PORTS=3100-3149 npm start -- --role node
MONITOR_PORT=8104 NODE_PORT=8014 NODE_NAME=node-2 NODE_PORTS=3150-3199 npm start -- --role node
MONITOR_PORT=8105 GATE_RPC_PORT=8012 npm start -- --role gateway
MONITOR_PORT=8106 npm start -- --role api
npm run shot -- --viewer off --monitor http://localhost:8106 --from http://localhost:8101,http://localhost:8102,http://localhost:8103,http://localhost:8104,http://localhost:8105,http://localhost:8106
```

사람 둘이 node-1 의 main-1 에 붙은 채 node-1 을 SIGTERM 하면 node-2 에 main-2 가 서고 둘이 옮겨진다(접속은 그대로, 게이트웨이가 다시 이어 Link 1 을 한 번 더 받는다). main-1 은 `stopped`. node-1 을 다시 띄우고 `drain main-2` 면 둘이 node-1 의 main-1 로 옮겨지고 main-2 는 `stopped`. 활성 control 을 `kill -9` 하면 대기가 term 2 로 잡고 보고에서 세션 둘을 다시 세운다 — 접속은 끊기지 않고 새 입장도 받는다.

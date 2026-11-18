# plan 07 — 인스턴스 여럿

상태: ☑ · 어디: online · design/02-roles/fleet.md · session.md · gateway.md · 흐름 3 의 B · 4 · 5 · 7 의 3 ~ 6 · 9 · 10 · 11 · 12

캐릭터의 값이 인스턴스 사이를 옮겨 다니고, 한 존에 인스턴스가 여럿 선다. plan 06 의 엔진의 면(`--handoff` · `load` · `unload` · `keep` · `backup` · 떠남 줄 · 뷰어의 다시 열림)에 기댄다.
노드는 아직 이 서버의 것 하나이고 같은 프로세스에 있다 — NodeRpc 는 함수 부름(노드 여럿은 plan 08).

## 세운 것

| | 무엇 | 자리 |
|---|---|---|
| ☑ | 캐릭터의 값 — Loader(load · unload · save). 호스트는 건넴 자리(`<spool>/<인스턴스>` — 엔진의 `--handoff`)를 들고, 값은 Leases(holder `<인스턴스>@<세대>`)를 쥔 인스턴스만 든다. 흐름 9 의 4 ~ 7(접속이 pending 이면 올린다) · 10 의 4 ~ 7 · 11 의 3(유예가 지나면 내려 저장한다) · 5 의 2(`keep` 하고 lease 를 늦추고 바뀐 값만 쓴다 — lease 를 잃으면 내리고 버린다) · 3 의 3(같은 계정의 다른 캐릭터에 내보낸 세션의 값도 내린다) | `src/fleet/loader.ts` · `session/index.ts` · `session/admission.ts` |
| ☑ | 인스턴스 여럿 — Shard · Assignment 를 Registry(표 `instances` — 이름 `<존>-<번호>` · 존 · 노드 · 포트 · 세대 · 빌드 · state · draining · restarts) · Instance · Scheduler(노드의 slots · 빌드, 내려가 있는 이름을 다시 쓴다) · Runner(서버마다 호스트 · 에이전트 · 사람 수 · 지연) · Console 로 갈랐다. Scaler(예비 용량 `spare` · 쉬는 인스턴스 · 다 비운 인스턴스) · Recoverer(흐름 12) · Backuper(도는 호스트는 엔진의 `backup` 사본을, 내린 것은 Store 자리를 올리고 백업을 남긴다 — `backupKeep`) | `src/fleet/` |
| ☑ | 존 이동 — 세션의 Mover(흐름 10 · 12 의 5) · Router.reroute · Sessions.reserve · move · Placer.pick(지금의 인스턴스는 빼고), 게이트웨이의 Connection.reroute(SessionRpc reroute — 클라이언트의 소켓은 그대로, rerouting 의 글은 버린다). 떠남 줄은 노드의 handoff 로 컨트롤 플레인에, 운영자의 `drain` 은 비움으로 | `src/session/mover.ts` · `src/gateway/connection.ts` |
| ☑ | 운영자 — 플릿의 명령을 흐름 6 의 이름으로: `instances [zone]` · `start <zone>` · `drain` · `undrain` · `stop` · `remove` · `host` · `backup` · `restore` · `purge <instance>`. 나머지(노드 · 세션 · 계정 · 캐릭터)와 운영자의 토큰은 plan 08 | `src/fleet/operator.ts` · `protocol/operator.ts` |
| ☑ | 설정 — 존의 줄 `zones`(이름 · 데이터셋 · 상한 `capacity` · 예비 `spare` · NPC 묶음 `npc`, 처음 서는 존은 첫 줄), 노드 `fleet.node`(이름 · `slots`), `fleet.backupKeep`. 건넴 자리는 스토리지 뿌리의 `spool/` | `service.config.json` · `apps/main/config.ts` |
| ☑ | 흐름 3 의 B · 4 · 5 의 1 ~ 3 · 12 · 7 의 3 ~ 6 · 9 · 10 · 12 의 흔적을 그 개념을 부르는 자리에서 — plan 02 의 「대신 하는 단계」에서 3 의 11 · 17 · 19, 4 의 3 · 5, 5 의 1 · 3 · 12, 7 의 4 · 5 를 지웠다 | |

## 관측에 보이는 것

- 노드 서버 안에 인스턴스가 여럿(`main-1` · `main-2` …), 인스턴스마다 state · 사람 수 · 세션 수 · 지연. 사람 보기의 인스턴스 묶음도 여럿이 된다.
- 흐름 10(존 이동 · 비움) — 한 run 에 10 의 1 ~ 12, 갈 곳이 없으면 흐름 3 의 B 도 같은 run. 흐름 12(장애 복구) — 4 의 4 ~ 6 → 12 의 1 ~ 5 → 3 의 B → 10 의 2 · 3 · 8 ~ 12.
- Loader 의 단계(9 의 5 ~ 7 · 10 의 5 ~ 7 · 5 의 2)가 Storage 연결에 글을 더한다.

## 덧붙임

- 노드의 시작(흐름 1 의 8 · 9 — Runner.reap · Loader.recover)과 노드가 내려갈 때 사람을 다른 노드로 옮기는 것(흐름 7 의 1 · 2)은 노드가 여럿이어야 뜻이 있다 — plan 08. 지금 서비스가 내려가면 게이트웨이가 접속을 닫고(1001) 노드가 로드된 값을 전부 내려 저장한 뒤 호스트를 내린다(흐름 7 의 3 ~ 6).
- 앞 plan 의 표 `instances` 의 줄(존이 없다 — 세계 하나가 `main`)은 건너뛴다 — 그 세계의 Store 는 `main` 의 이름으로 남고, 새 인스턴스는 `main-1` 부터 새로 선다. 캐릭터의 값은 이제 세계의 Store 가 아니라 CharacterStore 에 있다(엔진의 `--handoff` — 시작 때 세계의 저장에서 되찾은 낳은 묶음을 지운다).
- Reconciler(흐름 5 의 9 — 보고와 세션을 맞춘다)는 plan 08. 그래서 운영자가 아닌 길로 세션 없이 남은 값은 지금 없다 — 세션을 지우는 자리(유예 만료 · 내보냄 · 이동의 실패)가 모두 내린다.
- 게임의 세계(숲길)에는 아직 떠나는 자리가 없다(엔진의 피드백 192). 흐름 10 의 떠남은 시험(가짜 엔진의 떠남 줄)으로, 진짜 엔진 위에서는 같은 길인 `drain` 으로 확인한다.

## 직관 확인

호스트를 죽여도 캐릭터가 마지막으로 저장한 값으로 다시 선다. 한 존의 두 인스턴스 사이로 사람이 옮겨지고(`drain`) 접속이 끊기지 않는다 — 관측 페이지의 흐름 10 이 한 run 으로 칠해진다.

```bash
npx vitest run src/apps/main/tests/engine.spec.ts    # 진짜 엔진 — 상한 1 의 존에 둘 → 인스턴스 둘, drain → 다른 인스턴스로(열림이 다시 온다 · 소켓은 그대로), 호스트를 죽인다 → 같은 이름으로 다시 떠 값으로 선다
npm run shot -- --viewer off --monitor http://localhost:8001 --flow 10    # 서비스를 상한 1 로 띄우고 둘이 들어간 뒤 운영자가 drain main-1
```

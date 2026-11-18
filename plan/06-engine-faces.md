# plan 06 — 엔진의 면

상태: ☑ · 어디: proto · online · design/README.md 의 「엔진의 면」 · 흐름 4 · design/02-roles/fleet.md 의 Probe

서비스가 캐릭터의 값을 옮기고 존을 옮기는 데 기대는 엔진의 면. 엔진에 서고(엔진 plan 267 ~ 270 — 엔진의 main), 그 커밋을 `engine.lock` 에 핀했다. `ONLINE.md` §1 을 다시 읽어 `src/protocol/engine.ts` 에 베꼈다.

## 세운 것

| | 엔진 plan | 무엇 | 서비스의 자리 |
|---|---|---|---|
| ☑ | 267 | 통째 저장 · Console `backup <dir>` — 다음 창 끝의 저장을 dir 에 통째로 베끼고 `backup 끝 — <dir> · now N`(또는 `backup 실패 — …`) | `protocol/engine.ts` 의 `BACKUP_DONE` · `BACKUP_FAILED` · 답 글 `ANSWER_HEAD.backup`. Probe.read 의 `backed` |
| ☑ | 268 | `--handoff <dir>` · `load` · `unload` · `keep` | `HostArgs.handoff` · `hostArgv`, 명령 열둘 `CONSOLE_COMMANDS`, 답 글 `LOAD_DONE` · `UNLOAD_DONE` · `KEEP_DONE` · `HANDOFF_REFUSED` |
| ☑ | 269 | 떠남 줄 `떠남 — <account> → <to>` · status 의 꼬리 ` · 지연 N` | `DEPART_LINE` · `STATUS_LAG` · `StatusLine.lag`. Probe.read 의 `handoff` · status 의 지연 |
| ☑ | 270 | 뷰어의 다시 열림 · `?exit=` | 뷰어 묶음 안의 일 — 서비스의 코드는 그대로. 쓰는 것은 plan 07(Connection.reroute) · 08 |
| ☑ | — | Runner.line — 떠남 · backup 끝 줄과 사람 수 · 지연을 바꾼 status 가 흐름 4 의 1 ~ 3 의 흔적. 4 의 3 의 counts 는 status 면 `players` · `beats` · `lag`, backup 끝이면 `backup`(그 now), 떠남이면 `departed`(맡은 이가 있으면 1). 흐름 5 의 1 의 counts 에도 `lag` | `src/fleet/runner.ts` · `fleet.ts` · `probe.ts` |

## 관측에 보이는 것

- 서버 보기의 인스턴스 줄(엔진 상자의 인스턴스 · 오른쪽 목록)에 `지연 Nms` — 흐름 5 의 1 · 4 의 3 의 counts 의 `lag`.
- 운영자가 `host <세계> backup <dir>` 을 치면 흐름 4 의 1 ~ 3 이 node 에서 칠해지고, 4 의 3 의 counts 에 `backup`(베낀 저장의 now).
- 떠남 줄은 지금 게임의 세계에 떠나는 자리가 없어(엔진의 피드백 192) 오지 않는다. 오면 4 의 1 ~ 3 과 서비스의 기록에 남는다 — 컨트롤 플레인에 알리는 것(흐름 10)은 plan 07.

## 덧붙임

- 서비스는 아직 `--handoff` 를 주지 않는다 — 캐릭터의 값을 서비스가 들기(Loader · CharacterStore — 흐름 9 의 4 ~ 7)는 plan 07. 그때 Spawner.host 가 `--handoff <spool>` 을 준다(fleet.md 의 Spawner).
- 백업은 아직 내려가 올린 세계의 Store 를 베낀다(plan 02 의 「대신」 5 의 3). 도는 호스트의 `backup` 으로 올리는 Backuper 는 plan 07.
- 가짜 엔진(`src/fleet/tests/fixtures/fake-engine.mjs`)은 지연 꼬리와 `backup` 을 엔진처럼 하고, 시험의 손 `lag N` · `depart <account> <to>` 로 지연과 떠남 줄을 낸다.

## 직관 확인

엔진 체크아웃(`engine/web`)에서 엔진의 `npm run check`, 그리고 건넴 — 한 호스트에서 `unload` 한 묶음이 다른 호스트에 `load` 로 그대로 선다.

```bash
cd engine/web && npm run check
cd engine/web && npx tsx tools/peek/handoff-check.ts "$(mktemp -d)/hand"
npx vitest run src/fleet src/apps/main/tests/engine.spec.ts    # 진짜 엔진 위에서 지연 꼬리 · backup 끝 줄
npm run shot -- --viewer off --monitor http://localhost:8001    # 서비스를 띄우고 한 사람이 붙은 뒤 운영자가 host main backup <dir>
```

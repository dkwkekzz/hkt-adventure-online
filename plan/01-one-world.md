# plan 01 — 세계 하나

상태: ☑ · 어디: proto · online

세계 하나 · 프로세스 하나(`main`)의 서비스. 사람은 모두 같은 세계에 붙고 계정마다 사람의 묶음 하나를 맡는다. 입장의 한계는 capacity 뿐.
지금의 src 는 이 plan 의 모양이다 — 함대는 `Fleet` · `Shard` · `Assignment` 이고, design 의 Registry · Runner · Console 의 일을 Shard 가 한다. 그 개념들은 plan 07 · 08 이 가른다.

## 세운 것

| | 어디 | 무엇 | 직관 확인 |
|---|---|---|---|
| ☑ | proto | 엔진의 Gate — `HOST_AUTH_KEY` 로 토큰을 검증, 키가 없으면 더미. 뷰어 `?token=` · 에이전트 `--token`(엔진 plan 259). 사람의 묶음 `--party`(엔진 plan 260) | 엔진의 `npm run check`. 키를 준 호스트에 이름 글로 붙으면 4002, 서명된 토큰으로 붙으면 open |
| ☑ | online | 설계 — `design/README.md` · `method.md` · `01-flows` · `02-roles`, 설계 색인(`npm run index`) | 흐름의 단계 `개념.기능` 이 전부 책임에 있다 |
| ☑ | online | 저장장치 — 볼륨 하나 위의 Store 자리와 표. 지금은 plan 03 의 스토리지 | `src/storage/tests` |
| ☑ | online | 계정 — Directory · Identity · Account · Signer · Token. 게스트 신원 | 토큰 하나로 엔진의 호스트에 `Host 2` 로 붙으면 open (`src/apps/main/tests/engine.spec.ts`) |
| ☑ | online | 함대 — Fleet · Shard · Assignment · Ports · Spawner · Process · Probe · Clock · Operator. 뷰어는 한 번 묶고 Static 이 준다 | 세계를 띄워 브라우저가 묶음을 맡고 NPC 가 움직인다(`npm run shot`). `stop` 뒤 다시 띄우면 `저장된 세계에서 이어간다` |
| ☑ | online | main 앱 — Service.start · stop, http 의 login · enter · 게스트 페이지, stdin 의 Operator | 셋이 같은 세계에 붙어 각자의 묶음을 받는다. 쉬면 내려가고 다시 오면 이어진다 (`engine.spec.ts`) |
| ☑ | online | 경계 검사 — 규칙 S · A · T · F · P · N · E. `npm run check` 의 앞단 | 규칙을 하나 어긴 import 를 넣으면 1 로 끝난다 (`src/tools/boundary/tests`) |

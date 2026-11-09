# plan — design 을 src 에 세우는 순서와 상태

stage 하나 = 책임 하나 또는 도구 하나. 흐름은 책임이 서면 선다.
한 바퀴: 읽기(진행표의 첫 ☐ · ◐ → 그것이 가리키는 design 의 파일) → 구현(책임의 개념과 흐름의 단계 그대로) → 검증(`npm run check` 와 직관 확인 하나) → 갱신(이 표 · 설계) → 닫기(커밋 · PR).
직관 확인은 스크립트 하나이고 사람이 글 또는 화면으로 본다.

엔진 쪽 stage(어디 = proto)는 엔진 저장소에 PR 로 들고, 들어간 커밋을 `engine.lock` 에 핀한다.
지금의 핀은 stage 1 의 엔진 PR(dkwkekzz/hkt-adventure-proto#136 — `web/ONLINE.md` 의 PR #132 위에 쌓였다)의 커밋이다. 둘이 엔진의 main 에 들어가면 `engine.lock` 을 main 의 그 커밋으로 옮긴다.

| stage | 어디 | 세우는 것 | 직관 확인 | 상태 |
|---|---|---|---|---|
| 1 책임 — 엔진의 Gate | proto | 엔진 `ONLINE.md` §3.2 ①. Gate 가 `HOST_AUTH_KEY` 로 토큰을 검증하고, 키가 없으면 더미. 뷰어 `?token=` · 에이전트 `--token` | 엔진의 `npm run check`. 키를 준 호스트에 이름 글로 붙으면 4002, 서명된 토큰으로 붙으면 open | ☑ |
| 2 설계 — design 의 둘 | online | `design/README.md` · `method.md` · `01-flows/01 ~ 07` · `02-roles/account · fleet · storage` | `npm run index` — 흐름의 단계 `개념.기능` 이 전부 책임 파일(또는 README 의 앱)에 있는가 | ☑ |
| 3 책임 — 저장장치 | online | Vault · Ledger. 볼륨 하나 위 | `npm run check`. `src/storage/tests` 가 자리를 내고 베끼고 되돌린다 | ☑ |
| 4 책임 — 계정 | online | Directory · Identity · Account · Signer · Token. 게스트 신원부터 | 토큰 하나를 만들어 stage 1 의 호스트에 `Host 2` 로 붙으면 open (`src/apps/main/tests/engine.spec.ts`) | ☑ |
| 5 책임 — 함대 | online | Fleet · Shard · Assignment · Ports · Spawner · Process · Probe · Clock · Operator. 흐름 3 · 4 · 5 · 6 이 선다 | 한 계정의 샤드를 띄워 브라우저가 요정 넷을 맡고 NPC 가 움직인다(`npm run shot`). `stop` 뒤 다시 띄우면 `저장된 세계에서 이어간다` | ☑ |
| 6 앱 — main · Api | online | Service.start · stop, http 의 login · enter · 게스트 페이지, stdin 의 Operator. 흐름 1 · 2 · 7 이 선다 | 두 계정이 각자의 샤드에 붙고 서로 보이지 않는다. 쉬면 내려가고 다시 오면 이어진다 (`engine.spec.ts`) | ☑ |
| 7 도구 — 경계 검사 | online | `src/tools/boundary` — 규칙 S · A · T · F · P · N · E. `npm run check` 의 앞단 | 규칙을 하나 어긴 import 를 넣으면 1 로 끝난다 (`src/tools/boundary/tests`) | ☑ |
| 8 책임 — 저장장치 · 객체 저장소 | online | Vault 의 둘째 구현(멈춤 뒤 동기화). 모양은 같다 | 다른 기계에서 같은 사본으로 띄우면 이어진다 | ☐ |
| 9 책임 — 함대 · 공용 정적 페이지 | online | 샤드는 `npm run host`, 페이지 · 묶음 · 실물은 앱 하나가 `?ws=` 로 (피드백 3) | 뷰어가 다른 주소의 샤드에 붙는다 | ☐ |
| 10 책임 — gateway | online | 엔진 `ONLINE.md` §2.7 의 조건이 설 때만. 흐름 하나(통과) · 모듈 하나 | — | ☐ |
| 11 컨텐츠 — 플레이어 묶음 K | proto | 한 세계에 여럿이 보이려면(피드백 2) | — | ☐ |

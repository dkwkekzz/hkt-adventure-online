# plan — design 을 src 에 세우는 순서와 상태

stage 하나 = 책임 하나 또는 도구 하나. 흐름은 책임이 서면 선다.
stage 1 ~ 12 는 세계 하나 · 프로세스 하나의 서비스를 세웠다. 지금의 design(존 × 인스턴스 · 프로세스 넷)에 닿으려면 ☐ 가 남아 있다 — src 는 ☑ 까지의 모양이다.
한 바퀴: 읽기(진행표의 첫 ☐ · ◐ → 그것이 가리키는 design 의 파일) → 구현(책임의 개념과 흐름의 단계 그대로) → 검증(`npm run check` 와 직관 확인 하나) → 갱신(이 표 · 설계) → 닫기(커밋 · PR).
직관 확인은 스크립트 하나이고 사람이 글 또는 화면으로 본다.

엔진 쪽 stage(어디 = proto)는 엔진 저장소에 PR 로 들고, 들어간 커밋을 `engine.lock` 에 핀한다.
지금의 핀은 엔진 PR dkwkekzz/hkt-adventure-proto#140(엔진 plan 259 Gate · 260 사람의 묶음 · ONLINE.md — 엔진의 main 위)의 커밋이다. 그것이 엔진의 main 에 들어가면 `engine.lock` 을 main 의 그 커밋으로 옮긴다.

| stage | 어디 | 세우는 것 | 직관 확인 | 상태 |
|---|---|---|---|---|
| 1 책임 — 엔진의 Gate | proto | 엔진 `ONLINE.md` §3.2 ① · 엔진 plan 259. Gate 가 `HOST_AUTH_KEY` 로 토큰을 검증하고, 키가 없으면 더미. 뷰어 `?token=` · 에이전트 `--token` | 엔진의 `npm run check`. 키를 준 호스트에 이름 글로 붙으면 4002, 서명된 토큰으로 붙으면 open | ☑ |
| 2 설계 — design 의 둘 | online | `design/README.md` · `method.md` · `01-flows/01 ~ 07` · `02-roles/account · fleet · storage` | `npm run index` — 흐름의 단계 `개념.기능` 이 전부 책임 파일(또는 README 의 앱)에 있는가 | ☑ |
| 3 책임 — 저장장치 | online | Vault · Ledger. 볼륨 하나 위 | `npm run check`. `src/storage/tests` 가 자리를 내고 베끼고 되돌린다 | ☑ |
| 4 책임 — 계정 | online | Directory · Identity · Account · Signer · Token. 게스트 신원부터 | 토큰 하나를 만들어 stage 1 의 호스트에 `Host 2` 로 붙으면 open (`src/apps/main/tests/engine.spec.ts`) | ☑ |
| 5 책임 — 함대 | online | Fleet · Shard · Assignment · Ports · Spawner · Process · Probe · Clock · Operator. 흐름 3 · 4 · 5 · 6 이 선다 | 한 계정의 샤드를 띄워 브라우저가 요정 넷을 맡고 NPC 가 움직인다(`npm run shot`). `stop` 뒤 다시 띄우면 `저장된 세계에서 이어간다` | ☑ |
| 6 앱 — main · Api | online | Service.start · stop, http 의 login · enter · 게스트 페이지, stdin 의 Operator. 흐름 1 · 2 · 7 이 선다 | 두 계정이 각자의 샤드에 붙고 서로 보이지 않는다. 쉬면 내려가고 다시 오면 이어진다 (`engine.spec.ts`) | ☑ |
| 7 도구 — 경계 검사 | online | `src/tools/boundary` — 규칙 S · A · T · F · P · N · E. `npm run check` 의 앞단 | 규칙을 하나 어긴 import 를 넣으면 1 로 끝난다 (`src/tools/boundary/tests`) | ☑ |
| 8 책임 — 저장 · 밖의 뒤 | online | 표는 DB, 값 · 디렉터리는 객체 저장소. Vault 의 pull · push · prune, Ledger 의 줄 하나씩(get · put). 모양은 `protocol/vault.ts` 그대로 | 다른 기계에서 같은 저장으로 띄우면 이어진다 | ☐ |
| 9 책임 — 함대 · 공용 정적 페이지 | online | 샤드는 엔진의 host(소켓만) + stdin grant, 뷰어는 Fleet.start 가 한 번 묶고 Static 이 `/play` · `/viewer.js` · `/assets` · `/keymap.json` 을 준다. 샤드를 한꺼번에 띄운다 | 서비스의 `/play?ws=` 뷰어가 다른 포트의 샤드에 붙는다(`npm run shot`). 두 샤드가 서로를 기다리지 않고 뜬다(`fleet.spec.ts`) | ☑ |
| 10 책임 — 관문 | online | Gateway · Session · Guard 와 Seat 소켓(claim · left · swap · kick). 흐름 9 · 11 이 선다. 호스트는 안쪽 망에만 | 클라이언트가 관문의 주소 하나로 붙고, 자리 없이 붙으면 4002 | ☐ |
| 11 책임 — 엔진의 사람의 묶음 | proto | 엔진 plan 260 — `--party` 의 틀에서 계정마다 묶음을 낳고 접속한 동안만 세계에(무대 밖). 엔진 `ONLINE.md` §1.3 · §3.2 ④ | 엔진의 `npm run check` — 숲길에서 계정 넷이 각자의 요정 넷을 받고 서로를 본다(`host/tests/party.spec.ts`) | ☑ |
| 12 책임 — 함대 · 한 세계 | online | 세계 하나(설정의 world)에 사람 모두. 호스트는 `--party`, 입장의 한계는 capacity(성능)뿐. 자리 표는 세계 이름으로. 운영자의 글은 `<world>` | 셋이 같은 세계에 붙어 각자의 묶음을 받고 다시 띄워도 이어진다(`engine.spec.ts`). 둘의 브라우저가 서로를 본다(화면) | ☑ |
| 13 책임 — 배치 | online | Placement · Zone · Seat · Presence · Queue. 흐름 3 이 자리 · 대기열로 선다. 상한은 자리가 센다 | 상한을 넘는 입장이 순번을 받고 자리가 나면 들어온다 | ☐ |
| 14 책임 — 계정 · 캐릭터 | online | Directory 의 list · create · owns · ban, 계정의 토큰과 캐릭터의 토큰. 흐름 8 | 한 계정이 캐릭터 둘을 만들어 따로 들어간다. 막힌 계정은 거절 | ☐ |
| 15 책임 — 엔진의 건넴 | proto | 피드백 4 — 들임 · 거둠 · 베낌의 Console 글, 건넘 글, status 의 지연 칸, 뷰어의 다시 온 `Link 1`. 엔진 저장소의 설계가 먼저 | 엔진의 `npm run check` — 한 호스트에서 거둔 묶음이 다른 호스트에 그대로 선다 | ☐ |
| 16 책임 — 저장 · 캐릭터의 값 | online | Locker · Lease. Shard 의 lend · reclaim · copy, Warden 의 박자(흐름 5 의 2) | 호스트를 죽여도 캐릭터가 마지막으로 넣은 값으로 다시 선다. 옛 임대의 넣기는 거절 | ☐ |
| 17 책임 — 함대 · 인스턴스 여럿 | online | Fleet(제어) · Instance · 여유(spare) · drain · retire. 흐름 10 · 12 가 한 기계에서 선다 | 한 존의 두 인스턴스 사이로 사람이 옮겨지고(`drain`) 접속이 끊기지 않는다 | ☐ |
| 18 책임 — 함대 · 노드 | online | Warden · Machine 과 Berth 소켓. 프로세스 넷(front · gate · control · node)으로 갈라 띄운다 | 두 기계의 노드가 한 제어에 알리고, 한 기계를 끄면 사람이 다른 기계로 놓인다 | ☐ |
| 19 앱 — Operator | online | 흐름 6 의 명령 전부와 안쪽 주소의 Operator 소켓 | `close` · `drain` 으로 엔진을 바꿔 띄우는 동안 사람이 끊기지 않는다 | ☐ |

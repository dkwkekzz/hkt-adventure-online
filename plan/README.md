# plan — design 을 src 에 세우는 순서와 상태

plan 하나 = 파일 하나. 한 plan 은 흐름 몇이 서는 덩어리이고, 그 안에 책임 · 도구 몇이 든다. 순서는 아래 표의 차례다 — 다음은 표의 첫 ☐ · ◐.
src 는 ☑ 까지의 모양이다. 지금의 design(존 × 인스턴스 · 프로세스 넷)에 닿으려면 ☐ 가 남아 있다.

한 바퀴: 읽기(그 plan 의 파일 → 그것이 가리키는 design) → 구현(책임의 개념과 흐름의 단계 그대로. 새 단계는 흔적을 남긴다 — 흐름 14) → 검증(`npm run check` 와 그 plan 의 직관 확인 · 관측) → 갱신(그 plan 의 파일 · 이 표 · 설계 · plan 02 의 「대신 하는 단계」) → 닫기(커밋 · PR).
직관 확인은 스크립트 하나이고 사람이 글 또는 화면으로 본다.
관측: plan 마다 「관측에 보일 것」이 있다. 닫기 전에 그것을 관측 페이지의 서버 · 사람 보기에서 찍어 보인다(`npm run shot -- --viewer off --monitor http://localhost:8001`). 관측 페이지가 지금의 src 를 실제보다 좋게 보이면 그것도 그 바퀴에서 고친다.

엔진 쪽 일(어디 = proto)은 엔진 저장소에 PR 로 들고, 들어간 커밋을 `engine.lock` 에 핀한다.
지금의 핀은 엔진 PR dkwkekzz/hkt-adventure-proto#140(엔진 plan 259 Gate · 260 사람의 묶음 · ONLINE.md — 엔진의 main 위)의 커밋이다. 그것이 엔진의 main 에 들어가면 `engine.lock` 을 main 의 그 커밋으로 옮긴다.

| plan | 어디 | 세우는 것 | 흐름 | 상태 |
|---|---|---|---|---|
| [01 세계 하나](01-one-world.md) | proto · online | 엔진의 Gate · 사람의 묶음, 설계, 저장장치 · 계정 · 함대 · main 앱 · 경계 검사 — 세계 하나 · 프로세스 하나의 서비스 | 1 · 2 · 3 · 4 · 5 · 6 · 7 | ☑ |
| [02 관측](02-observe.md) | online | Monitor · 흔적 · 흐름의 지도 · 관측 페이지. 남은 것: 진행도를 실제대로(대신 하는 단계 · 프로세스 셋 · plan 진행표) | 14 | ◐ |
| [03 스토리지](03-storage.md) | online | Database · CharacterStore · Leases · LeaderLock · SnapshotStore 의 뒤를 MongoDB · object storage 로 | 1 · 5 · 7 | ☑ |
| [04 게이트웨이](04-gateway.md) | online | 게이트웨이 모듈 — 클라이언트가 주소 하나로 붙는다 | 9 · 11 | ☐ |
| [05 세션 · 캐릭터](05-session-character.md) | online | 세션 모듈과 계정의 캐릭터 · 차단 — 입장이 세션 · 대기열을 거친다 | 2 · 3 의 A · 8 | ☐ |
| [06 엔진의 면](06-engine-faces.md) | proto | 통째 저장 · backup, handoff · load · unload · keep, 떠남 줄 · 지연, 뷰어의 다시 열림 · `?exit=` | (엔진) | ☐ |
| [07 인스턴스 여럿](07-instances.md) | online | 캐릭터의 값(Loader · Leases · CharacterStore)과 한 존의 인스턴스 여럿(Registry · Scheduler · Scaler · Recoverer · Mover · Router) | 3 의 B · 9 · 10 · 12 | ☐ |
| [08 프로세스 넷](08-processes.md) | online | 노드(Runner · NodeReporter · Nodes · Reconciler)와 NodeRpc, 운영자의 토큰 · audit, Elector — 프로세스 넷으로 갈라 띄운다 | 1 · 5 · 6 · 7 · 13 · 14 | ☐ |

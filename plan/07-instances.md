# plan 07 — 인스턴스 여럿

상태: ☐ · 어디: online · design/02-roles/fleet.md · session.md · storage.md · 흐름 1 의 8 · 9 · 3 의 B · 5 · 7 의 3 ~ 6 · 9 · 10 · 12

캐릭터의 값이 인스턴스 사이를 옮겨 다니고, 한 존에 인스턴스가 여럿 선다. plan 06 의 엔진의 면에 기댄다.
지금의 Shard 는 여기서 Registry 의 줄 · Runner · Console 로 갈린다.

## 세울 것

| | 무엇 |
|---|---|
| ☐ | 캐릭터의 값 — Loader · Leases · CharacterStore. 흐름 9 의 4 ~ 7 · 흐름 5 의 2 |
| ☐ | 인스턴스 여럿 — Registry · Scheduler · Scaler · Recoverer · Backuper(엔진의 backup — plan 06 위). 흐름 3 의 B · 5 의 3 · 5 의 12 · 7 의 5 · 12 |
| ☐ | 존 이동 — 세션의 Mover · Router. 흐름 10 |
| ☐ | 흐름 3 의 B · 9 · 10 · 12 의 흔적 — 지금 Shard 가 남기는 3 의 11 · 17 · 19, 4 의 3 · 5 는 Registry · Console · Runner 를 부르는 자리로. 4 의 6(Ports.free)은 Runner 가 |

## 관측에 보일 것

- 노드 서버 안에 인스턴스가 여럿, 인스턴스마다 state · 사람 수 · 지연. 사람 보기의 인스턴스 묶음도 여럿이 된다.
- Shard 가 대신 남기던 3 의 11 · 17 · 19, 4 의 3 · 5, 5 의 1 · 12, 7 의 4 를 Registry · Console · Runner · Scaler 를 부르는 자리로 옮긴다 — plan 02 의 「대신 하는 단계」에서 지운다.
- 흐름 10(존 이동) · 12(장애 복구) — 사람 보기에서 한 사람의 인스턴스가 바뀌는 것이 일생에 남고, 그림에 그 길(control → node → Engine · Storage → SessionRpc → gateway)이 칠해진다.
- Loader · Leases · CharacterStore 가 Storage 연결에 글을 더한다.

## 직관 확인

호스트를 죽여도 캐릭터가 마지막으로 저장한 값으로 다시 선다. 한 존의 두 인스턴스 사이로 사람이 옮겨지고(`drain`) 접속이 끊기지 않는다 — 관측 페이지의 흐름 10 이 한 run 으로 칠해진다.

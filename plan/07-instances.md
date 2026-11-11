# plan 07 — 인스턴스 여럿

상태: ☐ · 어디: online · design/02-roles/fleet.md · session.md · storage.md · 흐름 3 의 B · 9 · 10 · 12

캐릭터의 값이 인스턴스 사이를 옮겨 다니고, 한 존에 인스턴스가 여럿 선다. plan 06 의 엔진의 면에 기댄다.
지금의 Shard 는 여기서 Registry 의 줄 · Runner · Console 로 갈린다.

## 세울 것

| | 무엇 |
|---|---|
| ☐ | 캐릭터의 값 — Loader · Leases · CharacterStore. 흐름 9 의 4 ~ 7 · 흐름 5 의 2 |
| ☐ | 인스턴스 여럿 — Registry · Scheduler · Scaler · Recoverer. 흐름 3 의 B · 5 의 12 · 12 |
| ☐ | 존 이동 — 세션의 Mover · Router. 흐름 10 |
| ☐ | 흐름 3 의 B · 9 · 10 · 12 의 흔적 — 지금 Shard 가 남기는 3 의 11 · 17 · 19, 4 의 3 · 5 는 Registry · Console · Runner 를 부르는 자리로 |

## 직관 확인

호스트를 죽여도 캐릭터가 마지막으로 저장한 값으로 다시 선다. 한 존의 두 인스턴스 사이로 사람이 옮겨지고(`drain`) 접속이 끊기지 않는다 — 관측 페이지의 흐름 10 이 한 run 으로 칠해진다.

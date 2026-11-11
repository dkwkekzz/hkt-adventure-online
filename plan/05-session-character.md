# plan 05 — 세션 · 캐릭터

상태: ☐ · 어디: online · design/02-roles/session.md · account.md · 흐름 2 · 3 의 A · 8

입장이 세션을 거친다 — 들어와도 되는가, 설 존, 슬롯이 빈 인스턴스, 대기열. 계정은 캐릭터를 여럿 들고, 차단된 계정은 거절한다.

## 세울 것

| | 무엇 |
|---|---|
| ☐ | 세션 — Admission · ZoneMap · Placer · Sessions · Queue · Gates. 흐름 3 의 A |
| ☐ | 계정 — Characters · Banlist, 계정의 토큰과 캐릭터의 토큰. 흐름 2 의 3 · 흐름 8 |
| ☐ | Api 의 characters · create · choose · delete, enter 의 `{wait: 순번}` |
| ☐ | 흐름 3 의 A · 8 의 흔적 — 지금 Fleet 이 남기는 3 의 6 은 Placer.pick 을 부르는 자리로 |

## 직관 확인

한 계정이 캐릭터 둘을 만들어 따로 들어간다. 차단된 계정은 거절. 상한을 넘는 입장이 순번을 받고 슬롯이 나면 들어온다 — 관측 페이지의 흐름 3 에 Queue 가 칠해진다.

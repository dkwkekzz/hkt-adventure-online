# plan 05 — 세션 · 캐릭터

상태: ☐ · 어디: online · design/02-roles/session.md · account.md · 흐름 2 · 3 의 A · 8

입장이 세션을 거친다 — 들어와도 되는가, 설 존, 슬롯이 빈 인스턴스, 대기열. 계정은 캐릭터를 여럿 들고, 차단된 계정은 거절한다.

## 세울 것

| | 무엇 |
|---|---|
| ☐ | 세션 — Admission · ZoneMap · Placer · Sessions · Queue · Gates. 흐름 3 의 A |
| ☐ | 계정 — Characters · Banlist, 계정의 토큰과 캐릭터의 토큰. 흐름 2 의 3 · 흐름 8 |
| ☐ | Api 의 characters · create · choose · delete, enter 의 `{wait: 순번}` |
| ☐ | 흐름 3 의 A · 8 의 흔적 — 지금 Fleet 이 남기는 3 의 6 은 Placer.pick 을 부르는 자리로. 흔적의 session 은 Session.id 로(지금은 입장의 run), name 은 Character.name 으로 |

## 관측에 보일 것

- 흐름 3 의 A(3 ~ 8)가 control 상자에서 칠해지고, 입장의 길이 api → control(SessionRpc) → api 로 보인다. 3 의 6 을 Placer.pick 을 부르는 자리로 옮긴다.
- 흔적의 session 은 Session.id, name 은 Character.name — 사람 보기에 캐릭터 이름이 나오고, 한 사람의 입장 · 접속 · 종료가 한 세션으로 묶인다.
- 흐름 8(캐릭터)과 2 의 3(Banlist) 흔적. 차단 · 대기열의 거절이 사람 보기에서 그 사람의 줄에 보인다(대기 순번을 person 으로 둘지는 설계에서 정한다).

## 직관 확인

한 계정이 캐릭터 둘을 만들어 따로 들어간다. 차단된 계정은 거절. 상한을 넘는 입장이 순번을 받고 슬롯이 나면 들어온다 — 관측 페이지의 흐름 3 에 Queue 가 칠해진다.

# plan 05 — 세션 · 캐릭터

상태: ☑ · 어디: online · design/02-roles/session.md · account.md · 흐름 2 · 3 의 A · C · 5 의 C · 8 · 9 · 11

입장이 세션을 거친다 — 들어와도 되는가, 설 존, 슬롯이 빈 인스턴스, 대기열. 계정은 캐릭터를 여럿 들고, 차단된 계정은 거절한다.

## 세운 것

| | 무엇 | 자리 |
|---|---|---|
| ☑ | 세션 모듈 — Admission · ZoneMap · Zone · Placer · Sessions · Session · Queue · Gates · Router(kick). 밖에 내보내는 것은 openSession 하나, 그것이 낸 SessionSocket 이 SessionRpc 의 받는 쪽(enter · forget · attach · detach · report). 다른 모듈의 기능은 앱이 준 함수. 간격(흐름 5 의 11 · 13 · 14)은 제 것 | `src/session/` · `protocol/session.ts` |
| ☑ | 계정 — Characters(표 `characters` · `owners`, 한계 `characterLimit`, 이름 1 ~ 24 자 · 계정 안에서 겹치지 않게) · Banlist(표 `bans`) · Character. Account.id 는 `a…`, Character.id 는 `p…`(엔진의 계정). 토큰의 종류는 id 의 머리(kindOf) — 계정의 토큰은 Api 에만, 캐릭터의 토큰(`characterTtl`)은 입장 · 게이트웨이 · 호스트 | `src/account/` |
| ☑ | Api — `POST /characters` · `/create` · `/choose` · `/delete`(흐름 8), `/enter` 는 캐릭터의 토큰으로 `{page, gate}` 또는 `{wait: 순번}`(흐름 3 의 21). page 는 Api 가 제 빌드의 것으로. 로그인에 Banlist.banned(흐름 2 의 3). 게스트 페이지는 로그인 → 캐릭터 목록 · 만들기 · 지우기 → 들어가기(줄이면 순번을 보이고 다시 묻는다) | `src/apps/main/api.ts` · `page.ts` |
| ☑ | 대기열 — 설계의 흐름 3 에 C(20 Queue.push · 21 Api.enter 의 `{wait}`)를 더했다. 슬롯이 나면 Queue.next(흐름 11 의 6 · 5 의 14)가 앞사람의 세션을 잡고, 그 사람의 다음 물음이 4 에서 찾는다 | `design/01-flows/03-enter.md` |
| ☑ | 흐름 3 의 A · 8 의 흔적 — Placer.pick · Gates.pick(3 의 6 · 8), Sessions.get · activate · suspend(9 의 3 · 8 · 9, 11 의 2)는 세션 모듈이. 게이트웨이의 report 는 Gates.seen(5 의 8). Fleet.enter · attach · detach 는 없고, 플릿은 ready · launch(흐름 3 의 B) · address 를 앱을 거쳐 세션에 준다 | `src/session/index.ts` · `src/fleet/fleet.ts` |
| ☑ | 흔적의 사람 — who 는 Account.id 의 가명, name 은 Character.name, session 은 Session.id. 게이트웨이 · 노드는 캐릭터만 알아 사람을 싣지 않고, 같은 run 의 세션 단계가 그 run 을 사람에게 잇는다. person 에 `queued`(3 의 20)를 더하고, pending 은 3 의 7 · 11 의 6 · 5 의 14, gone 은 11 의 4 · 5 의 13 | `protocol/observe.ts` · `design/01-flows/14-observe.md` |
| ☑ | 경계 규칙 C — session/** 은 protocol/ 만. P 에 characters · banlist · session 의 자리와 fleet.ready · launch · address, gateway.kick | `src/tools/boundary/` |

## 관측에 보이는 것

- 흐름 3 의 A(3 ~ 8)가 control 상자에서 칠해지고, 입장의 길이 api(1 · 2) → control(3 ~ 8, 없으면 B 로 띄우고 6 을 다시) → api(9) 로 보인다. 3 의 6 · 8 이 빗금(대신)에서 실선(섰다)으로.
- 흔적의 session 은 Session.id, name 은 Character.name — 사람 보기에 캐릭터 이름이 나오고, 한 사람의 입장(3 의 7 · 8) · 접속(9 의 3 · 8 · 9) · 끊김(11 의 2)이 한 세션으로 묶인다.
- 흐름 8(캐릭터)과 2 의 3(Banlist)의 흔적. 차단의 거절(2 의 3 · 8 의 3 · 3 의 3)과 대기열(3 의 20 `queued`)이 사람 보기에서 그 사람의 줄에 보인다.
- 흐름 5 의 8(Gates.seen)이 게이트웨이의 보고마다, 11 · 13 · 14 가 세션의 간격에.

## 덧붙임

- 존은 하나(설정의 `fleet.world` · `dataset`, 상한은 `session.capacity`)이고 그 존의 인스턴스도 하나다 — 그래서 상한이 차면 B(띄우기)가 할 곳이 없어 C(대기열)로 간다. 한 존에 인스턴스 여럿 · 예비 용량(Zone.spare · Scaler)은 plan 07.
- 유예가 지나면 11 의 4 ~ 6 은 서지만 3(Loader.unload — 값을 내려 저장)은 plan 07 이다. 지금 엔진은 끊긴 묶음을 무대 밖에 두고 세계가 내려갈 때 Store 와 함께 저장한다.
- Router 는 kick 하나(Admission 이 같은 계정의 다른 캐릭터를 내보낼 때). reroute 는 plan 07, 운영자의 `ban` · `kick` · `close` · `open` 은 plan 08(흐름 6 의 명령 전부). 지금 차단은 표 `bans` 에 적어서 — 테스트와 직관 확인은 Banlist.ban 을 부른다.
- Reconciler(보고와 세션을 맞춘다 — 흐름 5 의 9)는 plan 07 · 08. 그래서 컨트롤 플레인이 다시 서면 세션은 비고, 붙어 있던 사람은 끊긴 뒤 다시 입장한다.
- Directory.sweep(흐름 5 의 15)은 컨트롤 플레인의 Clock 과 함께 plan 08.

## 직관 확인

한 계정이 캐릭터 둘을 만들어 따로 들어간다 — 엔진에게는 다른 계정이라 묶음이 다르고, 나중 입장이 이겨 앞 캐릭터의 접속은 4000. 차단된 계정은 로그인 · 캐릭터 · 입장이 거절된다. 상한을 넘는 입장이 순번을 받고 슬롯이 나면 들어온다 — 관측 페이지의 흐름 3 에 Queue 가 칠해진다.

```bash
npx vitest run src/session src/apps/main/tests/service.spec.ts src/apps/main/tests/engine.spec.ts
npm run shot -- --viewer off --monitor http://localhost:8001    # 서비스를 session.capacity 1 로 띄우고 둘이 들어간 뒤
```

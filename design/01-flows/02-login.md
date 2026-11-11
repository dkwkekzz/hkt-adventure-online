# 흐름 2. 로그인 — 클라이언트의 신원

트리거: Api 의 `login`. 신원(제공자 · 주체)을 든다. 제공자는 `guest` 하나 — 주체가 비면 새로 짓는다.
한 줄: 신원을 계정으로 바꾸고 계정의 토큰을 준다.

## 순서

```text
Api.login → Directory.resolve → Banlist.banned → Signer.issue → 답
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Api.login | 요청을 받는다. 같은 자리의 요청이 한계(`loginRate`)를 넘으면 거절 | Identity |
| 2 | Directory.resolve | 신원의 계정을 찾거나 새로 짓는다 | Account.id |
| 3 | Banlist.banned | 차단됐으면 거절 | |
| 4 | Signer.issue | 계정의 토큰을 낸다 | Token |
| 5 | Api.login | `{token, subject}` 를 답한다 | 클라이언트 ◇ |

## 실패하면

- 스토리지에 닿지 않으면 503.

## 멈추는 자리

- 클라이언트가 계정의 토큰과 제 주체를 든다.

## 이어지는 흐름

- 8 캐릭터.

## 규칙

- 게스트의 주체는 클라이언트가 든다. 같은 주체로 다시 오면 같은 계정이고, 주체를 잃으면 그 계정으로 돌아갈 길이 없다 — 게스트란 그런 것이다.
- 계정의 토큰은 Api 에만 쓴다.

## 미정

- 없음.

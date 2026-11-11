# 흐름 2. 로그인 — 클라이언트의 신원

트리거: Api 의 `login`. 신원(제공자 · 주체)을 든다. 제공자는 `guest` 하나다 — 주체가 비면 새 주체를 짓는다.
한 줄: 신원을 Account.id 로 바꾸고 계정의 토큰을 돌려준다. 막힌 계정은 거절한다.

## 순서

```text
Api login                                               [앱 — 앞문]
  Directory.resolve                                     [계정]
    Ledger.get · Ledger.put(accounts)                   [저장]
  Directory.banned
  Signer.issue                                          [계정]
  답 — 계정의 토큰                                        ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Api login | 제공자가 `guest` 가 아니면 거절 ✕. 같은 자리에서 오는 요청이 한계(`loginRate`)를 넘으면 거절 ✕. 주체가 비면 새 주체(무작위 글)를 짓는다 | Identity |
| 2 | Directory.resolve(identity) | Ledger.get 으로 있으면 그 Account.id, 없으면 새 id 를 짓고 Ledger.put | Account.id |
| 3 | Directory.banned(account) | 막혔으면 거절 ✕ | |
| 4 | Signer.issue(account) | `hkt1.<Account.id>.<만료 epoch 초>.<base64url HMAC-SHA256>` | Token |
| 5 | Api | `{token, subject}` 를 답한다 | 클라이언트 ◇ |

## 멈추는 자리

- 클라이언트가 계정의 토큰과 제 주체를 든다. 계정의 줄이 저장에.

## 이어지는 흐름

- 8 캐릭터.

## 규칙

- 계정의 토큰은 Api 에만 쓴다. 관문은 캐릭터의 토큰만 받는다.
- 앞문은 표를 메모리에 두지 않는다. 앞문이 여럿이어도 같은 신원은 같은 계정이다(줄 하나의 쓰기가 통째로 된다).
- 게스트의 주체는 클라이언트가 든다. 같은 주체로 다시 오면 같은 계정이다.

## 미정

- 게스트 밖의 제공자(OAuth 등)와 계정 잇기 — 피드백 1.

# 흐름 2. 로그인 — 클라이언트의 신원

트리거: Api 의 `login`. 신원(제공자 · 주체)을 든다. 제공자는 `guest` 하나다 — 주체가 비면 새 주체를 짓는다.
한 줄: 신원을 Account.id 로 바꾸고 계정의 토큰을 돌려준다. 차단된 계정은 거절한다.

## 순서

```text
Api login                                               [앱 — API 서버]
  Directory.resolve                                     [계정]
    Database.get · Database.put(accounts)                   [스토리지]
  Directory.banned
  Signer.issue                                          [계정]
  답 — 계정의 토큰                                        ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Api login | 제공자가 `guest` 가 아니면 거절 ✕. 같은 자리에서 오는 요청이 한계(`loginRate`)를 넘으면 거절 ✕. 주체가 비면 새 주체(무작위 글)를 짓는다 스토리지에 닿지 않으면 503 | Identity  |
| 2 | Directory.resolve(identity) | Database.get 으로 있으면 그 Account.id, 없으면 새 id 를 짓고 Database.put 계정의 줄에 마지막으로 온 때(seen)를 고친다 | Account.id  |
| 3 | Directory.banned(account) | 차단됐으면 거절 ✕ | |
| 4 | Signer.issue(account) | `hkt1.<Account.id>.<만료 epoch 초>.<base64url HMAC-SHA256>` | Token |
| 5 | Api | `{token, subject}` 를 답한다 | 클라이언트 ◇ |

## 멈추는 자리

- 클라이언트가 계정의 토큰과 제 주체를 든다. 계정의 줄이 스토리지에.

## 이어지는 흐름

- 8 캐릭터.

## 규칙

- 계정의 토큰은 Api 에만 쓴다. 게이트웨이는 캐릭터의 토큰만 받는다.
- API 서버는 표를 메모리에 두지 않는다. API 서버가 여럿이어도 같은 신원은 같은 계정이다(줄 하나의 쓰기가 통째로 된다).
- 게스트의 주체는 클라이언트가 든다. 같은 주체로 다시 오면 같은 계정이다. 주체를 잃으면 그 계정으로 돌아갈 길이 없고, 주체를 아는 자가 그 계정이다 — 게스트란 그런 것이다. 계정과 캐릭터 자체는 서버의 스토리지에 남는다.
- 다른 제공자는 `PROVIDERS` 에 이름 하나와 그 신원을 확인하는 단계가 1 에 느는 것이다. 지금은 `guest` 하나다.
- 서명 키는 여럿일 수 있다(Signer.keys). 내는 것은 첫 키로, 푸는 것은 어느 키로든 한다 — 키를 바꿀 때 옛 토큰이 만료까지 통한다(흐름 6 의 규칙).

## 미정

- 없음.

# 흐름 2. 로그인 — 클라이언트의 신원

트리거: Api 의 `login`. 신원(제공자 · 주체)을 든다. 1 차의 제공자는 `guest` 하나다 — 주체가 비면 새 주체를 짓는다.
한 줄: 신원을 Account.id 로 바꾸고 서명된 토큰을 돌려준다.

## 순서

```text
Api login                                               [앱]
  Directory.resolve                                     [계정]
    Ledger.save(directory)                              [저장장치]
  Signer.issue                                          [계정]
  답 — 토큰                                              ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Api login | 제공자가 `guest` 가 아니면 거절 ✕. 주체가 비면 새 주체(무작위 글)를 짓는다 | Identity |
| 2 | Directory.resolve(identity) | users 에 있으면 그 Account.id, 없으면 새 id 를 짓고 users 에 두고 Ledger.save | Account.id |
| 3 | Signer.issue(account) | `hkt1.<Account.id>.<만료 epoch 초>.<base64url HMAC-SHA256>` | Token |
| 4 | Api | `{token, subject}` 를 답한다. 키 · Account.id 는 답에 없다(토큰 안의 id 는 클라이언트가 볼 수 있다 — 비밀이 아니다) | 클라이언트 ◇ |

## 멈추는 자리

- 클라이언트가 토큰과 제 주체를 든다. 사용자 표가 저장장치에.

## 이어지는 흐름

- 3 입장.

## 규칙

- Account.id 는 공백 · `.` 이 없는 글이고 64 자 안이다. 엔진의 Console 이 공백으로 글을 나누고 토큰이 `.` 으로 나뉘기 때문이다.
- 토큰의 만료는 짧게(설정 `tokenTtl`, 시간 단위). 재발급은 로그인 다시.
- 게스트의 주체는 클라이언트가 든다(브라우저의 localStorage). 같은 주체로 다시 오면 같은 계정이다.

## 미정

- 게스트 밖의 제공자(OAuth 등). 주체를 아는 자가 그 계정이 되는 게스트는 외부 공개의 끝이 아니다 — 피드백 1.

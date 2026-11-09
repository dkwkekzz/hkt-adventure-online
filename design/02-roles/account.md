# 계정 account — 책임

계정이란, 밖의 신원을 엔진이 명부에 적는 이름 하나로 바꾸고, 그 이름을 서명해 토큰으로 내고 푸는 것이다.

- 게임 · 샤드 · 프로세스를 모른다.
- 토큰의 모양은 엔진의 Gate 와 약속한 것이다(엔진 `host.md` 의 Gate 줄 · `ONLINE.md` §1.3). 키는 둘이 같이 든다(`HOST_AUTH_KEY`).
- 신원의 출처(제공자)는 앱의 것이다. 계정은 `{provider, subject}` 만 본다.
- 저장장치에는 Ledger 소켓(`protocol/vault.ts`)으로만 닿는다.

```text
Directory ← Service
Signer    ← Service
```

## 개념

### Directory
- 데이터: users:map<Identity.key, Account.id> · ledger(참조).
- 기능: resolve(identity) 는 있으면 그 id, 없으면 새 id(`p` 와 무작위 16 진 글 — 공백 · `.` 없이 64 자 안)를 짓고 users 에 두고 Ledger.save(`directory`). idOf(identity) 는 있는 것만. snapshot 은 users 의 값(저장의 모양).
- 생애: Service.start 가 Ledger 의 값으로 만든다. 프로세스와 함께 사라진다.

### Identity
- 데이터: provider:string · subject:string. 불변. key 는 `provider:subject`.
- 기능: 없음. 로그인(밖)이 준 신원.
- 생애: Api login 마다. resolve 뒤 사라진다.

### Account
- 데이터: id:string. 불변. 엔진의 host.Account.id 와 같은 글.
- 기능: 없음.
- 생애: Directory 가 짓고 users 와 함대의 Assignment 에 남는다.

### Signer
- 데이터: key:string(불변, 엔진의 `HOST_AUTH_KEY` 와 같다) · ttl:int(불변, 초).
- 기능: issue(account) → Token. verify(token) → Account.id 또는 null(서명 · 만료 · 모양이 틀리면).
- 생애: Service.start 가 만든다. 키가 비면 만들지 않는다(시작 거부).

### Token
- 데이터: 글 하나 `hkt1.<Account.id>.<exp>.<sig>`. 불변. sig 는 `hkt1.<id>.<exp>` 의 HMAC-SHA256 을 base64url 로.
- 기능: 없음. 엔진의 `Host 2` 의 credential 이 되고, 뷰어의 `?token=` 과 에이전트의 `--token` 이 든다.
- 생애: issue 마다. 만료로 사라진다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Ledger load · save | 계정 → 저장장치 | slot `directory`(· value) | value 또는 null |

## 미정

- 없음.

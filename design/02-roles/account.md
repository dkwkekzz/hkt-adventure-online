# 계정 account — 책임

계정이란, 밖의 신원을 계정 하나와 그 캐릭터들로 바꾸고, 그 이름을 서명해 토큰으로 내고 푸는 것이다.

- 게임 · 존 · 인스턴스 · 프로세스를 모른다.
- 토큰의 모양은 엔진의 Gate 와 약속한 것이다(엔진 `host.md` 의 Gate 줄 · `ONLINE.md` §1.3). 키는 둘이 같이 든다(`HOST_AUTH_KEY`).
- 신원의 출처(제공자)는 앱의 것이다. 계정은 `{provider, subject}` 만 본다.
- 표는 메모리에 두지 않는다. Ledger 소켓(`protocol/vault.ts`)의 줄 하나씩을 읽고 쓴다 — 앞문이 여럿이어도 같은 답이다.

```text
Directory ← Service(앞문 · 제어)
Signer    ← Service(앞문 · 관문 · 제어)
```

## 개념

### Directory
- 데이터: ledger(참조). 값은 저장에 — `accounts`(Identity.key → Account.id) · `characters`(Account.id → list<Character>) · `bans`(Account.id → until).
- 기능: resolve(identity) 는 있으면 그 Account.id, 없으면 새 id 를 짓고 적는다. list(account) 는 그 계정의 캐릭터들. create(account, name) 은 새 Character 를 짓고 적는다(계정마다의 한계 `characterLimit` 를 넘으면 거절). owns(account, character) 는 그 캐릭터가 그 계정의 것인가. ban(account, until) · unban(account) 는 막고 푼다. banned(account) 는 지금 막혔는가.
- 생애: Service.start 가 Ledger 를 주어 만든다. 프로세스와 함께 사라진다.

### Identity
- 데이터: provider:string · subject:string. 불변. key 는 `provider:subject`.
- 기능: 없음. 로그인(밖)이 준 신원.
- 생애: Api login 마다. resolve 뒤 사라진다.

### Account
- 데이터: id:string(불변, `a` 와 무작위 16 진 글).
- 기능: 없음.
- 생애: Directory 가 짓고 저장에 남는다.

### Character
- 데이터: id:string(불변, `p` 와 무작위 16 진 글 — 공백 · `.` 없이 64 자 안. 엔진의 host.Account.id 와 같은 글) · name:string · account:Account.id.
- 기능: 없음. 엔진에게는 이것이 계정이다 — 캐릭터마다 사람의 묶음 하나.
- 생애: Directory.create 가 짓고 저장에 남는다.

### Signer
- 데이터: key:string(불변, 엔진의 `HOST_AUTH_KEY` 와 같다) · ttl:int(불변, 초).
- 기능: issue(id, ttl) → Token. id 는 Account.id 또는 Character.id. verify(token) → id 또는 null(서명 · 만료 · 모양이 틀리면).
- 생애: Service.start 가 만든다. 키가 비면 만들지 않는다(시작 거부).

### Token
- 데이터: 글 하나 `hkt1.<id>.<exp>.<sig>`. 불변. sig 는 `hkt1.<id>.<exp>` 의 HMAC-SHA256 을 base64url 로.
- 기능: 없음. id 가 `a` 로 시작하면 계정의 토큰(Api 에만 쓴다), `p` 로 시작하면 캐릭터의 토큰(입장 · 관문 · 호스트의 `Host 2`).
- 생애: issue 마다. 만료로 사라진다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Ledger get · put · remove | 계정 → 저장 | 표 `accounts` · `characters` · `bans` 의 줄 하나 | 값 또는 null |

## 미정

- 게스트 밖의 제공자와 계정 잇기 — 피드백 1.

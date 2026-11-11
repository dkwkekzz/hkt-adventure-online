# 계정 account — 책임

계정이란, 밖의 신원을 계정 하나와 그 캐릭터들로 바꾸고, 그 이름을 서명해 토큰으로 내고 푸는 것이다.

- 게임 · 존 · 인스턴스 · 프로세스를 모른다.
- 토큰의 모양은 엔진의 Gate 와 약속한 것이다(`ONLINE.md` §1.3). 키는 둘이 같이 든다(`HOST_AUTH_KEY`).
- 표는 메모리에 두지 않는다. Database 의 줄 하나씩을 읽고 쓴다 — API 서버가 여럿이어도 같은 답이다.

| 개념 | 책임 하나 |
|---|---|
| Directory | 신원을 계정으로 바꾼다 |
| Characters | 계정의 캐릭터를 든다 |
| Banlist | 차단된 계정을 든다 |
| Signer | 토큰을 내고 푼다 |

## 개념

### Directory
- 데이터: db(참조 — 표 `accounts`: Identity.key → Account.id, 표 `accountInfo`: Account.id → 마지막으로 온 때).
- 기능: resolve(identity) 는 있으면 그 Account.id, 없으면 새 id 를 짓고 적는다. 마지막으로 온 때를 고친다. sweep(before) 는 캐릭터가 없고 before 보다 오래 오지 않은 계정을 지운다.
- 생애: Service.start 가 만든다.

### Characters
- 데이터: db(참조 — 표 `characters`: Account.id → list<Character>).
- 기능: list(account) 는 그 계정의 캐릭터들. create(account, name) 은 새 Character 를 짓고 적는다(한계 `characterLimit`). remove(character) 는 그 줄을 지운다. owner(character) 는 그 캐릭터의 Account.id(없으면 null).
- 생애: Service.start 가 만든다.

### Banlist
- 데이터: db(참조 — 표 `bans`: Account.id → until).
- 기능: ban(account, until) · unban(account) 는 차단하고 푼다. banned(account) 는 지금 차단됐는가.
- 생애: Service.start 가 만든다.

### Signer
- 데이터: key:string(불변, 엔진의 `HOST_AUTH_KEY` 와 같다) · ttl:int(불변, 초).
- 기능: issue(id, ttl) → Token. verify(token) → id 또는 null(서명 · 만료 · 모양이 틀리면).
- 생애: Service.start 가 만든다. 키가 비면 시작 거부.

### Identity
- 데이터: provider:string · subject:string. 불변. key 는 `provider:subject`.
- 기능: 없음. 로그인(밖)이 준 신원. 제공자는 `guest` 하나 — 주체를 아는 자가 그 계정이다.

### Account
- 데이터: id:string(불변, `a` 로 시작).
- 기능: 없음.

### Character
- 데이터: id:string(불변, `p` 로 시작 — 엔진의 host.Account.id 와 같은 글) · name:string · account:Account.id.
- 기능: 없음. 엔진에게는 이것이 계정이다 — 캐릭터마다 사람의 묶음 하나.

### Token
- 데이터: 글 하나 `hkt1.<id>.<exp>.<sig>`. 불변. id 가 `a` 로 시작하면 계정의 토큰(Api 에만), `p` 면 캐릭터의 토큰(입장 · 게이트웨이 · 호스트), `o` 면 운영자의 토큰(Operator 에만).
- 기능: 없음.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Database get · put · remove | 계정 → 스토리지 | 표 `accounts` · `accountInfo` · `characters` · `bans` 의 줄 하나 | 값 또는 null |

## 미정

- 없음.

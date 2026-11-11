# 계정 account — 책임

계정이란, 밖의 신원을 계정 하나와 그 캐릭터들로 바꾸고, 그 이름을 서명해 토큰으로 내고 푸는 것이다.

- 게임 · 존 · 인스턴스 · 프로세스를 모른다.
- 토큰의 모양은 엔진의 Gate 와 약속한 것이다(엔진 `host.md` 의 Gate 줄 · `ONLINE.md` §1.3). 키는 둘이 같이 든다(`HOST_AUTH_KEY`).
- 신원의 출처(제공자)는 앱의 것이다. 계정은 `{provider, subject}` 만 본다.
- 표는 메모리에 두지 않는다. Database 소켓(`protocol/storage.ts`)의 줄 하나씩을 읽고 쓴다 — API 서버가 여럿이어도 같은 답이다.

```text
Directory ← Service(API 서버 · 컨트롤 플레인)
Signer    ← Service(API 서버 · 게이트웨이 · 컨트롤 플레인 · 노드)
```

## 개념

### Directory
- 데이터: db(참조). 값은 스토리지에 — `accounts`(Identity.key → Account.id) · `characters`(Account.id → list<Character>) · `bans`(Account.id → until).
- 기능: resolve(identity) 는 있으면 그 Account.id, 없으면 새 id 를 짓고 적는다. list(account) 는 그 계정의 캐릭터들. create(account, name) 은 새 Character 를 짓고 적는다(계정마다의 한계 `characterLimit` 를 넘으면 거절). owns(account, character) 는 그 캐릭터가 그 계정의 것인가. remove(account, character) 는 그 캐릭터의 줄을 지운다. ban(account, until) · unban(account) 는 차단하고 푼다. banned(account) 는 지금 차단됐는가. owner(character) 는 그 캐릭터의 Account.id. touch(account) 는 seen 을 지금으로. close(account) 는 캐릭터가 없을 때 계정의 줄을 지운다. sweep(before) 는 캐릭터가 없고 seen 이 before 보다 오랜 계정들을 지운다.
- 생애: Service.start 가 Database 를 주어 만든다. 프로세스와 함께 사라진다.

### Identity
- 데이터: provider:string · subject:string. 불변. key 는 `provider:subject`.
- 기능: 없음. 로그인(밖)이 준 신원.
- 생애: Api login 마다. resolve 뒤 사라진다.

### Account
- 데이터: id:string(불변, `a` 와 무작위 16 진 글).
- 기능: 없음.
- 생애: Directory 가 짓고 스토리지에 남는다.

### Character
- 데이터: id:string(불변, `p` 와 무작위 16 진 글 — 공백 · `.` 없이 64 자 안. 엔진의 host.Account.id 와 같은 글) · name:string · account:Account.id.
- 기능: 없음. 엔진에게는 이것이 계정이다 — 캐릭터마다 사람의 묶음 하나.
- 생애: Directory.create 가 짓고 스토리지에 남는다.

### Signer
- 데이터: key:string(불변, 엔진의 `HOST_AUTH_KEY` 와 같다) · ttl:int(불변, 초). keys:list<string>(불변 — 첫 것이 key, 나머지는 바꾸는 동안 푸는 데만 쓰는 옛 키).
- 기능: issue(id, ttl) → Token. id 는 Account.id 또는 Character.id. verify(token) → id 또는 null(서명 · 만료 · 모양이 틀리면). issue 는 첫 키로, verify 는 keys 의 어느 것으로든. issueWith(id, ttl, key) 는 그 키로 낸다 — 옛 키로 뜬 호스트에 줄 토큰.
- 생애: Service.start 가 만든다. 키가 비면 만들지 않는다(시작 거부).

### Token
- 데이터: 글 하나 `hkt1.<id>.<exp>.<sig>`. 불변. sig 는 `hkt1.<id>.<exp>` 의 HMAC-SHA256 을 base64url 로.
- 기능: 없음. id 가 `a` 로 시작하면 계정의 토큰(Api 에만 쓴다), `p` 로 시작하면 캐릭터의 토큰(입장 · 게이트웨이 · 호스트의 `Host 2`). `o` 로 시작하면 운영자의 토큰(Operator 에만 쓴다 — 서명 키를 든 사람이 도구로 낸다).
- 생애: issue 마다. 만료로 사라진다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Database get · put · remove | 계정 → 스토리지 | 표 `accounts` · `characters` · `bans` 의 줄 하나 | 값 또는 null |

## 미정

- 없음.

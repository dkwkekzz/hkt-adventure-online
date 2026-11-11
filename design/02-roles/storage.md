# 스토리지 storage — 책임

스토리지란, 서비스의 표 · 캐릭터의 값과 lease · 인스턴스의 Store 디렉터리를 프로세스와 서버보다 오래 사는 자리에 두는 것이다.

- 값의 안을 모른다. 표의 줄 · 파일 · 디렉터리를 통째로 다룬다.
- 누가 어느 자리를 쓰는가를 모른다. 부르는 모듈이 안다.
- 여러 프로세스 · 여러 서버가 같은 스토리지를 같이 쓴다. 그래서 표는 줄 하나씩, 캐릭터의 값은 lease 의 번호로 지킨다.
- 뒤는 MongoDB 와 object storage 다 — 아래 「뒤」 절. 개발의 뒤는 디렉터리 뿌리 하나이고 모양은 같다.
- 밖에 내보내는 것은 openStorage 하나다. 모양은 `protocol/storage.ts`.

```text
SnapshotStore  ← Service(노드 · 컨트롤 플레인)     (openStorage)
Database ← Service(API 서버 · 컨트롤 플레인)
LeaderLock ← Service(컨트롤 플레인 · 노드 · 게이트웨이 · API 서버)
CharacterStore ← Service(노드 · 컨트롤 플레인)
```

## 뒤

| 개념 | 뒤 | 어디에 |
|---|---|---|
| Database | MongoDB | 표 하나 = collection 하나 — `accounts` · `characters` · `bans` · `lastZone` · `zones` · `instances` · `nodes` · `audit`. 줄 하나 = document 하나(`_id` 가 key) |
| CharacterStore | MongoDB | collection `characterValues`(지난 값은 `characterHistory`) — 캐릭터마다 document 하나: 값(binary)과 lease `{holder, n, until}`. 값이 document 의 한계(16MB)를 넘으면 GridFS 에 두고 document 는 그 id 를 든다 |
| LeaderLock | MongoDB | collection `locks` — 이름마다 document 하나 `{holder, term, until}` |
| SnapshotStore | object storage(S3 호환) | 인스턴스의 Store 디렉터리와 그 백업. 파일이 크고 통째로 오르내린다 |

- 접속 문자열은 환경변수 `MONGODB_URI`. 설정 파일에 두지 않는다(비밀이다).
- 줄 하나의 쓰기는 document 하나의 원자적 갱신(`findOneAndUpdate`)이다. 여러 document 를 묶는 트랜잭션에 기대지 않는다.
- lease 의 번호 대조(checkin)와 LeaderLock 의 잡기(acquire)는 조건을 건 갱신 하나다 — 조건이 맞는 document 가 없으면 거절이다.
- 쓰기는 majority 로 확인받는다. MongoDB 는 replica set 으로 뜬다 — 서버 하나가 사라져도 lease 와 캐릭터의 값이 남아야 한다.
- lease 와 LeaderLock 의 만료는 스토리지(MongoDB)의 시각으로 센다. 프로세스마다의 시계가 달라도 같은 답이다.
- MongoDB 자신의 백업 · 되돌리기는 제품의 일이다(replica set · 주기 스냅샷). 서비스가 하는 것은 캐릭터의 지난 값(CharacterStore 의 이력)과 Store 의 백업이다.
- 게임 상태(세계의 안)는 MongoDB 에 풀어 넣지 않는다. 캐릭터의 값도 Store 도 서비스에게는 불투명한 덩어리다.

## 개념

### SnapshotStore
- 데이터: local(불변, 이 서버의 뿌리) · remote(객체 저장소의 자리).
- 기능: pull(instance, dataset) 은 올라가 있는 그 인스턴스의 Store 를 이 서버의 `<local>/stores/<instance>/<dataset 이름>` 에 내려 받아 그 dir 를 준다(없으면 빈 디렉터리). claim(instance, epoch) 은 그 인스턴스 자리의 주인을 그 세대로 적는다(띄우기 전에 컨트롤 플레인이 한다 — 작은 세대로는 못 바꾼다). push(dir, instance, epoch) 는 그 자리를 객체 저장소에 올린다 — 주인의 세대와 같을 때만 받는다(다른 곳에 다시 뜬 뒤의 낡은 호스트가 덮지 못한다). 올린 내용에는 그 세대가 붙는다. epochOf(instance) 는 주인의 세대와 올라가 있는 내용의 세대. copy(instance) 는 올라가 있는 자리의 백업 하나를 남기고 그 이름(UTC 시각)을 준다. restore(instance, 백업, epoch) 은 올라가 있는 자리를 백업으로 바꾸고(기존은 백업 하나로 남긴다) 주인과 내용의 세대를 준 세대로 적는다 — 어느 서버에 남은 자리보다도 새것이 된다. copy · prune 도 주인의 세대와 같은 세대를 든 자의 것만 받는다(컨트롤 플레인의 것은 내려간 인스턴스에만). list(instance) 는 백업 이름들(오래된 것부터). prune(instance, keep) 은 새것 keep 개를 남기고 지운다.
- 생애: Service.start 가 openStorage 로 연다.
- 올리는 것에는 세대(epoch)가 붙는다. 한 인스턴스의 자리를 쓰는 자는 표의 그 세대의 호스트 하나다.
- 도는 인스턴스의 Store 자리는 올리지 않는다 — 올리는 것은 엔진이 `backup` 으로 낸 사본의 dir 다(흐름 5 의 4). 뿌리 밖의 자리는 거절한다.

### Database
- 데이터: 없음. 값은 스토리지에 — 표 `accounts` · `characters` · `bans` · `lastZone` · `zones` · `instances` · `nodes` · `audit`.
- 기능: get(table, key) · put(table, key, value) · remove(table, key) · all(table). 줄 하나의 쓰기는 통째로 되거나 안 된다. 컨트롤 플레인의 표(`instances` · `zones` · `nodes`)의 쓰기에는 term 이 실리고, 줄에 적힌 term 보다 작으면 거절한다.
- 생애: openStorage 와 함께.

### CharacterStore
- 데이터: 없음. 값은 스토리지에 — 캐릭터마다 값(파일 하나, 불투명)과 Lease, 그리고 지난 값 몇 개(`valueKeep` 개 — 이력).
- 기능: checkout(character, holder, file) 은 lease 가 비었거나 만료됐으면 번호를 하나 올린 Lease 를 내고 값을 file 에 내려 준다(값이 아직 없으면 file 을 만들지 않는다). 남이 들고 있으면 null. checkin(character, lease, file, release) 는 lease 의 번호가 지금의 것과 같을 때만 file 을 값으로 저장한다 — 다르면 거절(false). 번호가 같으면 만료가 지났어도 받는다. 저장하면 lease 의 만료를 늦춘다. release 가 참이면 lease 를 비우고 번호를 하나 올린다 — 그 앞에 보낸 저장이 뒤늦게 닿아도 거절된다. release 인 저장과 그날의 첫 저장은 앞의 값을 이력에 남긴다. release(character, lease) 는 값을 바꾸지 않고 lease 만 비운다(번호를 올린다). expire(holder, term) 는 그 holder 가 든 lease 를 전부 비우고 번호를 하나씩 올린다. LeaderLock 의 지금 term 이 준 term 과 같을 때만 한다(물러난 줄 모르는 옛 활성의 것은 거절) — 그 holder 가 뒤늦게 하는 저장은 전부 거절된다. 값은 마지막 checkin 의 것이다. erase(character) 는 lease 가 비었을 때만 그 캐릭터의 값과 이력을 지운다 — 누가 들고 있으면 거절. versions(character) 는 이력의 때들. rollback(character, 때) 는 lease 가 비었을 때만 값을 그때의 것으로 바꾼다(지금의 값은 이력에 남는다).
- 생애: openStorage 와 함께.

### LeaderLock
- 데이터: 없음. 값은 스토리지에 — 이름마다 {holder(주소), term:int(늘기만 한다), until}.
- 기능: acquire(name, holder, ttl) 는 비었거나 만료됐으면 term 을 하나 올려 잡고 그 term 을 준다. 남이 들고 있으면 null. renew(name, holder, term) 은 제 것이면 만료를 늦춘다 — 아니면 false. holder(name) 은 지금 든 자의 주소와 term. resign(name, holder, term) 은 제 것이면 비운다 — 내려가는 활성이 놓는다.
- 생애: openStorage 와 함께.

### Lease
- 데이터: character · holder(인스턴스 이름) · n:int(늘기만 한다) · until(만료 시각). 불변.
- 기능: 없음.
- 생애: CharacterStore.checkout 이 낸다. release · expire · 만료로 사라진다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| SnapshotStore claim | 플릿(Fleet) → 스토리지 | 인스턴스 이름 · epoch | 됨 또는 거절 |
| SnapshotStore pull · push · epochOf | 플릿(NodeAgent · Fleet) → 스토리지 | 인스턴스 이름 · epoch · dataset · dir | dir · 됨 또는 거절 · epoch |
| SnapshotStore copy · restore · list · prune | 플릿(NodeAgent · Fleet) → 스토리지 | 인스턴스 이름 · 백업 이름 · keep | 백업 이름 · 목록 |
| Database get · put · remove · all | 계정 · 세션 모듈 · 플릿 · Operator → 스토리지 | table · key(· value) | value 또는 null |
| CharacterStore checkout | 플릿(NodeAgent) → 스토리지 | Character.id · holder · file | Lease 또는 null |
| CharacterStore checkin · release | 플릿(NodeAgent) → 스토리지 | Character.id · Lease · file · release | 됨 |
| CharacterStore expire | 플릿(Fleet) → 스토리지 | holder · term | 됨 또는 거절 |
| CharacterStore erase · versions · rollback | 세션 모듈 → 스토리지 | Character.id · 때 | 됨 · 때들 |
| LeaderLock acquire · renew · resign | 컨트롤 플레인 → 스토리지 | 이름 · holder · ttl · term | term 또는 null |
| LeaderLock holder | 노드 · 게이트웨이 · API 서버 → 스토리지 | 이름 | 주소 · term |

## 미정

- 없음.

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
| Database | MongoDB | 표 하나 = collection 하나 — `accounts` · `characters` · `bans` · `lastZone` · `instances` · `audit`. 줄 하나 = document 하나(`_id` 가 key) |
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
- 기능: pull(instance, dataset) 은 그 인스턴스의 Store 를 이 서버의 `<local>/stores/<instance>/<dataset 이름>` 에 내려 받아 그 dir 를 준다(없으면 빈 디렉터리). push(dir) 는 그 자리를 객체 저장소의 그 인스턴스 자리에 올린다. copy(instance) 는 올라가 있는 자리의 백업 하나를 남기고 그 이름(UTC 시각)을 준다. restore(instance, 백업) 은 올라가 있는 자리를 백업으로 바꾼다(기존은 백업 하나로 남긴다). list(instance) 는 백업 이름들(오래된 것부터). prune(instance, keep) 은 새것 keep 개를 남기고 지운다.
- 생애: Service.start 가 openStorage 로 연다.
- 도는 인스턴스의 Store 자리는 올리지 않는다 — 올리는 것은 엔진이 `backup` 으로 낸 사본의 dir 다(흐름 5 의 7′). 뿌리 밖의 자리는 거절한다.

### Database
- 데이터: 없음. 값은 스토리지에 — 표 `accounts` · `characters` · `bans` · `lastZone` · `instances` · `audit`.
- 기능: get(table, key) · put(table, key, value) · remove(table, key) · all(table). 줄 하나의 쓰기는 통째로 되거나 안 된다.
- 생애: openStorage 와 함께.

### CharacterStore
- 데이터: 없음. 값은 스토리지에 — 캐릭터마다 값(파일 하나, 불투명)과 Lease. 캐릭터마다 지난 값 몇 개(`valueKeep` — 하루에 하나씩)도 둔다.
- 기능: checkout(character, holder, file) 은 lease 가 비었거나 만료됐으면 번호를 하나 올린 Lease 를 내고 값을 file 에 내려 준다(값이 아직 없으면 file 을 만들지 않는다). 남이 들고 있으면 null. checkin(character, lease, file, release) 는 lease 의 번호가 지금의 것과 같을 때만 file 을 값으로 저장한다 — 다르면 거절(false). release 가 참이면 lease 를 비운다. 저장하면 lease 의 만료를 늦춘다. erase(character) 는 lease 가 비었을 때만 그 캐릭터의 값을 지운다 — 누가 들고 있으면 거절. expire(holder) 는 그 holder 가 든 lease 를 전부 비운다(값은 마지막 checkin 의 것). release(character, lease) 는 값을 바꾸지 않고 lease 만 비운다. versions(character) 는 지난 값의 때들. rollback(character, 때) 는 lease 가 비었을 때만 값을 그때의 것으로 바꾼다(지금의 값은 이력에 남는다).
- 생애: openStorage 와 함께.

### LeaderLock
- 데이터: 없음. 값은 스토리지에 — 이름마다 {holder(주소), term:int(늘기만 한다), until}.
- 기능: acquire(name, holder, ttl) 는 비었거나 만료됐으면 term 을 하나 올려 잡고 그 term 을 준다. 남이 들고 있으면 null. renew(name, holder, term) 은 제 것이면 만료를 늦춘다 — 아니면 false. holder(name) 은 지금 든 자의 주소와 term.
- 생애: openStorage 와 함께.

### Lease
- 데이터: character · holder(인스턴스 이름) · n:int(늘기만 한다) · until(만료 시각). 불변.
- 기능: 없음.
- 생애: CharacterStore.checkout 이 낸다. release · expire · 만료로 사라진다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| SnapshotStore pull · push | 플릿(NodeAgent) → 스토리지 | 인스턴스 이름 · dataset · dir | dir |
| SnapshotStore copy · restore · list · prune | 플릿(NodeAgent · Fleet) → 스토리지 | 인스턴스 이름 · 백업 이름 · keep | 백업 이름 · 목록 |
| Database get · put · remove · all | 계정 · 세션 모듈 · 플릿 → 스토리지 | table · key(· value) | value 또는 null |
| CharacterStore checkout | 플릿(NodeAgent) → 스토리지 | Character.id · holder · file | Lease 또는 null |
| CharacterStore checkin | 플릿(NodeAgent) → 스토리지 | Character.id · Lease · file · release | 됨 |
| CharacterStore expire | 플릿(Fleet) → 스토리지 | holder | 없음 |
| LeaderLock acquire · renew | 컨트롤 플레인 → 스토리지 | 이름 · holder · ttl · term | term 또는 null |
| LeaderLock holder | 노드 · 게이트웨이 · API 서버 → 스토리지 | 이름 | 주소 · term |

## 미정

- 없음.

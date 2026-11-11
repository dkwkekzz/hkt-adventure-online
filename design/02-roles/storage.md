# 스토리지 storage — 책임

스토리지란, 서비스의 표 · 캐릭터의 값과 lease · 인스턴스의 Store 디렉터리를 프로세스와 서버보다 오래 사는 자리에 두는 것이다.

- 값의 안을 모른다. 표의 줄 · 파일 · 디렉터리를 통째로 다룬다.
- 누가 어느 자리를 쓰는가를 모른다. 부르는 모듈이 안다.
- 여러 프로세스 · 여러 서버가 같은 스토리지를 같이 쓴다.
- 밖에 내보내는 것은 openStorage 하나다. 모양은 `protocol/storage.ts`.

| 개념 | 책임 하나 | 뒤 |
|---|---|---|
| Database | 표의 줄을 읽고 쓴다 | MongoDB — 표 하나 = collection 하나 |
| CharacterStore | 캐릭터의 값을 둔다 | MongoDB — 캐릭터마다 document 하나(크면 GridFS) |
| Leases | 캐릭터의 값을 지금 누가 들고 있는가를 든다 | MongoDB — 캐릭터마다 document 하나 |
| SnapshotStore | 인스턴스의 Store 디렉터리와 그 백업을 둔다 | object storage(S3 호환) |
| LeaderLock | 활성 컨트롤 플레인이 하나임을 지킨다 | MongoDB — document 하나 |

- 접속 문자열은 환경변수 `MONGODB_URI`. 줄 하나의 쓰기는 document 하나의 원자적 갱신이다 — 트랜잭션에 기대지 않는다.
- MongoDB 는 replica set 으로 뜬다. 그 자신의 백업은 제품의 일이다.
- 개발의 뒤는 디렉터리 뿌리 하나다. 모양은 같다.

## 개념

### Database
- 데이터: 없음. 값은 스토리지에 — 표 `accounts` · `accountInfo` · `characters` · `bans` · `lastZone` · `zones` · `instances` · `nodes` · `audit`.
- 기능: get(table, key) · put(table, key, value) · remove(table, key) · all(table). 줄 하나의 쓰기는 통째로 되거나 안 된다.
- 생애: openStorage 와 함께.

### CharacterStore
- 데이터: 없음. 값은 스토리지에 — 캐릭터마다 값(파일 하나, 불투명)과 지난 값 몇 개(이력).
- 기능: read(character, file) 은 값을 file 에 내려 준다(아직 없으면 만들지 않는다). write(character, lease, file) 은 그 lease 가 지금의 것일 때만 file 을 값으로 저장한다 — 아니면 거절. erase(character) 는 값과 이력을 지운다(누가 lease 를 들고 있으면 거절). versions(character) 는 이력의 때들. rollback(character, 때) 는 값을 그때의 것으로 바꾼다(누가 들고 있으면 거절).
- 생애: openStorage 와 함께.

### Leases
- 데이터: 없음. 값은 스토리지에 — 캐릭터마다 Lease.
- 기능: acquire(character, holder) 는 비었거나 만료됐으면 번호를 하나 올린 Lease 를 낸다. 누가 들고 있으면 null. renew(lease) 는 만료를 늦춘다. release(lease) 는 비운다. expire(holder) 는 그 holder 가 든 것을 전부 비운다. 비울 때마다 번호가 오른다 — 앞의 lease 로 하는 뒤늦은 저장은 거절된다.
- 생애: openStorage 와 함께.
- 캐릭터 하나의 값은 한때에 인스턴스 하나만 든다. 그것을 지키는 것이 이것 하나다.

### Lease
- 데이터: character · holder(인스턴스의 이름과 세대) · n:int(늘기만 한다) · until(만료 — 스토리지의 시각). 불변.
- 기능: 없음.

### SnapshotStore
- 데이터: local(이 서버의 뿌리) · remote(object storage 의 자리).
- 기능: pull(instance) 은 올라가 있는 그 인스턴스의 Store 를 이 서버에 내려 받아 dir 를 준다(없으면 빈 디렉터리). push(dir, instance, epoch) 는 그 자리를 올린다 — 통째로 되거나 안 되고, 올라가 있는 것보다 낡은 세대의 것은 거절한다. copy(instance) 는 올라가 있는 것의 백업 하나를 남긴다. restore(instance, 백업) 은 올라가 있는 것을 백업으로 바꾼다(기존은 백업 하나로 남긴다). list(instance) 는 백업 이름들. prune(instance, keep) 은 새것 keep 개를 남기고 지운다. purge(instance) 는 전부 지운다.
- 생애: openStorage 와 함께.

### LeaderLock
- 데이터: 없음. 값은 스토리지에 — {holder(주소), term:int(늘기만 한다), until}.
- 기능: acquire(holder, ttl) 는 비었거나 만료됐으면 term 을 하나 올려 잡는다. 남이 들고 있으면 null. renew(holder, term) 은 제 것이면 만료를 늦춘다. resign(holder, term) 은 제 것이면 비운다. holder() 는 지금 든 자의 주소와 term.
- 생애: openStorage 와 함께.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Database get · put · remove · all | 계정 · 세션 모듈 · 플릿 · Operator → 스토리지 | table · key(· value) | value 또는 null |
| CharacterStore read · write | 플릿(Loader) → 스토리지 | Character.id · Lease · file | 됨 또는 거절 |
| CharacterStore erase · versions · rollback | 컨트롤 플레인 → 스토리지 | Character.id · 때 | 됨 · 때들 |
| Leases acquire · renew · release | 플릿(Loader) → 스토리지 | Character.id · holder · Lease | Lease 또는 null |
| Leases expire | 플릿(Recoverer) → 스토리지 | holder | 없음 |
| SnapshotStore pull · push · copy · prune | 플릿(Runner · Backuper) → 스토리지 | 인스턴스 이름 · epoch · dir | dir · 백업 이름 · 거절 |
| SnapshotStore copy · restore · list · purge | Operator → 스토리지 | 인스턴스 이름 · 백업 이름 | 백업 이름 · 목록 |
| LeaderLock acquire · renew · resign | 컨트롤 플레인 → 스토리지 | holder · ttl · term | term 또는 null |
| LeaderLock holder | 노드 · 게이트웨이 · API 서버 → 스토리지 | 없음 | 주소 · term |

## 미정

- 없음.

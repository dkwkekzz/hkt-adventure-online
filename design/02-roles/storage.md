# 스토리지 storage — 책임

스토리지란, 서비스의 표 · 캐릭터의 값과 lease · 인스턴스의 Store 디렉터리를 프로세스와 서버보다 오래 사는 자리에 두는 것이다.

- 값의 안을 모른다. 표의 줄 · 파일 · 디렉터리를 통째로 다룬다.
- 누가 어느 자리를 쓰는가를 모른다. 부르는 모듈이 안다.
- 여러 프로세스 · 여러 서버가 같은 스토리지를 같이 쓴다. 그래서 표는 줄 하나씩, 캐릭터의 값은 lease 의 번호로 지킨다.
- 뒤는 밖의 제품이다 — 표와 lease 는 DB, 값과 디렉터리는 객체 저장소. 개발의 뒤는 디렉터리 뿌리 하나다. 모양은 같다.
- 밖에 내보내는 것은 openStorage 하나다. 모양은 `protocol/storage.ts`.

```text
SnapshotStore  ← Service(노드 · 컨트롤 플레인)     (openStorage)
Database ← Service(API 서버 · 컨트롤 플레인)
CharacterStore ← Service(노드 · 컨트롤 플레인)
```

## 개념

### SnapshotStore
- 데이터: local(불변, 이 서버의 뿌리) · remote(객체 저장소의 자리).
- 기능: pull(instance, dataset) 은 그 인스턴스의 Store 를 이 서버의 `<local>/stores/<instance>/<dataset 이름>` 에 내려 받아 그 dir 를 준다(없으면 빈 디렉터리). push(dir) 는 그 자리를 객체 저장소의 그 인스턴스 자리에 올린다. copy(instance) 는 올라가 있는 자리의 백업 하나를 남기고 그 이름(UTC 시각)을 준다. restore(instance, 백업) 은 올라가 있는 자리를 백업으로 바꾼다(기존은 백업 하나로 남긴다). list(instance) 는 백업 이름들(오래된 것부터). prune(instance, keep) 은 새것 keep 개를 남기고 지운다.
- 생애: Service.start 가 openStorage 로 연다.
- 도는 인스턴스의 자리는 올리지도 백업하지도 않는다. 뿌리 밖의 자리는 거절한다.

### Database
- 데이터: 없음. 값은 스토리지에 — 표 `accounts` · `characters` · `bans` · `lastZone` · `instances`.
- 기능: get(table, key) · put(table, key, value) · remove(table, key) · all(table). 줄 하나의 쓰기는 통째로 되거나 안 된다.
- 생애: openStorage 와 함께.

### CharacterStore
- 데이터: 없음. 값은 스토리지에 — 캐릭터마다 값(파일 하나, 불투명)과 Lease.
- 기능: checkout(character, holder, file) 은 lease 가 비었거나 만료됐으면 번호를 하나 올린 Lease 를 내고 값을 file 에 내려 준다(값이 아직 없으면 file 을 만들지 않는다). 남이 들고 있으면 null. checkin(character, lease, file, release) 는 lease 의 번호가 지금의 것과 같을 때만 file 을 값으로 저장한다 — 다르면 거절(false). release 가 참이면 lease 를 비운다. 저장하면 lease 의 만료를 늦춘다. expire(holder) 는 그 holder 가 든 lease 를 전부 비운다(값은 마지막 checkin 의 것).
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

## 미정

- 없음.

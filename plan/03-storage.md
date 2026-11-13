# plan 03 — 스토리지

상태: ☑ · 어디: online · design/02-roles/storage.md

스토리지 모듈의 개념을 design 대로 갈랐다 — Database · CharacterStore · Leases · LeaderLock 은 문서의 뒤(MongoDB `MONGODB_URI`), SnapshotStore 는 물건의 뒤(object storage `SNAPSHOT_URI`). 환경변수가 없는 쪽은 `storageRoot` 의 디렉터리다(개발). 밖에 내보내는 것은 `openStorage` 하나.

## 세운 것

| | 무엇 | 자리 |
|---|---|---|
| ☑ | 소켓 — DatabaseSocket · CharacterStoreSocket · LeasesSocket · SnapshotStoreSocket · LeaderLockSocket · StorageSocket · StorageOptions | `src/protocol/storage.ts` |
| ☑ | Database — 표의 줄. 계정(Directory 가 `accounts` · `accountInfo` 를 줄 하나씩, 메모리에 두지 않는다) · 배정(Assignment 가 `instances` — 줄에 Store 의 자리가 없고 세대 epoch 가 있다) · audit(운영자의 명령마다 한 줄, 흐름 6 의 3) | `src/storage/database.ts` |
| ☑ | SnapshotStore — Store 자리를 통째로 tar.gz 하나로 올리고(push, 낡은 세대는 거절) 내린다(pull — 이 서버의 자리가 올라간 판에서 났으면 그대로). 백업 · 되돌림 · 나열 · 남김 · 지움. 띄울 때 pull(흐름 3 의 13), 호스트가 저장하고 끝나면 push(흐름 7 의 5), 백업은 그 뒤의 주기(흐름 5 의 3)와 운영자(흐름 6 의 4) | `src/storage/snapshot-store.ts` · `pack.ts` |
| ☑ | CharacterStore · Leases · LeaderLock — 소켓과 두 뒤. 쓰는 것은 plan 07 · 08. lease 의 번호를 값에 적어 트랜잭션 없이 뒤늦은 쓰기를 막는다 | `src/storage/character-store.ts` · `leases.ts` · `leader-lock.ts` |
| ☑ | 뒤 — 문서: 디렉터리(`docs.ts`) · MongoDB(`mongo.ts`, 드라이버는 MONGODB_URI 가 있을 때만 읽는다). 물건: 디렉터리(`bucket.ts`) · S3 호환(`s3.ts`, Signature V4 를 node 의 crypto 로) | `src/storage/` |
| ☑ | 흐름 7 의 11 — Service.stop 이 마지막에 스토리지를 닫는다. 스토리지에 닿지 않으면 시작 거부(흐름 1 의 1), 로그인은 503(흐름 2) | Service · Api |

## 관측에 보이는 것

- 그림의 Storage 연결에 글이 지난다 — 흐름 3 의 13(SnapshotStore.pull) · 6 의 3(Database.put). 스토리지 상자의 「닿은 단계」가 는다.
- 흐름 3 의 13, 5 의 3 · 6 의 4(backup · restore), 7 의 5 가 SnapshotStore 를 부르는 자리에서 흔적을 남긴다.
- api · control 상자의 「개념 섰다」에 Database 가 든다(control 8 / 25, node 에는 CharacterStore · Leases · SnapshotStore).

## 덧붙임

- 지도는 단계를 앞 단계의 프로세스에 놓는다 — 지금은 흐름 3 의 12(Runner.start)가 흔적을 남기지 않아 13 이 control → 스토리지로 그려진다. Runner 가 서면(plan 07) node → 스토리지가 된다. api → 스토리지는 흐름에 Database 를 부르는 api 의 단계가 없어 0 이다(Directory.resolve 의 안).
- 캐릭터의 값은 document 하나에 이력과 함께 든다 — 상한 1MB. 넘는 값의 GridFS 는 아직 없다.
- 디렉터리의 뒤는 한 프로세스가 쓴다(swap 의 원자성이 그 프로세스 안의 것). 여러 프로세스 · 서버는 MongoDB · object storage 로.
- 옛 저장장치의 자리(`<root>/ledger` · `<root>/shards`)는 읽지 않는다 — 개발의 계정 · 세계는 새로 선다.

## 직관 확인

서비스를 내렸다 다른 서버에서 같은 스토리지로 띄우면 계정 · 배정 · 세계가 그대로다 — `src/apps/main/tests/service.spec.ts` 의 「다른 서버에서 같은 스토리지로」(빈 local, 같은 db · bucket). 진짜 MongoDB · object storage 위의 같은 검사는 env 가 있을 때 돈다 — 로컬에 MongoDB 를 세우는 차례는 `notes/mongodb-local.md`(`npm run mongo:up`):

```bash
MONGODB_URI=mongodb://localhost:27017 npx vitest run src/storage/tests/mongo.spec.ts
SNAPSHOT_URI=s3://<bucket>/<prefix> S3_ENDPOINT=http://localhost:9000 AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… npx vitest run src/storage/tests/s3.spec.ts
MONGODB_URI=… SNAPSHOT_URI=… npm run check     # 진짜 엔진 위의 조립(engine.spec.ts)도 그 뒤 위에서
```

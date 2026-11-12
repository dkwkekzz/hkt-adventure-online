# 스토리지 — 뒤를 고르고 자리를 읽는 법

설계는 `design/02-roles/storage.md`. 여기는 지금 선 것을 쓰는 법만.

## 뒤를 고른다

환경변수 둘이 정한다. 없는 쪽은 `storageRoot`(`service.config.json`, env `SERVICE_STORAGE`)의 디렉터리다.

| 환경변수 | 무엇이 거기 가는가 | 없으면 |
|---|---|---|
| `MONGODB_URI` | 표(계정 · 배정 · audit …) · 캐릭터의 값 · lease · 활성의 잠금 | `<root>/db/` |
| `SNAPSHOT_URI=s3://<bucket>/<prefix>` | 인스턴스의 Store 와 백업 | `<root>/bucket/` |

- MongoDB 의 데이터베이스 이름은 URI 의 경로(`mongodb://host/hkt`), 없으면 `hkt`. 트랜잭션을 쓰지 않으므로 단일 서버(mongod 하나)로도 돈다 — 운영은 replica set.
- object storage 는 S3 호환이면 된다(AWS · MinIO · R2 …). 끝점은 `S3_ENDPOINT`(없으면 `https://s3.<AWS_REGION>.amazonaws.com`), 자격은 `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY`(· `AWS_SESSION_TOKEN`), region 은 `AWS_REGION`(없으면 `us-east-1`). 부름은 path-style 이다.
- 자격은 설정 파일 · 기록 · 관측에 싣지 않는다. 시작할 때 찍는 `스토리지 — …` 줄에는 MongoDB 의 호스트와 bucket 이름만 나온다.
- MongoDB 에 닿지 않으면 서비스는 시작하지 않는다. object storage 는 처음 띄울 때(SnapshotStore.pull) 닿는다 — 거기서 실패하면 그 입장이 거절되고 다음 입장이 다시 한다.

```bash
HOST_AUTH_KEY=… MONGODB_URI=mongodb://localhost:27017/hkt \
  SNAPSHOT_URI=s3://hkt-store/dev S3_ENDPOINT=http://localhost:9000 AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… npm start
```

## 무엇이 어디에

```text
문서(MongoDB 의 collection = 디렉터리의 <root>/db/<이름>/)
  accounts        Identity.key → Account.id
  accountInfo     Account.id → {seen}
  instances       세계의 이름 → {dataset, port, epoch}      epoch 는 띄울 때마다 하나 오른다
  audit           `<ISO 시각> <run>` → {at, operator, line}  운영자의 명령마다
  leases · characterValues · leader                         plan 07 · 08 이 쓴다
물건(object storage 의 <prefix>/ = 디렉터리의 <root>/bucket/)
  <세계>/current.tgz              지금의 Store — meta 의 epoch · rev
  <세계>/backups/<UTC 시각>.tgz    백업
이 서버(<root>/local/)
  <세계>/                          엔진이 쓰는 Store 자리(--store)
  <세계>.rev                       그 자리가 어느 판에서 났는가
```

- 디렉터리의 뒤에서 줄 하나는 `{"v": n, "value": …}` JSON 파일 하나다. 파일 이름은 key 를 감춘 것(`guest%3Aabc.json`).
- 띄울 때 올라간 Store 를 내려 받고, 호스트가 저장하고 끝나면 올린다. 이 서버의 자리가 올라간 판과 같은 판에서 났으면 내려 받지 않는다 — 호스트가 죽어 올리지 못한 진행은 같은 서버에서 다시 띄우면 이어진다. 다른 서버로 가면 마지막으로 올린 것에서 선다.
- `.tgz` 는 보통의 tar.gz 다 — `tar tzf current.tgz` 로 안을 볼 수 있다(디렉터리의 뒤에서는 파일 앞에 meta 머리가 붙어 있어 바로는 안 된다).

## 백업과 되돌림 (stdin 의 Operator)

```text
stop main            내린다 — Store 를 올린다
backup main          올라간 것의 백업 하나 → 이름
status main          … 백업 <이름들>
restore main <이름>   올라간 것을 그 백업으로(기존은 백업 하나로 남는다). 다음 입장이 내려 받는다
```

- 백업은 `backupEvery` 박자마다 저절로도 난다 — 내려가 올린 뒤 아직 백업하지 않은 세계만.
- 명령마다 표 `audit` 에 한 줄이 남는다(운영자의 이름은 지금 `stdin`). 기록하지 못하면 명령을 하지 않는다.

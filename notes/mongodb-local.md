# 로컬에서 진짜 MongoDB 로 — 띄우고 · 확인하고 · 서비스를 그 위에

스토리지의 뒤를 고르는 법 · 무엇이 어디 놓이는가는 [storage.md](storage.md). 여기는 내 컴퓨터에 MongoDB 를 세워 서비스와 검사를 그 위에서 돌리는 차례만.

서비스는 트랜잭션을 쓰지 않는다 — mongod 하나(standalone)로도, 멤버 하나인 replica set 으로도 돈다. 운영은 replica set 이라 docker 의 길은 그 모양으로 띄운다.

## 1. 띄운다

### A. docker (권장)

docker 와 compose v2 가 있으면 저장소의 파일 하나로 띄운다.

```bash
npm run mongo:up      # docker compose -f scripts/mongo.compose.yaml up -d --wait
```

- 이미지 `mongo:8.0`, 포트 `127.0.0.1:27017`(이 컴퓨터에서만), 데이터는 볼륨 `hkt-mongo`.
- `--wait` 는 healthcheck 가 replica set `rs0` 을 세울 때까지(처음 한 번 `rs.initiate`) 기다린다. 끝나면 `Container hkt-online-mongo-1 Healthy`.
- 접속 문자열:

```bash
export MONGODB_URI='mongodb://localhost:27017/hkt?replicaSet=rs0'
```

내릴 때는 `npm run mongo:down`(데이터는 볼륨에 남는다). 데이터까지 지우려면 그 뒤 `docker volume rm hkt-mongo`.

### B. 설치 (docker 없이)

설치한 mongod 는 standalone 으로 뜬다. 접속 문자열에 `replicaSet` 을 붙이지 않는다.

```bash
# macOS — Homebrew
brew tap mongodb/brew
brew install mongodb-community@8.0
brew services start mongodb-community@8.0

# Ubuntu 24.04 — MongoDB 의 apt 저장소
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# 어느 OS 든 — 받은 tar 의 bin/mongod 를 그대로
mkdir -p out/mongo && mongod --dbpath out/mongo --port 27017 --bind_ip 127.0.0.1
```

```bash
export MONGODB_URI='mongodb://localhost:27017/hkt'
```

- Windows 는 MongoDB 의 MSI 로 깔면 서비스로 뜬다. 접속 문자열은 같다.
- 데이터베이스 이름은 URI 의 경로(`/hkt`). 빼면 `hkt` 다.

## 2. 닿는가 — 스토리지의 검사

```bash
MONGODB_URI="$MONGODB_URI" npx vitest run src/storage/tests/mongo.spec.ts
```

- `Tests 9 passed` 면 Database · Leases · CharacterStore · LeaderLock 이 디렉터리의 뒤와 같은 검사(`conform.ts`)를 MongoDB 위에서 지났다.
- 검사는 `hkt-test-xxxxxxxx` 라는 새 데이터베이스를 쓰고 끝에 지운다 — `/hkt` 의 데이터를 건드리지 않는다.
- 전부를 그 위에서: `MONGODB_URI="$MONGODB_URI" npm run check` — 서비스의 조립 테스트도 MongoDB 위에서 돈다(engine/ 이 있으면 진짜 엔진 위의 것까지). 디렉터리의 뒤로 도는 테스트는 그대로 디렉터리다.

## 3. 서비스를 그 위에

```bash
HOST_AUTH_KEY=dev MONGODB_URI="$MONGODB_URI" npm start
```

- 시작 줄에 `스토리지 — MongoDB mongodb://localhost:27017/hkt · Store 디렉터리` 가 찍히면 그 뒤다(자격 · 질의는 찍지 않는다).
- MongoDB 에 닿지 않으면 10 초 뒤 시작하지 않고 끝난다(`[service] … ECONNREFUSED` 또는 `Server selection timed out`).
- Store(세계)는 `SNAPSHOT_URI` 를 주지 않는 한 `SERVICE_STORAGE`(기본 `out/storage`)의 디렉터리에 남는다.

## 4. 들여다본다

```bash
# docker 의 길
docker compose -f scripts/mongo.compose.yaml exec mongo mongosh hkt
# 설치의 길
mongosh "$MONGODB_URI"
```

```js
show collections                                   // accounts · accountInfo · instances · audit …
db.accounts.find()                                 // { _id: 'guest:<주체>', value: 'p…', v: 1 }
db.instances.find()                                // { _id: 'main', value: { dataset, port, epoch }, v }
db.audit.find().sort({ _id: -1 }).limit(5)         // 운영자의 명령 — { at, operator, line }
```

줄 하나는 `{ _id: key, value, v }` 다. `v` 는 쓸 때마다 하나 오른다 — 손으로 고칠 때도 `v` 를 올려 두면 같은 줄을 동시에 바꾸던 쪽이 그것을 알아챈다.

## 5. 직관 확인 — 다른 서버에서 같은 MongoDB 로

```bash
HOST_AUTH_KEY=dev MONGODB_URI="$MONGODB_URI" SERVICE_STORAGE=out/storage-a npm start
#   게스트 페이지에서 들어가기 → 세계가 뜬다 → Ctrl+C
HOST_AUTH_KEY=dev MONGODB_URI="$MONGODB_URI" SERVICE_STORAGE=out/storage-b npm start
#   같은 브라우저로 들어가기
```

- 같은 계정이다(브라우저가 든 주체 → `accounts`). 같은 배정이다 — 같은 포트, `instances` 의 epoch 가 하나 오른다.
- 세계는 새로 선다 — Store 는 `out/storage-a/bucket` 에 있고 b 는 그것을 모른다. 세계까지 따라오게 하려면 두 번 다 같은 `SNAPSHOT_URI`(S3 호환 object storage — [storage.md](storage.md))를 준다.

## 막히면

| 보이는 것 | 까닭 · 할 것 |
|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | mongod 가 떠 있지 않다 — `npm run mongo:up` 또는 `brew services start …` · `systemctl start mongod` |
| `Server selection timed out` · `getaddrinfo ENOTFOUND <글>` | replica set 의 멤버 이름이 이 컴퓨터에서 닿지 않는다. 이 저장소의 compose 는 `localhost:27017` 로 세운다 — 다른 방법으로 세운 replica set 이면 URI 에 `&directConnection=true` 를 붙이거나 멤버 이름을 `localhost:27017` 로 |
| `npm run mongo:up` 이 `address already in use` | 27017 을 다른 mongod 가 쓴다 — 그것을 쓰거나(B 의 URI) 내린다 |
| `Authentication failed` · `requires authentication` | 인증을 켠 서버다 — URI 에 자격을 넣는다: `mongodb://<user>:<pass>@localhost:27017/hkt?authSource=admin`. 시작 줄 · 관측에는 자격이 찍히지 않는다 |
| 검사가 중간에 끊겼다 | `hkt-test-*` 데이터베이스가 남는다 — mongosh 에서 `db.getSiblingDB('hkt-test-…').dropDatabase()` |
| 처음부터 다시 | docker: `npm run mongo:down && docker volume rm hkt-mongo`. 설치: `mongosh "$MONGODB_URI" --eval 'db.dropDatabase()'` |

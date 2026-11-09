# 저장장치 storage — 책임

저장장치란, 샤드의 Store 디렉터리와 서비스의 표를 프로세스보다 오래 사는 자리에 두는 것이다.

- 파일의 안을 모른다. 자리 · 사본 · 되돌리기만.
- 누가 어느 자리를 쓰는가를 모른다. 함대가 안다.
- 1 차의 저장장치는 마운트된 볼륨 하나(디렉터리 뿌리)다. 객체 저장소는 Vault 의 다른 구현이고 모양은 같다.
- 밖에 내보내는 것은 openVault 하나다. 모양은 `protocol/vault.ts`.

```text
Vault  ← Service (openVault)
Ledger ← Vault
```

## 개념

### Vault
- 데이터: root(불변) · ledger.
- 기능: dirOf(account, dataset) 은 `<root>/shards/<Account.id>/<dataset 이름>` 을 만들어 준다(dataset 이름은 엔진의 storeName 과 같다 — 파일이면 `.json` 을 뗀 이름, 폴더면 `<이름>-pieces`). copy(dir) 은 `<root>/backups/<Account.id>/<dataset 이름>/<UTC 시각 YYYYMMDDTHHMMSSmmmZ>/` 로 통째 베끼고 그 이름을 준다. restore(dir, 사본) 은 자리를 사본으로 바꾼다(기존은 copy 로 사본 하나로 남긴다). list(dir) 은 그 자리의 사본 이름들(오래된 것부터).
- 생애: Service.start 가 openVault 로 연다.
- 안을 읽지 않는다. 디렉터리를 통째로 다룬다. root 밖의 자리는 거절한다.

### Ledger
- 데이터: 없음. 값은 저장장치에 — `<root>/ledger/<slot>.json`. slot 은 `directory` · `assignment`.
- 기능: load(slot) · save(slot, value). JSON 통째. save 는 옆 파일에 쓰고 이름을 바꾼다(반쯤 쓴 표가 남지 않는다).
- 생애: Vault 와 함께.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Vault dirOf | 함대 → 저장장치 | account · dataset | dir |
| Vault copy | 함대 → 저장장치 | dir | 사본 이름 |
| Vault restore | 함대 → 저장장치 | dir · 사본 이름 | 없음(없는 사본이면 던진다) |
| Vault list | 함대 → 저장장치 | dir | 사본 이름들 |
| Ledger load · save | 계정 · 함대 → 저장장치 | slot(· value) | value 또는 null |

## 미정

- 없음.

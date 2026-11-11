# plan 03 — 스토리지

상태: ☐ · 어디: online · design/02-roles/storage.md

스토리지 모듈의 개념을 design 대로 가르고 뒤를 바꾼다 — Database · CharacterStore · Leases · LeaderLock 은 MongoDB(`MONGODB_URI`), SnapshotStore 는 object storage. 개발의 뒤는 디렉터리 하나 그대로.
지금의 Vault · Ledger 는 이 개념들로 갈린다.

## 세울 것

| | 무엇 |
|---|---|
| ☐ | Database — 표의 줄. 계정 · 배정 · audit 의 표 |
| ☐ | SnapshotStore — 인스턴스의 Store 와 백업(지금의 Vault 의 베낌 · 되돌림) |
| ☐ | CharacterStore · Leases · LeaderLock 의 소켓과 디렉터리 뒤 — 쓰는 것은 plan 07 · 08 |
| ☐ | MongoDB · object storage 의 뒤 |

## 직관 확인

서비스를 내렸다 다른 서버에서 같은 MongoDB 로 띄우면 계정 · 배정이 그대로다.

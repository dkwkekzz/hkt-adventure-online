# notes

사람이 읽는 설명서. 설계(`design/`)가 아니다 — 흐름 · 책임을 새로 정하지 않고, 이미 선 것을 쓰는 법만 적는다.
설계나 코드가 바뀌면 같은 커밋에서 고친다. 지금 상태만 적는다.

| 파일 | 무엇 |
|---|---|
| [observe.md](observe.md) | 관측 페이지 — 보기 둘, 지금 믿을 수 있는 것과 아닌 것, 사람이 보이는 방식 |
| [mongodb-local.md](mongodb-local.md) | 로컬에서 진짜 MongoDB — docker(`npm run mongo:up`) 또는 설치로 띄우고, 스토리지의 검사 · 서비스를 그 위에서 돌리고, 들여다보고, 막히면 |
| [storage.md](storage.md) | 스토리지 — 뒤를 고르는 환경변수, 디렉터리 · MongoDB · object storage 에 무엇이 어떻게 놓이는가, 백업과 되돌림 |
| [auth-token.md](auth-token.md) | 서명 키(`HOST_AUTH_KEY`)와 토큰 — 지금 어떻게 설정되어 있고, 새 클라이언트가 토큰을 어떻게 받아 어떻게 주입하는가 |

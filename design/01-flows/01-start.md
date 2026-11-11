# 흐름 1. 시작 — 프로세스가 뜬다

트리거: 프로세스. role(`api` · `gateway` · `control` · `node` · 개발의 `main`)과 설정(`service.config.json`), 환경변수 `HOST_AUTH_KEY`(서명 키) · `MONGODB_URI` 를 들고 온다.
한 줄: 제 role 의 모듈을 세우고 듣는다. 노드는 지난 실행이 남긴 것을 치우고 컨트롤 플레인에 자기를 알린다. 인스턴스는 입장이나 예비 용량이 띄운다.

## 순서

```text
Service.start                                           [앱]
  api      openStorage · Directory · Signer · Spawner.bundle · Api 열기       [스토리지 · 계정 · 플릿]
  gateway  openStorage(LeaderLock) · Signer · Gateway — 소켓 듣기              [스토리지 · 계정 · 게이트웨이]
  control  openStorage · Signer · Directory · Service.elect                   [스토리지 · 계정]  ⇒ 흐름 13
  node     Spawner.missing · openStorage · Signer · NodeAgent.start           [플릿 · 스토리지 · 계정]
             NodeAgent.reap · NodeAgent.recover ── CharacterStore.checkin     [스토리지]
             NodeRpc register ─► Fleet.register                               [플릿 — 컨트롤 플레인]  ⇒ 흐름 5 의 6 ~ 8
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | 전부 | Service.start | 서명 키(`HOST_AUTH_KEY`)가 없으면 시작 거부 ✕. 컨트롤 플레인은 운영자의 키(`OPERATOR_KEY`)도 — 그것은 컨트롤 플레인만 든다 | |
| 2 | api | Service → Directory · Signer | 스토리지를 열고 Database 를 주어 만든다 | |
| 3 | api | Service → Spawner.bundle | 뷰어를 한 번 묶는다. 묶지 못하면 시작 거부 ✕. Api(http)를 연다 | 클라이언트 ◇ |
| 4 | gateway | Service → Gateway | 스토리지를 열어 LeaderLock 만 본다(활성 컨트롤 플레인을 찾는다). Signer 의 verify 를 값으로 주어 만들고 소켓을 듣는다. Clock 으로 Gateway.heartbeat | 클라이언트 ◇ |
| 5 | control | Service → Service.elect | 스토리지를 열고 LeaderLock 을 잡으러 간다. 잡으면 활성으로 서고(Fleet.start · SessionManager · Operator), 못 잡으면 대기다 | ⇒ 흐름 13 |
| 6 | node | Service → NodeAgent.start | Spawner.missing — 엔진 체크아웃이 없으면 시작 거부 ✕ | |
| 7 | node | NodeAgent.reap | 지난 실행이 남긴 호스트 · 에이전트 프로세스를 끝낸다(spool 의 pid 표). stdin 을 잃은 호스트는 다룰 수 없다 | |
| 8 | node | NodeAgent.recover → CharacterStore.checkin | spool 에 남은 캐릭터 파일을 그 lease 의 번호로 저장하고 lease 를 푼다(release). 거절되면(그 사이 다른 곳에 배정됐다) 버린다. 스토리지에 닿지 않으면 held 에 두고 흐름 5 의 3 이 다시 한다 | 값이 스토리지에  |
| 9 | node | NodeAgent → NodeRpc register | 컨트롤 플레인에 이름 · 주소 · 빌드 · slots 와 도는 인스턴스들을 알리고 Clock.run. 막 뜬 노드에는 도는 인스턴스가 없다 | |
| 10 | control | Fleet.register(node, 보고) | Node 를 적고(표 `nodes` 의 cordoned 를 읽는다) 보고를 heartbeat 와 같이 표와 맞춘다 | ⇒ 흐름 5 의 6 ~ 8 |

## 멈추는 자리

- 프로세스마다 듣는다.

## 이어지는 흐름

- 2 로그인 · 3 입장 · 5 주기 작업 · 6 운영자 · 7 종료 · 13 컨트롤 플레인 전환.

## 규칙

- 시작은 엔진 프로세스를 띄우지 않는다. 띄우는 것은 입장(흐름 3)과 예비 용량(흐름 5)이다.
- 노드 에이전트만 죽었다 다시 뜨면 그 노드의 인스턴스는 전부 죽은 것이다 — 7 이 끝내고, 컨트롤 플레인은 register 에 그 인스턴스들이 없는 것을 보고 장애 복구로 간다(흐름 5 의 7 ⇒ 흐름 12). 든 캐릭터의 값은 8 이 저장한 것(마지막 스냅샷)이다.
- 프로세스가 뜨는 순서는 정해지지 않는다. 활성 컨트롤 플레인을 모르면 노드 · 게이트웨이 · API 서버는 LeaderLock.holder 로 찾고 알림을 되풀이한다(흐름 13 의 5).

## 미정

- 없음.

# 흐름 1. 시작 — 프로세스가 뜬다

트리거: 프로세스. role(`api` · `gateway` · `control` · `node` · 개발의 `main`)과 설정(`service.config.json`), 환경변수 `HOST_AUTH_KEY`(서명 키)를 들고 온다.
한 줄: 제 role 의 모듈을 세우고 듣는다. 노드는 컨트롤 플레인에 자기를 알린다. 인스턴스는 입장이나 예비 용량가 띄운다.

## 순서

```text
Service.start                                           [앱]
  api      openStorage · Directory · Signer · Spawner.bundle · Api 열기     [스토리지 · 계정 · 플릿]
  gateway     Signer · Gateway — 소켓 듣기                                    [계정 · 게이트웨이]
  control  openStorage · Signer · Fleet.start · SessionManager · Operator        [스토리지 · 계정 · 플릿 · 세션 모듈]
  node     Spawner.missing · openStorage · NodeAgent.start ── NodeRpc register       [플릿 · 스토리지]
             Fleet.register                                                     [플릿] ◇
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | 전부 | Service.start | 서명 키가 없으면 시작 거부 ✕ | |
| 2 | front | Service → Directory · Signer | 스토리지를 열고 Database 를 주어 만든다 | |
| 3 | front | Service → Spawner.bundle | 뷰어를 한 번 묶는다. 묶지 못하면 시작 거부 ✕. Api(http)를 연다 | 클라이언트 ◇ |
| 4 | gate | Service → Gateway | Signer 의 verify 를 값으로 주어 만들고 소켓을 듣는다. Clock 으로 Gateway.heartbeat | 클라이언트 ◇ |
| 5 | control | Service → Fleet.start | Assignment 의 줄마다 Instance 를 `stopped` 로. Clock.run | Instance × 줄 |
| 6 | control | Service → SessionManager · Operator | 설정의 존마다 Zone · Queue. 플릿의 기능 넷과 Signer 의 issue 를 값으로 준다. SessionRpc · NodeRpc · Operator 를 듣는다 | ◇ |
| 7 | node | Service → NodeAgent.start | Spawner.missing — 엔진 체크아웃이 없으면 시작 거부 ✕. 컨트롤 플레인에 NodeRpc register(이름 · 주소 · slots · 지금 도는 인스턴스들)을 보내고 Clock.run | |
| 8 | control | Fleet.register(node) | Node 을 적는다. 노드가 알린 도는 인스턴스는 `ready` 로 되찾고, 표에 없는 것은 그 노드에 stop 을 시킨다 | Node |

## 멈추는 자리

- 프로세스마다 듣는다. 컨트롤 플레인의 표: Node · Instance · 빈 접속 표.

## 이어지는 흐름

- 2 로그인 · 3 입장 · 5 주기 작업 · 6 운영자 · 7 종료.

## 규칙

- 시작은 엔진 프로세스를 띄우지 않는다. 띄우는 것은 입장(흐름 3)과 예비 용량(흐름 5)다.
- 컨트롤 플레인이 다시 서면 접속 표는 비어 있다. 게이트웨이의 heartbeat(흐름 5)와 노드의 register · heartbeat 가 그것을 다시 채운다. 그 사이 붙어 있는 사람은 그대로 논다.
- 프로세스가 뜨는 순서는 정해지지 않는다. 컨트롤 플레인이 아직 없으면 노드 · 게이트웨이는 알림을 되풀이한다.

## 미정

- 없음.

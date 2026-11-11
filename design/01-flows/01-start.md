# 흐름 1. 시작 — 프로세스가 뜬다

트리거: 프로세스. role(`api` · `gateway` · `control` · `node` · 개발의 `main`)과 설정(`service.config.json`), 환경변수 `HOST_AUTH_KEY`(서명 키)를 들고 온다.
한 줄: 제 role 의 모듈을 세우고 듣는다. 노드는 컨트롤 플레인에 자기를 알린다. 인스턴스는 입장이나 예비 용량이 띄운다.

## 순서

```text
Service.start                                           [앱]
  api      openStorage · Directory · Signer · Spawner.bundle · Api 열기     [스토리지 · 계정 · 플릿]
  gateway  Signer · Gateway — 소켓 듣기                                    [계정 · 게이트웨이]
  control  openStorage · Signer · Fleet.start · SessionManager · Operator        [스토리지 · 계정 · 플릿 · 세션]
  node     Spawner.missing · openStorage · NodeAgent.start ── NodeRpc register       [플릿 · 스토리지]
             Fleet.register                                                     [플릿] ◇
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | 전부 | Service.start | 서명 키가 없으면 시작 거부 ✕ | |
| 2 | api | Service → Directory · Signer | 스토리지를 열고 Database 를 주어 만든다 | |
| 3 | api | Service → Spawner.bundle | 뷰어를 한 번 묶는다. 묶지 못하면 시작 거부 ✕. Api(http)를 연다 | 클라이언트 ◇ |
| 4 | gateway | Service → Gateway | Signer 의 verify 를 값으로 주어 만들고 소켓을 듣는다. Clock 으로 Gateway.heartbeat | 클라이언트 ◇ |
| 5 | control | Service → Fleet.start | 먼저 Service.elect(흐름 13) — 활성이 아니면 여기서 멈춰 기다린다 ◇. Assignment.all(Database.all)의 줄마다 Instance 를 `stopped` 로. Clock.run | Instance × 줄 |
| 6 | control | Service → SessionManager · Operator | 설정의 존마다 Zone · Queue. 플릿의 기능 넷과 Signer 의 issue 를 값으로 준다. SessionRpc · NodeRpc · Operator 를 듣는다 | ◇ |
| 7 | node | Service → NodeAgent.start | Spawner.missing — 엔진 체크아웃이 없으면 시작 거부 ✕. 컨트롤 플레인에 NodeRpc register(이름 · 주소 · slots · 지금 도는 인스턴스들)을 보내고 Clock.run 그 전에 NodeAgent.reap — 지난 실행이 남긴 호스트 · 에이전트 프로세스를 끝낸다(stdin 을 잃은 호스트는 다룰 수 없다). register 에는 이 노드의 빌드도 싣는다. spool 에 남은 저장하지 못한 캐릭터 파일은 held 로 되찾아 다시 저장한다 |   |
| 8 | control | Fleet.register(node) | Node 를 적는다. 노드가 알린 도는 인스턴스는 `ready` 로 되찾고, 표에 없는 것은 그 노드에 stop 을 시킨다 표에는 이 노드의 것으로 있는데 노드가 알리지 않은 인스턴스는 죽은 것이다 ⇒ 흐름 12. 표의 줄이 다른 노드를 가리키는 인스턴스를 이 노드가 돌고 있다고 알리면(끊겼다 돌아온 노드 — 그 사이 다른 곳에 다시 떴다) 그 노드에 stop 을 시킨다 | Node   |

## 멈추는 자리

- 프로세스마다 듣는다. 컨트롤 플레인의 표: Node · Instance · 빈 접속 표.

## 이어지는 흐름

- 2 로그인 · 3 입장 · 5 주기 작업 · 6 운영자 · 7 종료.

## 규칙

- 시작은 엔진 프로세스를 띄우지 않는다. 띄우는 것은 입장(흐름 3)과 예비 용량(흐름 5)이다.
- 컨트롤 플레인이 다시 서면 접속 표는 비어 있다. 게이트웨이의 heartbeat(흐름 5)와 노드의 register · heartbeat 가 그것을 다시 채운다. 그 사이 붙어 있는 사람은 그대로 논다.
- 노드 에이전트만 죽었다 다시 뜨면 그 노드의 인스턴스는 전부 죽은 것으로 친다. 든 캐릭터는 마지막으로 저장한 값으로 다른 인스턴스에 배정된다(흐름 12).
- 프로세스가 뜨는 순서는 정해지지 않는다. 컨트롤 플레인이 아직 없으면 노드 · 게이트웨이는 알림을 되풀이한다.

## 미정

- 없음.

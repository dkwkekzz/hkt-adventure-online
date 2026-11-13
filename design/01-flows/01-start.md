# 흐름 1. 시작 — 프로세스가 뜬다

트리거: 프로세스. role(`api` · `gateway` · `control` · `node` · 개발의 `main`)과 설정, 환경변수 `HOST_AUTH_KEY` · `MONGODB_URI` · `SNAPSHOT_URI` 를 들고 온다.
한 줄: 제 role 의 개념을 세우고 듣는다. 엔진 프로세스는 띄우지 않는다.

## 순서

```text
Service.start
  api      Spawner.bundle → Api.listen
  gateway  Acceptor.listen → GateReporter.report
  control  Elector.elect                              ⇒ 흐름 13
  node     Spawner.missing → Runner.reap → Loader.recover → NodeReporter.register → Nodes.register
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | 전부 | Service.start | 스토리지를 열고 제 role 의 개념을 만든다. 서명 키가 없으면 시작 거부 | |
| 2 | api | Spawner.bundle | 뷰어를 한 번 묶는다 | viewer.js |
| 3 | api | Api.listen | http 를 연다 | 클라이언트 ◇ |
| 4 | gateway | Acceptor.listen | 소켓을 듣는다 | 클라이언트 ◇ |
| 5 | gateway | GateReporter.report | 컨트롤 플레인에 자기를 알린다. 그 뒤로 간격마다(흐름 5) | |
| 6 | control | Elector.elect | 활성이 될지 대기가 될지 정한다 | ⇒ 흐름 13 |
| 7 | node | Spawner.missing | 엔진 체크아웃이 없으면 시작 거부 | |
| 8 | node | Runner.reap | 지난 실행이 남긴 호스트 · 에이전트 프로세스를 끝낸다 | |
| 9 | node | Loader.recover | 지난 실행이 저장하지 못한 캐릭터 파일을 저장하고 lease 를 푼다 | 값이 스토리지에 |
| 10 | node | NodeReporter.register | 컨트롤 플레인에 이름 · 주소 · 빌드 · slots 를 알린다 | |
| 11 | control | Nodes.register | 노드를 적는다 | Node ◇ |

## 실패하면

- 컨트롤 플레인이 아직 없으면 노드 · 게이트웨이는 알림을 되풀이한다. 뜨는 순서는 정해지지 않는다.
- 노드가 다시 뜬 것이면 그 인스턴스들은 8 에서 끝났다. 컨트롤 플레인은 보고에 그것들이 없는 것을 보고 장애 복구로 간다(흐름 5 → 12).

## 멈추는 자리

- 프로세스마다 듣는다.

## 이어지는 흐름

- 2 로그인 · 3 입장 · 5 주기 작업 · 6 운영자 · 7 종료 · 13 전환.

## 규칙

- 엔진 프로세스를 띄우는 것은 입장(흐름 3)과 예비 용량(흐름 5)이다.

## 미정

- 없음.

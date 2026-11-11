# 흐름 1. 시작 — 프로세스가 뜬다

트리거: 프로세스. role(`front` · `gate` · `control` · `node` · 개발의 `main`)과 설정(`service.config.json`), 환경변수 `HOST_AUTH_KEY`(서명 키)를 들고 온다.
한 줄: 제 role 의 모듈을 세우고 듣는다. 노드는 제어에 자기를 알린다. 인스턴스는 입장이나 여유가 띄운다.

## 순서

```text
Service.start                                           [앱]
  front    openStorage · Directory · Signer · Spawner.bundle · Api 열기     [저장 · 계정 · 함대]
  gate     Signer · Gateway — 소켓 듣기                                    [계정 · 관문]
  control  openStorage · Signer · Fleet.start · Placement · Operator        [저장 · 계정 · 함대 · 배치]
  node     Spawner.missing · openStorage · Warden.start ── Berth join       [함대 · 저장]
             Fleet.join                                                     [함대] ◇
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | 전부 | Service.start | 서명 키가 없으면 시작 거부 ✕ | |
| 2 | front | Service → Directory · Signer | 저장을 열고 Ledger 를 주어 만든다 | |
| 3 | front | Service → Spawner.bundle | 뷰어를 한 번 묶는다. 묶지 못하면 시작 거부 ✕. Api(http)를 연다 | 클라이언트 ◇ |
| 4 | gate | Service → Gateway | Signer 의 verify 를 값으로 주어 만들고 소켓을 듣는다. Clock 으로 Gateway.beat | 클라이언트 ◇ |
| 5 | control | Service → Fleet.start | Assignment 의 줄마다 Instance 를 `stopped` 로. Clock.run | Instance × 줄 |
| 6 | control | Service → Placement · Operator | 설정의 존마다 Zone · Queue. 함대의 기능 넷과 Signer 의 issue 를 값으로 준다. Seat · Berth · Operator 를 듣는다 | ◇ |
| 7 | node | Service → Warden.start | Spawner.missing — 엔진 체크아웃이 없으면 시작 거부 ✕. 제어에 Berth join(이름 · 주소 · slots · 지금 도는 인스턴스들)을 보내고 Clock.run | |
| 8 | control | Fleet.join(machine) | Machine 을 적는다. 노드가 알린 도는 인스턴스는 `ready` 로 되찾고, 표에 없는 것은 그 노드에 stop 을 시킨다 | Machine |

## 멈추는 자리

- 프로세스마다 듣는다. 제어의 표: Machine · Instance · 빈 접속 표.

## 이어지는 흐름

- 2 로그인 · 3 입장 · 5 박자 · 6 운영자 · 7 종료.

## 규칙

- 시작은 엔진 프로세스를 띄우지 않는다. 띄우는 것은 입장(흐름 3)과 여유(흐름 5)다.
- 제어가 다시 서면 접속 표는 비어 있다. 관문의 beat(흐름 5)와 노드의 join · report 가 그것을 다시 채운다. 그 사이 붙어 있는 사람은 그대로 논다.
- 프로세스가 뜨는 순서는 정해지지 않는다. 제어가 아직 없으면 노드 · 관문은 알림을 되풀이한다.

## 미정

- 없음.

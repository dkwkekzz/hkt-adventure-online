# 흐름 14. 관측 — 수집기의 요청

트리거: 밖의 수집기 · load balancer 의 http 요청. 프로세스마다의 `GET /health` 와 `GET /metrics`. API 서버는 밖의 포트에, 나머지는 내부 포트에 연다.
한 줄: 프로세스가 지금 제 일을 할 수 있는가를 답하고, 제 수치를 글로 낸다. 기준을 넘는가의 판단과 알림은 수집기(밖)의 일이다.

## 순서

```text
GET /health ─► Monitor.health                           [앱]
GET /metrics ─► Monitor.metrics                         [앱]
  api      요청 수 · 거절 수
  gateway  Gateway.stats                                [게이트웨이]
  control  SessionManager.stats · Fleet.stats           [세션 · 플릿]
  node     NodeAgent.stats                              [플릿]
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | api | Monitor.health | 스토리지(Database)에 닿고 활성 컨트롤 플레인을 안다 | 200 또는 503 |
| 2 | gateway | Monitor.health | 활성 컨트롤 플레인에 heartbeat 가 닿았다(한계 안) | 200 또는 503 |
| 3 | control | Monitor.health | 활성이면 200 과 term. 대기면 200 과 `standby` — load balancer 는 활성만 고른다 | |
| 4 | node | Monitor.health | 활성 컨트롤 플레인에 heartbeat 가 닿았고 스토리지에 닿는다 | 200 또는 503 |
| 5 | api | Monitor.metrics | 흐름마다의 요청 수 · 거절 수(까닭마다) · 걸린 시간 | 글 |
| 6 | gateway | Monitor.metrics → Gateway.stats | 열린 접속의 수 · RateLimiter 가 버린 글의 수 · 뒤를 바꿔 이은 수 | 글 |
| 7 | control | Monitor.metrics → SessionManager.stats · Fleet.stats | 존마다 세션의 수(pending · active · grace) · 대기열의 길이 · 빈 슬롯. 노드마다 slots · used. 인스턴스마다 state · 사람 수 · 틱 지연 · 다시 띄운 수. 존 이동 · 장애 복구의 수 | 글 |
| 8 | node | Monitor.metrics → NodeAgent.stats | GameServer 마다 state · 틱 지연 · 든 캐릭터의 수. 스냅샷 저장의 수 · 거절된 수. 마지막 저장 뒤의 시간 | 글 |

## 멈추는 자리

- 없음. 답하고 끝난다.

## 이어지는 흐름

- 없음. 상태를 바꾸지 않는다.

## 규칙

- 답에 계정 · 캐릭터의 이름과 토큰이 없다. 수와 state 뿐이다.
- load balancer 는 `/health` 가 503 인 API 서버 · 게이트웨이를 뺀다. 빠진 게이트웨이의 사람은 흐름 12 의 6 으로 간다.
- 수치는 모두 그 프로세스가 이미 든 것이다. 관측을 위해 스토리지나 다른 프로세스에 묻지 않는다(health 의 닿음 확인 밖).
- 기록(Log)은 프로세스의 stdout 이고 모으는 것은 플랫폼의 일이다. 줄마다 어느 프로세스 · 어느 인스턴스의 것인가가 머리에 온다.

## 미정

- 없음.

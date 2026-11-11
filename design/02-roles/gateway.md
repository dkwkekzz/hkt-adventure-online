# 게이트웨이 gateway — 책임

게이트웨이란, 클라이언트의 소켓을 들고 그 캐릭터가 배정된 호스트와 글을 그대로 넘기는 것이다.

- 글의 안을 모른다. 읽는 것은 접속의 첫 글(`Host 2`)의 자격 하나뿐이다.
- 어느 호스트로 갈지 정하지 않는다. 세션 모듈이 준 주소로만 잇는다.
- 상태는 열린 소켓뿐이다. 게이트웨이가 죽으면 그 사람들은 다시 들어온다.
- 호스트의 주소는 클라이언트에게 가지 않는다.

| 개념 | 책임 하나 |
|---|---|
| Acceptor | 새 소켓이 누구의 것인지 확인한다 |
| Connection | 클라이언트의 소켓과 호스트의 소켓을 잇는다 |
| RateLimiter | 글의 크기와 빈도, 한 주소의 접속 수를 지킨다 |
| Keepalive | 죽은 선을 찾는다 |
| GateReporter | 이 게이트웨이가 든 접속을 컨트롤 플레인에 알린다 |

## 개념

### Acceptor
- 데이터: verify(토큰 → id, 앱이 준다) · limiter(참조) · connections:map<Character.id, Connection>.
- 기능: listen 은 소켓을 듣는다. accept(socket) 은 한계(`helloMs`) 안에 온 첫 글 `Host 2` 의 토큰을 풀어 Character.id 를 얻는다 — 틀리면 닫는다(4001 · 4002). 같은 캐릭터의 옛 Connection 은 닫는다(4000 — 나중 접속이 이긴다).
- 생애: Service.start 가 만든다.

### Connection
- 데이터: character(불변) · client(클라이언트의 소켓) · upstream(호스트로 가는 소켓 또는 null) · instance(이어진 인스턴스의 이름) · state:`opening`|`open`|`rerouting`|`closed`.
- 기능: open(instance, address, token) 은 호스트에 소켓을 열고 첫 글 `Host 2` 를 그 토큰으로 보낸다. relay 는 양쪽의 글을 그대로 넘긴다 — upstream 이 닫히면 `rerouting` 으로 한계(`rerouteMs`)까지 기다린다. reroute(instance, address, token) 은 뒤를 새 호스트로 바꿔 잇는다. close(code) 는 양쪽을 닫고 컨트롤 플레인에 detach 를 보낸다.
- 생애: Acceptor.accept 가 만든다. close 뒤 사라진다.

### RateLimiter
- 데이터: maxBytes · maxRate · ipLimit. 불변.
- 기능: check(frame) 는 글 하나의 크기와 빈도가 한계 안인가. admit(ip) 는 그 주소의 열린 접속이 한계 안인가.
- 생애: Service.start 가 만든다.

### Keepalive
- 데이터: pongMs(불변).
- 기능: ping(connection) 은 클라이언트에 ping 을 보내고 한계 안에 답이 없으면 그 Connection 을 닫게 한다.
- 생애: Service.start 가 만든다.

### GateReporter
- 데이터: name(불변) · address(불변, 밖에서 보는 주소) · closing:bool.
- 기능: report 는 이름 · 주소 · closing 과 접속마다 {캐릭터, 이어진 인스턴스}를 컨트롤 플레인에 보낸다.
- 생애: Service.start 가 만든다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Link | 클라이언트 ↔ 게이트웨이 ↔ 호스트 | 엔진의 글 넷 | 그대로 |
| SessionRpc attach | 게이트웨이 → 컨트롤 플레인 | Character.id · 게이트웨이의 이름 | `{instance, address, token}` 또는 까닭 |
| SessionRpc detach | 게이트웨이 → 컨트롤 플레인 | Character.id · 게이트웨이의 이름 | 없음 |
| SessionRpc report | 게이트웨이 → 컨트롤 플레인 | GateReporter 의 것 | 없음 |
| SessionRpc reroute | 컨트롤 플레인 → 게이트웨이 | Character.id · instance · address · token | 없음 |
| SessionRpc kick | 컨트롤 플레인 → 게이트웨이 | Character.id · 코드 | 없음 |

## 미정

- 없음.

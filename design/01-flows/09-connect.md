# 흐름 9. 접속 — 클라이언트의 소켓

트리거: 게이트웨이에 온 WebSocket 하나. 첫 글은 엔진의 `Host 2` 이고 자격은 캐릭터의 토큰이다.
한 줄: 누구인지와 세션을 확인하고, 캐릭터의 값을 배정된 인스턴스에 로드한 뒤, 호스트와 소켓을 이어 글을 그대로 넘긴다.

## 순서

```text
RateLimiter.admit → Acceptor.accept → Sessions.get
  → Loader.load → Leases.acquire → CharacterStore.read → Console.command
  → Sessions.activate → Signer.issue → Connection.open → Connection.relay
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | RateLimiter.admit | 그 주소의 접속이 한계 안인가. 아니면 받지 않는다 | |
| 2 | Acceptor.accept | 첫 글의 토큰을 풀어 누구인지 안다. 틀리면 닫는다. 같은 캐릭터의 옛 접속은 닫는다 | Character.id |
| 3 | Sessions.get | 컨트롤 플레인에 묻는다(SessionRpc attach). 세션이 없으면 거절(4002) | Session |
| 4 | Loader.load | 세션이 `pending` 이면 그 인스턴스의 노드에서 아래 5 ~ 7 을 한다. `grace` 면(유예 안에 돌아왔다) 값이 이미 있으므로 건너뛴다 | |
| 5 | Leases.acquire | 그 캐릭터의 lease 를 받는다. 누가 들고 있으면 거절 | Lease |
| 6 | CharacterStore.read | 값을 캐릭터 파일에 내려 받는다 | 파일 |
| 7 | Console.command | 호스트에 로드를 시킨다. 파일이 없으면(처음) 엔진이 틀에서 낳는다 | 묶음이 인스턴스에 |
| 8 | Sessions.activate | 세션을 `active` 로, 그 게이트웨이를 적는다 | |
| 9 | Signer.issue | 호스트에 줄 캐릭터의 토큰을 새로 낸다 | Token |
| 10 | Connection.open | 호스트에 소켓을 열고 `Host 2` 를 그 토큰으로 보낸다 | |
| 11 | Connection.relay | 호스트의 글을 클라이언트로, 클라이언트의 글을 RateLimiter.check 뒤 호스트로 넘긴다 | 클라이언트 ◇ |

## 실패하면

- 5 가 거절되면(떠난 값이 아직 저장되지 않았거나 죽은 인스턴스의 lease 가 남았다) 세션을 지우고 닫는다. 클라이언트는 다시 입장한다.
- 7 을 엔진이 거절하면(값이 깨졌다) lease 를 풀고 닫는다. 운영자가 `rollback` 으로 고친다.
- 호스트의 소켓이 닫히면 클라이언트의 소켓을 바로 닫지 않고 기다린다(`rerouting`). 컨트롤 플레인이 다른 호스트로 잇게 하면 잇고(흐름 10 · 12), 한계가 지나면 닫는다.

## 멈추는 자리

- 접속이 열려 있다. 세션 `active`. 캐릭터의 lease 를 그 인스턴스가 든다.

## 이어지는 흐름

- 10 존 이동 · 11 접속 종료 · 12 장애 복구.

## 규칙

- 로드가 호스트 접속보다 먼저다.
- 클라이언트의 토큰은 게이트웨이까지만 간다. 호스트에는 컨트롤 플레인이 그때 낸 토큰이 간다.
- 게이트웨이는 글의 안을 풀지 않는다.

## 미정

- 없음.

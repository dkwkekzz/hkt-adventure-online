# 흐름 9. 접속 — 클라이언트의 소켓

트리거: 게이트웨이에 온 WebSocket 하나. 첫 글은 엔진의 `Host 2` 이고 자격은 캐릭터의 토큰이다.
한 줄: 토큰과 세션을 확인하고, 캐릭터의 값을 배정될 인스턴스에 로드한 뒤, 호스트와 소켓을 이어 글을 그대로 넘긴다.

## 순서

```text
Gateway.accept                                          [게이트웨이]
  verify — 첫 글의 토큰                                   [계정]
  SessionRpc attach ─► SessionManager.attach                         [세션 — 컨트롤 플레인]
    Fleet.load ─► NodeRpc load ─► NodeAgent.load             [플릿]
      CharacterStore.checkout                                   [스토리지]
      GameServer.load                                        [엔진]
    Presence.put · Session(active)
  Connection.open — 호스트에 Host 2                         [엔진]
  Connection.relay                                         ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Gateway.accept(socket) | 첫 글이 `Host 2` 가 아니거나 토큰이 틀리면 닫는다(4001 · 4002) ✕. 같은 캐릭터의 옛 Connection 은 닫는다(4000) | Character.id |
| 2 | SessionManager.attach(character, gate) | 이 캐릭터의 Session 가 없으면(입장을 지나지 않았거나 만료) 거절 ✕ — 게이트웨이가 4002 로 닫는다 | Session |
| 3 | Fleet.load(instance, character) → NodeAgent.load | Session 가 `pending` 일 때만. `grace`(재접속 유예 안에 다시 왔다)면 값이 아직 그 인스턴스에 있으므로 건너뛴다 | |
| 4 | NodeAgent → CharacterStore.checkout(character, holder, file) | lease 를 받고 값을 캐릭터 파일에 내려 받는다. 남이 들고 있으면 거절 ✕ | Lease |
| 5 | NodeAgent → GameServer.load(character, file, lease) | 로드의 Console 글. 엔진이 파일의 값으로 그 캐릭터의 묶음을 세운다 — 파일이 없으면(처음) 틀에서 낳는다 | 묶음이 인스턴스에 |
| 6 | SessionManager → Presence.put | Session 를 `active` 으로. 답은 Instance 의 address 와 컨트롤 플레인이 새로 낸 캐릭터의 토큰 | |
| 7 | Connection.open(address, token) | 호스트에 소켓을 열고 `Host 2` 를 그 토큰으로 보낸다. 호스트가 거절하면 클라이언트도 닫는다 ✕ | |
| 8 | Connection.relay | 호스트의 `Link 1` · `Link 2` 를 클라이언트로, 클라이언트의 `Link 3` 을 RateLimiter.check 뒤 호스트로. 안은 풀지 않는다 | 클라이언트 ◇ |

## 멈추는 자리

- Connection `open`. Session `active`. 캐릭터의 lease 를 그 인스턴스가 든다.

## 이어지는 흐름

- 10 존 이동 · 11 접속 종료 · 12 장애 복구.

## 규칙

- 로드가 호스트 접속보다 먼저다. 호스트는 그 캐릭터의 묶음이 선 뒤에야 `Host 2` 를 받는다.
- 클라이언트의 토큰은 게이트웨이까지만 간다. 호스트에는 컨트롤 플레인이 그때 낸 토큰이 간다 — 뒤를 바꿔 이을 때(흐름 10) 클라이언트의 토큰이 만료되어 있어도 된다.
- RateLimiter.check 를 어긴 글은 버리고, 되풀이하면 Connection.close.

## 미정

- 없음.

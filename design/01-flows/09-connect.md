# 흐름 9. 접속 — 클라이언트의 소켓

트리거: 게이트웨이에 온 WebSocket 하나. 첫 글은 엔진의 `Host 2` 이고 자격은 캐릭터의 토큰이다.
한 줄: 토큰과 세션을 확인하고, 캐릭터의 값을 배정된 인스턴스에 로드한 뒤, 호스트와 소켓을 이어 글을 그대로 넘긴다.

## 순서

```text
Gateway.accept                                          [게이트웨이]
  RateLimiter.admit
  verify — 첫 글의 토큰                                   [계정]
  SessionRpc attach ─► SessionManager.attach            [세션 — 컨트롤 플레인]
    Presence.get — 다른 게이트웨이의 옛 접속
    Fleet.load ─► NodeRpc load ─► NodeAgent.load        [플릿]
      CharacterStore.checkout                           [스토리지]
      GameServer.load                                   [엔진]
    Presence.put · Session(active)
  Connection.open — 호스트에 Host 2                       [엔진]
  Connection.relay                                      ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Gateway.accept(socket) | 한 주소에서 연 접속이 한계를 넘으면 받지 않는다(RateLimiter.admit). 소켓이 열리고 한계(`helloMs`) 안에 첫 글이 없거나, 첫 글이 `Host 2` 가 아니거나, 토큰이 틀리면 닫는다(4001 · 4002) ✕. 같은 캐릭터의 옛 Connection 은 닫는다(4000) | Character.id |
| 2 | SessionManager.attach(character, gate) | 컨트롤 플레인에 닿지 않거나 표를 세우는 가운데(settling)면 게이트웨이가 1013(잠시 뒤 다시)으로 닫는다 ✕. 이 캐릭터의 Session 이 없으면(입장을 지나지 않았거나 만료) 거절 ✕ — 4002 | Session |
| 3 | SessionManager → Presence.get | 이 캐릭터가 다른 게이트웨이에 붙어 있으면 그 게이트웨이에 SessionRpc kick(4000)을 보내 옛 접속을 닫는다 — 세션은 그대로 두고 새 접속이 잇는다 | |
| 4 | SessionManager | Session 의 Instance 가 ready 가 아니면(그 사이 죽었거나 내려갔다) 같은 존에서 다시 고르고(흐름 3 의 5 · 6) 세션을 `pending` 으로 되돌린다 — 값은 새 곳에 없으므로 5 가 로드한다 | |
| 5 | Fleet.load(instance, character, spot) → NodeAgent.load | Session 이 `pending` 일 때만. `grace`(재접속 유예 안에 다시 왔다)와 `active`(다른 접속이 잇고 있었다)는 값이 이미 그 인스턴스에 있으므로 건너뛴다. 글에 세션의 일의 번호(op)를 올려 싣는다 |  |
| 6 | NodeAgent → CharacterStore.checkout(character, holder, file) | lease 를 받고 값을 캐릭터 파일에 내려 받는다. lease 의 번호를 파일 옆에 적는다. 남이 들고 있으면 거절 ✕ — Session 을 지우고 4002. 죽은 인스턴스의 lease 가 아직 비지 않았거나(흐름 12 가 비운다) 떠난 값이 아직 저장되지 않은 때다(흐름 5 의 3) | Lease |
| 7 | NodeAgent → GameServer.load(character, file, lease, spot) | 로드의 Console 글. 엔진이 파일의 값으로 그 캐릭터의 묶음을 세운다 — 파일이 없으면(처음) 틀에서 낳는다. 엔진이 거절하면(값이 깨졌거나 얼개가 다르다) CharacterStore.release 로 lease 만 풀고 Session 을 지우고 4002 ✕ — 기록에 남기고 운영자가 `rollback` 으로 고친다(흐름 6) | 묶음이 인스턴스에 |
| 8 | SessionManager | load 의 답이 한계(`rpcMs`) 안에 없으면 됐는지 모른다 — 그 인스턴스에 Fleet.unload 를 보내고(없는 캐릭터의 unload 는 됨이다) Session 을 지우고 1013 ✕. unload 마저 닿지 않아도 흐름 5 의 8 이 거둔다 | |
| 9 | SessionManager → Presence.put | Session 을 `active` 로. 답은 Instance 의 이름 · address 와, 그 호스트가 뜬 서명 키로 새로 낸 캐릭터의 토큰. 로드의 답이 준 노드의 순번과 attach 가 실어 온 게이트웨이의 순번을 Session.since 에 적는다 |  |
| 10 | Connection.open(instance, address, token) | 호스트에 소켓을 열고 `Host 2` 를 그 토큰으로 보낸다. 호스트가 거절하면 클라이언트도 닫는다 ✕ | |
| 11 | Connection.relay | 호스트의 `Link 1` · `Link 2` 를 클라이언트로, 클라이언트의 `Link 3` 을 RateLimiter.check 뒤 호스트로. 안은 풀지 않는다 | 클라이언트 ◇ |

## 멈추는 자리

- Connection `open`. Session `active`. 캐릭터의 lease 를 그 인스턴스가 든다.

## 이어지는 흐름

- 10 존 이동 · 11 접속 종료 · 12 장애 복구.

## 규칙

- 로드가 호스트 접속보다 먼저다. 호스트는 그 캐릭터의 묶음이 선 뒤에야 `Host 2` 를 받는다.
- 클라이언트의 토큰은 게이트웨이까지만 간다. 호스트에는 컨트롤 플레인이 그때 낸 토큰이 간다 — 뒤를 바꿔 이을 때(흐름 10) 클라이언트의 토큰이 만료되어 있어도 된다.
- RateLimiter.check 를 어긴 글은 버리고, 되풀이하면 Connection.close.
- 뒤(upstream)가 닫혀도 클라이언트의 소켓은 바로 닫지 않는다. 호스트가 거절의 코드(4000 · 4001 · 4002)로 닫았으면 그 코드로 클라이언트도 닫고, 그 밖(1001 · 끊김)이면 Connection 이 `rerouting` 으로 기다린다 — 한계(`rerouteMs`) 안에 reroute 가 오면 잇고(흐름 10 · 12) 아니면 Connection.close(1001).
- 한 캐릭터의 접속은 하나다. 같은 게이트웨이의 옛 접속은 게이트웨이가, 다른 게이트웨이의 옛 접속은 세션 모듈이 닫는다. 나중 접속이 이긴다.
- 9 의 답이 게이트웨이에 닿지 않으면 세션은 `active` 인데 접속이 없다. 흐름 5 의 16 이 재접속 유예로 돌린다.

## 미정

- 없음.

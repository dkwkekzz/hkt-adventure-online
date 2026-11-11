# 흐름 9. 접속 — 클라이언트의 소켓

트리거: 관문에 온 WebSocket 하나. 첫 글은 엔진의 `Host 2` 이고 자격은 캐릭터의 토큰이다.
한 줄: 토큰과 자리를 확인하고, 캐릭터의 값을 놓일 인스턴스에 들인 뒤, 호스트와 소켓을 이어 글을 그대로 넘긴다.

## 순서

```text
Gateway.accept                                          [관문]
  verify — 첫 글의 토큰                                   [계정]
  Seat claim ─► Placement.claim                         [배치 — 제어]
    Fleet.lend ─► Berth lend ─► Warden.lend             [함대]
      Locker.checkout                                   [저장]
      Shard.lend                                        [엔진]
    Presence.put · Seat(taken)
  Session.open — 호스트에 Host 2                         [엔진]
  Session.relay                                         ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Gateway.accept(socket) | 첫 글이 `Host 2` 가 아니거나 토큰이 틀리면 닫는다(4001 · 4002) ✕. 같은 캐릭터의 옛 Session 은 닫는다(4000) | Character.id |
| 2 | Placement.claim(character, gate) | 이 캐릭터의 Seat 가 없으면(입장을 지나지 않았거나 만료) 거절 ✕ — 관문이 4002 로 닫는다 | Seat |
| 3 | Fleet.lend(instance, character) → Warden.lend | Seat 가 `held` 일 때만. `grace`(유예 안에 다시 왔다)면 값이 아직 그 인스턴스에 있으므로 건너뛴다 | |
| 4 | Warden → Locker.checkout(character, holder, file) | 임대를 받고 값을 건넴 파일에 내려 받는다. 남이 들고 있으면 거절 ✕ | Lease |
| 5 | Warden → Shard.lend(character, file, lease) | 들임의 Console 글. 엔진이 파일의 값으로 그 캐릭터의 묶음을 세운다 — 파일이 없으면(처음) 틀에서 낳는다 | 묶음이 인스턴스에 |
| 6 | Placement → Presence.put | Seat 를 `taken` 으로. 답은 Instance 의 address 와 제어가 새로 낸 캐릭터의 토큰 | |
| 7 | Session.open(address, token) | 호스트에 소켓을 열고 `Host 2` 를 그 토큰으로 보낸다. 호스트가 거절하면 클라이언트도 닫는다 ✕ | |
| 8 | Session.relay | 호스트의 `Link 1` · `Link 2` 를 클라이언트로, 클라이언트의 `Link 3` 을 Guard.check 뒤 호스트로. 안은 풀지 않는다 | 클라이언트 ◇ |

## 멈추는 자리

- Session `open`. Seat `taken`. 캐릭터의 임대를 그 인스턴스가 든다.

## 이어지는 흐름

- 10 존 건넘 · 11 떠남 · 12 잃음.

## 규칙

- 들임이 호스트 접속보다 먼저다. 호스트는 그 캐릭터의 묶음이 선 뒤에야 `Host 2` 를 받는다.
- 클라이언트의 토큰은 관문까지만 간다. 호스트에는 제어가 그때 낸 토큰이 간다 — 뒤를 바꿔 이을 때(흐름 10) 클라이언트의 토큰이 만료되어 있어도 된다.
- Guard.check 를 어긴 글은 버리고, 되풀이하면 Session.close.

## 미정

- 없음.

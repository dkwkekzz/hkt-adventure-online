# 흐름 10. 존 이동 — 호스트의 이동 요청 줄

트리거: 호스트의 stdout 한 줄 `떠남 — <account> → <to>`. 캐릭터의 묶음이 다른 존으로 가는 자리에 닿았다. to 는 `<존>` 또는 `<존>@<공간>` — 공간은 건넌 뒤 설 자리의 이름이다. 운영자의 `drain`(흐름 6)과 장애 복구(흐름 12)도 2 부터 같은 길을 간다.
한 줄: 갈 인스턴스에 세션을 잡고, 값을 지금의 인스턴스에서 언로드해 스토리지에 저장하고, 갈 인스턴스에 로드하고, 게이트웨이가 뒤의 소켓을 바꿔 잇는다. 클라이언트의 소켓은 그대로다.

## 순서

```text
Probe.read — 이동 요청 줄 ─► NodeRpc handoff                    [플릿 — 노드]  ⇐ 흐름 4
Fleet.handoff ─► SessionManager.transfer                         [플릿 → 세션 — 컨트롤 플레인]
  Fleet.instances · Presence.count · Fleet.launch       갈 인스턴스 — 흐름 3 의 4 · 5
  Fleet.unload ─► NodeAgent.unload                       [플릿 — 떠나는 노드]
    GameServer.unload                                       [엔진]
    CharacterStore.checkin(release)                             [스토리지]
  Fleet.load ─► NodeAgent.load                             [플릿 — 가는 노드]
    CharacterStore.checkout                                     [스토리지]
    GameServer.load                                          [엔진]
  Presence.put · Database.put(lastZone)                   [스토리지]
  SessionRpc reroute ─► Gateway.reroute ── Connection.reroute             [게이트웨이]
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Fleet.handoff(instance, character, zone) | 세션 모듈의 transfer 로 넘긴다 | |
| 2 | SessionManager.transfer(character, zone) | 갈 Instance 를 흐름 3 의 4 · 5 처럼 고른다(없으면 띄운다). Zone.closed 이거나 슬롯을 낼 수 없으면 아무것도 하지 않는다 — 캐릭터는 제자리에 있다 ✕. 같은 빌드의 Instance 만 본다 — 없으면 SessionManager.kick 으로 닫는다(클라이언트는 페이지를 다시 받아 새 빌드로 들어온다) | 갈 Instance  |
| 3 | Fleet.unload(지금의 instance, character) → NodeAgent.unload | GameServer.unload — 언로드의 Console 글. 엔진이 값을 캐릭터 파일에 쓰고 묶음을 세계에서 지운다. CharacterStore.checkin(release)으로 저장하고 lease 를 푼다 | 값이 스토리지에 |
| 4 | Fleet.load(갈 instance, character) → NodeAgent.load | CharacterStore.checkout → GameServer.load. 흐름 9 의 4 · 5 와 같다. to 에 공간이 있으면 load 에 그 공간을 준다 — 없으면 그 존의 틀의 자리에 선다. 실패하면 지금의 인스턴스에 다시 로드한다. 그것도 실패하면 SessionManager.kick — 세션을 지우고 게이트웨이가 닫는다(1001). 값은 3 에서 스토리지에 저장됐고 lease 는 비었다. 클라이언트는 다시 입장한다 ✕ | 묶음이 갈 인스턴스에  |
| 5 | SessionManager → Presence.put · Database.put | Session 의 instance 를 바꾸고 마지막 존을 적는다 | |
| 6 | SessionManager → SessionRpc reroute → Gateway.reroute | 그 캐릭터의 게이트웨이에 새 address 와 새 토큰을 보낸다 | |
| 7 | Connection.reroute(address, token) | 옛 upstream 을 닫고 새 호스트에 `Host 2` 를 보낸다. 새 호스트의 `Link 1` 열림이 클라이언트에 간다 | 클라이언트 ◇ |

## 멈추는 자리

- Connection `open` — 뒤가 새 호스트. lease 를 갈 인스턴스가 든다.

## 이어지는 흐름

- 4 · 5 · 11.

## 규칙

- 캐릭터의 값은 한때에 한 인스턴스에만 있다. 언로드가 로드보다 먼저이고, 그 사이의 진실은 스토리지다.
- checkout 이 lease 의 번호를 올리므로, 떠난 인스턴스가 뒤늦게 저장하는 값은 거절된다(흐름 5 의 2).
- 이동 가운데 클라이언트가 보낸 글은 버린다. 이동 가운데 온 접속 종료 · kick 은 이동이 끝난 뒤에 한다(세션 하나의 일은 한 번에 하나).
- 같은 존의 다른 인스턴스로 옮기는 것(`drain` · 장애 복구)도 이 흐름이다.

## 미정

- 없음.

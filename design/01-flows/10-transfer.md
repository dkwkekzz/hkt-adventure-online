# 흐름 10. 존 이동 — 호스트의 이동 요청 줄

트리거: 호스트의 stdout 한 줄 `떠남 — <account> → <to>`. 캐릭터의 묶음이 다른 존으로 가는 자리에 닿았다. to 는 `<존>` 또는 `<존>@<공간>` — 공간은 건넌 뒤 설 자리의 이름이다.
운영자의 `drain` · 노드의 내려감(migrate — 흐름 5 · 6 · 7)과 장애 복구(failover — 흐름 12)도 2 부터 같은 길을 간다. 셋을 가르는 것은 transfer 의 why 다(`move` 사람의 이동 · `migrate` · `failover`).
한 줄: 갈 인스턴스에 슬롯을 잡고, 값을 지금의 인스턴스에서 언로드해 스토리지에 저장하고, 갈 인스턴스에 로드하고, 게이트웨이가 뒤의 소켓을 바꿔 잇는다. 클라이언트의 소켓은 그대로다.

## 순서

```text
Probe.read — 이동 요청 줄 ─► NodeRpc handoff              [플릿 — 노드]  ⇐ 흐름 4
Fleet.handoff ─► SessionManager.transfer                [플릿 → 세션 — 컨트롤 플레인]
  Fleet.instances · Presence.count · Fleet.launch       갈 인스턴스 — 흐름 3 의 5 · 6. Session.to 에 잡는다
  Fleet.unload ─► NodeAgent.unload                      [플릿 — 떠나는 노드]
    GameServer.unload                                   [엔진]
    CharacterStore.checkin(release)                     [스토리지]
  Fleet.load ─► NodeAgent.load                          [플릿 — 가는 노드]
    CharacterStore.checkout                             [스토리지]
    GameServer.load                                     [엔진]
  Presence.put · Database.put(lastZone)                 [스토리지]
  SessionRpc reroute ─► Gateway.reroute ── Connection.reroute   [게이트웨이]
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Fleet.handoff(node, instance, epoch, character, to) | 알린 노드 · 세대가 표의 것과 다르면 버린다. to 를 존과 공간으로 가르고 세션 모듈의 transfer 로 넘긴다(why 는 `move`, from 은 알린 인스턴스) | |
| 2 | SessionManager.transfer(character, zone, spot, why, from) | 세션을 busy 로 한다. `move` 면 — from 이 세션의 인스턴스가 아니거나(이미 옮겨졌다) 존이 설정에 없으면 버리고 기록에 남긴다. Zone.closed 면 그만둔다 ✕. `migrate` · `failover` 는 닫힘을 보지 않는다(점검은 닫고 비우는 것이다) | |
| 3 | SessionManager → Fleet.instances · Presence.count · Fleet.launch | 갈 Instance 를 흐름 3 의 5 · 6 처럼 고르고(같은 빌드만, 없으면 띄운다) Session.to 에 잡는다 — 그때부터 그 인스턴스의 슬롯으로 센다. 낼 수 없으면: `move` 는 그만둔다(캐릭터는 제자리에 있다) ✕, `migrate` 는 두고 흐름 5 의 11′ 이 다시 한다, `failover` 는 흐름 12 의 4. 그 빌드의 인스턴스를 띄울 수 있는 Node 가 없으면(그 빌드의 노드가 없거나 전부 cordoned · closing 이다) SessionManager.kick — 클라이언트는 페이지를 다시 받아 새 빌드로 들어온다 | Session.to |
| 4 | SessionManager | 세션이 `pending` 이면 값이 아직 로드되지 않았다 — 5 · 6 없이 7 로. `grace` 면 옮기지 않고 Session.to 를 비운다 — `migrate` 는 Fleet.unload 뒤 세션을 지우고, `failover` 는 그냥 지운다 | |
| 5 | Fleet.unload(지금의 instance, character) → NodeAgent.unload | GameServer.unload — 언로드의 Console 글. 엔진이 값을 캐릭터 파일에 쓰고 묶음을 세계에서 지운다. CharacterStore.checkin(release)으로 저장하고 lease 를 푼다. 저장하지 못하면(스토리지에 닿지 않는다) Fleet.reload — 노드가 쥔 그 파일로 지금의 인스턴스에 다시 로드하고 Session.to 를 비우고, 같은 인스턴스로 SessionRpc reroute 를 보내(언로드 때 호스트가 선을 닫았다) 그만둔다 ✕. reload 가 실패하면 SessionManager.kick. unload 의 답이 없으면 Session.to 를 비우고 그만둔다 — 캐릭터가 로드돼 있는가는 다음 보고가 말하고 흐름 5 의 8 · 16 이 맞춘다. failover 는 이 단계가 없다(떠나는 곳이 죽었다) | 값이 스토리지에 |
| 6 | Fleet.load(갈 instance, character, spot) → NodeAgent.load | CharacterStore.checkout → GameServer.load. 흐름 9 의 6 · 7 과 같다. spot 이 있으면 그 공간에, 없으면 그 존의 틀의 자리에 선다. 실패하거나 답이 없으면 갈 인스턴스에 Fleet.unload 를 보낸 뒤(됐을 수도 있다) 지금의 인스턴스에 다시 Fleet.load 하고 Session.to 를 비우고 같은 인스턴스로 SessionRpc reroute 를 보낸다. 그것도 실패하면 SessionManager.kick — 세션을 지우고 게이트웨이가 닫는다(1001). 값은 스토리지에 있고 클라이언트는 다시 입장한다 ✕ | 묶음이 갈 인스턴스에 |
| 7 | SessionManager → Presence.put · Database.put | 갈 Instance 가 그 사이 ready 가 아니게 됐으면 6 의 실패로 간다. Session 의 instance 를 to 로 바꾸고 to 를 비우고 마지막 존을 적는다. 로드의 답이 준 노드의 순번을 Session.since 에 적고 busy 를 푼다 | |
| 8 | SessionManager → SessionRpc reroute → Gateway.reroute | 그 캐릭터의 게이트웨이에 새 인스턴스의 이름 · address 와 새 토큰을 보낸다. `pending` 인 세션에는 보내지 않는다 | |
| 9 | Connection.reroute(instance, address, token) | 옛 upstream 을 닫고 새 호스트에 `Host 2` 를 보낸다. 새 호스트의 `Link 1` 열림이 클라이언트에 간다 | 클라이언트 ◇ |

## 멈추는 자리

- Connection `open` — 뒤가 새 호스트. lease 를 갈 인스턴스가 든다.

## 이어지는 흐름

- 4 · 5 · 11.

## 규칙

- 캐릭터의 값은 한때에 한 인스턴스에만 있다. 언로드가 로드보다 먼저이고, 그 사이의 진실은 스토리지다.
- checkout 이 lease 의 번호를 올리므로, 떠난 인스턴스가 뒤늦게 저장하는 값은 거절된다(흐름 5 의 2).
- 옮기는 가운데의 세션은 떠나는 곳과 가는 곳 둘 다의 슬롯으로 센다. 여럿을 한꺼번에 옮겨도(장애 복구) 가는 곳이 상한을 넘지 않는다.
- load · unload · reload 의 글에는 일의 번호가 실린다 — 컨트롤 플레인의 term 과, 그 활성이 일을 시킬 때마다 하나씩 올리는 수. 세션이 지워졌다 다시 서도, 컨트롤 플레인이 바뀌어도 뒤에 낸 것이 크다. 노드는 그 캐릭터에 대해 본 것보다 작은 번호의 글을 버린다 — A 에서 B 로, 다시 A 로 옮긴 뒤 늦게 닿은 옛 unload 가 지금의 묶음을 지우지 못한다.
- 호스트는 unload 한 계정의 열린 선을 1001 로 닫는다(엔진의 면). 게이트웨이는 그것을 거절로 보지 않고 `rerouting` 으로 기다린다 — 8 이 새 호스트로 잇는다.
- 세션 하나의 일은 한 번에 하나다. 이동 가운데 온 접속 종료 · kick · 맞춤은 이동이 끝난 뒤에 한다. 이동 가운데 클라이언트가 보낸 글은 버린다.
- 8 의 reroute 가 사라지면 접속은 묶음 없는 옛 호스트에 이어져 있다. 게이트웨이의 heartbeat 가 그것을 알리고 흐름 5 의 16 이 다시 보낸다.
- 이동 가운데 컨트롤 플레인이 바뀌면 새 활성은 노드와 게이트웨이의 보고로 본다(흐름 13) — 값이 로드된 곳이 세션의 인스턴스이고, 접속이 다른 곳에 이어져 있으면 reroute, 어디에도 로드되지 않았으면 kick 이다.

## 미정

- 없음.

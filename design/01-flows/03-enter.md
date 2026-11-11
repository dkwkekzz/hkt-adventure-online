# 흐름 3. 입장 — 클라이언트의 캐릭터 토큰

트리거: Api 의 `enter`. 캐릭터의 토큰 하나. 닫힌 뷰어가 돌아와 다시 부르는 것도 같다(흐름 11 의 규칙).
한 줄: 캐릭터가 들어갈 존을 정하고, 그 존의 인스턴스 가운데 빈 슬롯이 있는 것을 고르거나 새로 띄워 세션을 잡고, 게이트웨이의 주소를 준다. 슬롯을 낼 수 없으면 대기열에 세운다.

## 순서

```text
Api enter                                               [앱 — API 서버]
  Signer.verify                                         [계정]
  SessionRpc enter ─► SessionManager.enter                         [세션 — 컨트롤 플레인]
    Database.get(lastZone)                                [스토리지]
    Fleet.instances · Presence.count
    Fleet.launch — 빈 슬롯이 없으면                          [플릿 — 컨트롤 플레인]
      NodeRpc launch ─► NodeAgent.launch                     [플릿 — 노드]
        SnapshotStore.pull                                      [스토리지]
        Ports.take
        GameServer.start
          Spawner.host                                  [엔진]
          Probe.read — 머리글                            ⇐ 흐름 4
          GameServer.command grant × NPC 묶음                 [엔진]
          Spawner.agent                                 [엔진]
      Assignment.put ── Database.put(instances)           [스토리지]
    Queue.push — 띄울 노드도 없으면
    Presence.put · Session(pending)
  답 — Ticket 또는 순번                                   ◇
클라이언트 → 게이트웨이                                         ⇒ 흐름 9
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Signer.verify(token) | 서명과 만료. 틀리거나 캐릭터의 토큰이 아니면 거절 ✕ 컨트롤 플레인에 닿지 않으면(전환 가운데) 503 — 클라이언트가 잠시 뒤 다시 묻는다 | Character.id  |
| 2 | SessionManager.enter(character) | 이 캐릭터의 Session 이 이미 있으면(pending · active · grace) 그 세션 그대로 9 로. 대기열에 있으면 Queue.position 의 순번을 답하고 물은 때를 고친다 |  |
| 2′ | SessionManager → Directory.owner · Directory.banned | 그 캐릭터의 계정이 차단됐으면 거절 ✕. 그 계정의 다른 캐릭터가 세션을 들고 있으면 SessionManager.kick 으로 닫는다 — 한 계정은 한때에 캐릭터 하나, 나중 입장이 이긴다 | |
| 3 | SessionManager → Database.get | 마지막에 있던 존. 없으면 설정의 `entry`. Zone.closed 면 거절 ✕. 그 존이 설정에서 사라졌으면 `entry` 로 | Zone  |
| 4 | SessionManager → Fleet.instances(zone) · Presence.count | ready 이고 `draining` 이 아닌 Instance 가운데 배정된 수가 Zone.capacity 보다 작은 것. 여럿이면 가장 찬 것(사람이 모이게). 빌드(build)가 클라이언트의 것과 같은 Instance 만 본다 — API 서버가 enter 에 제 빌드를 실어 보낸다 | Instance 또는 없음  |
| 5 | SessionManager → Fleet.launch(zone) | 없으면 띄운다. Node.slots 에 예비 용량이 있는 Node 를 고르고 빈 번호의 이름을 짓는다. 띄우는 가운데의 것이 있으면 그것을 기다린다. 예비 용량 있는 Node 가 없으면 8 로. Assignment.get 으로 내려가 있는 같은 빌드의 인스턴스가 있으면 그 이름을 다시 쓴다(그 Store 에서 이어간다). 클라이언트의 빌드를 든 Node 가 하나도 없으면 거절 ✕ — 답에 `reload` 를 실어 클라이언트가 페이지를 다시 받는다 |   |
| 6 | NodeAgent.launch(spec) → SnapshotStore.pull · Ports.take · GameServer.start | 그 인스턴스의 Store 를 내려 받고(없으면 빈 디렉터리) 포트를 받아 호스트를 띄운다. Spawner.host → 머리글의 마지막 줄(Probe.read 의 ready) → NPC 묶음마다 GameServer.command 의 `grant` → Spawner.agent. 한계 안에 서지 않으면 `failed` ✕. 호스트의 stdin 은 Process.write 로 쓴다 실패하면 Fleet 이 다른 Node 에 한 번 더 띄우고, 그래도 안 되면 8 로 | GameServer `ready`   |
| 7 | Fleet → Assignment.put | 인스턴스의 줄 `{zone, dataset, node, port}` 을 적는다 | Instance `ready` |
| 8 | SessionManager → Queue.push(character) | 빈 슬롯도 띄울 노드도 없으면 대기열에 세우고 순번을 답한다. 클라이언트는 다시 묻는다 — 슬롯이 나면(흐름 5) 9 로 | 순번 ◇ |
| 9 | SessionManager → Presence.put | Session 을 `pending` 으로 잡는다(만료 `pendingMs`). 게이트웨이 하나를 고른다(살아 있는 것 가운데) | Session |
| 10 | Api | Ticket `{page, gate}` 를 답한다. page 는 API 서버의 Static 이 주는 뷰어 페이지이고 `?ws=` 가 게이트웨이의 주소다 | 클라이언트 ◇ |

## 멈추는 자리

- 세션(Session `pending`)이 잡혔다. 클라이언트가 게이트웨이의 주소를 든다. 또는 대기열의 순번.

## 이어지는 흐름

- 9 접속 · 4 호스트의 글 · 5 주기 작업.

## 규칙

- 인스턴스에 배정하는 수는 세션 모듈이 센다. 세션(pending · active · grace)의 수가 Zone.capacity 를 넘지 않는다. 세션 없이 게이트웨이를 지날 수 없으므로(흐름 9) 상한은 여기서 지켜진다.
- 입장이 겹쳐도 인스턴스는 한 번만 띄운다.
- NPC 묶음의 grant 는 인스턴스가 `ready` 가 되기 전이다. 어떤 사람도 그 전에 그 인스턴스에 배정되지 않는다.
- 클라이언트는 호스트의 주소를 받지 않는다.

- 빌드는 엔진의 커밋(`engine.lock`)이다. 뷰어 · 호스트는 같은 빌드끼리만 만난다 — 엔진에는 프로토콜 버전이 없다(`ONLINE.md` §1.2).
- 대기열의 순번은 클라이언트가 다시 물을 때마다 살아 있다. 묻지 않으면 흐름 5 가 지운다.

## 미정

- 없음.

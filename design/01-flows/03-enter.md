# 흐름 3. 입장 — 클라이언트의 캐릭터 토큰

트리거: Api 의 `enter`. 캐릭터의 토큰 하나.
한 줄: 캐릭터가 놓일 존을 정하고, 그 존의 인스턴스 가운데 자리가 있는 것을 고르거나 새로 띄워 자리를 잡고, 관문의 주소를 준다. 자리를 낼 수 없으면 대기열에 세운다.

## 순서

```text
Api enter                                               [앱 — 앞문]
  Signer.verify                                         [계정]
  Seat enter ─► Placement.enter                         [배치 — 제어]
    Ledger.get(lastZone)                                [저장]
    Fleet.instances · Presence.count
    Fleet.launch — 자리가 없으면                          [함대 — 제어]
      Berth launch ─► Warden.launch                     [함대 — 노드]
        Vault.pull                                      [저장]
        Ports.take
        Shard.start
          Spawner.host                                  [엔진]
          Probe.read — 머리글                            ⇐ 흐름 4
          Shard.command grant × NPC 묶음                 [엔진]
          Spawner.agent                                 [엔진]
      Assignment.put ── Ledger.put(instances)           [저장]
    Queue.push — 띄울 자리도 없으면
    Presence.put · Seat(held)
  답 — Ticket 또는 순번                                   ◇
클라이언트 → 관문                                         ⇒ 흐름 9
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Signer.verify(token) | 서명과 만료. 틀리거나 캐릭터의 토큰이 아니면 거절 ✕ | Character.id |
| 2 | Placement.enter(character) | 이 캐릭터의 Seat 가 이미 있으면(held · taken · grace) 그 자리 그대로 9 로 | |
| 3 | Placement → Ledger.get | 마지막에 있던 존. 없으면 설정의 `entry`. Zone.closed 면 거절 ✕ | Zone |
| 4 | Placement → Fleet.instances(zone) · Presence.count | ready 이고 `draining` 이 아닌 Instance 가운데 놓인 수가 Zone.capacity 보다 작은 것. 여럿이면 가장 찬 것(사람이 모이게) | Instance 또는 없음 |
| 5 | Placement → Fleet.launch(zone) | 없으면 띄운다. Machine.slots 에 여유가 있는 Machine 을 고르고 빈 번호의 이름을 짓는다. 띄우는 가운데의 것이 있으면 그것을 기다린다. 여유 있는 Machine 이 없으면 8 로 | |
| 6 | Warden.launch(spec) → Vault.pull · Ports.take · Shard.start | 그 인스턴스의 Store 를 내려 받고(없으면 빈 자리) 포트를 받아 호스트를 띄운다. Spawner.host → 머리글의 마지막 줄(Probe.read 의 ready) → NPC 묶음마다 Shard.command 의 `grant` → Spawner.agent. 한계 안에 서지 않으면 `failed` ✕ | Shard `ready` |
| 7 | Fleet → Assignment.put | 인스턴스의 줄 `{zone, dataset, machine, port}` 을 적는다 | Instance `ready` |
| 8 | Placement → Queue.push(character) | 자리도 띄울 곳도 없으면 대기열에 세우고 순번을 답한다. 클라이언트는 다시 묻는다 — 자리가 나면(흐름 5) 9 로 | 순번 ◇ |
| 9 | Placement → Presence.put | Seat 를 `held` 로 잡는다(만료 `seatMs`). 관문 하나를 고른다(살아 있는 것 가운데) | Seat |
| 10 | Api | Ticket `{page, gate}` 를 답한다. page 는 앞문의 Static 이 주는 뷰어 페이지이고 `?ws=` 가 관문의 주소다 | 클라이언트 ◇ |

## 멈추는 자리

- 자리(Seat `held`)가 잡혔다. 클라이언트가 관문의 주소를 든다. 또는 대기열의 순번.

## 이어지는 흐름

- 9 접속 · 4 호스트의 글 · 5 박자.

## 규칙

- 인스턴스에 놓는 수는 배치가 센다. 자리(held · taken · grace)의 수가 Zone.capacity 를 넘지 않는다. 자리 없이 관문을 지날 수 없으므로(흐름 9) 상한은 여기서 지켜진다.
- 입장이 겹쳐도 인스턴스는 한 번만 띄운다.
- NPC 묶음의 grant 는 인스턴스가 `ready` 가 되기 전이다. 어떤 사람도 그 전에 그 인스턴스에 놓이지 않는다.
- 클라이언트는 호스트의 주소를 받지 않는다.

## 미정

- 없음.

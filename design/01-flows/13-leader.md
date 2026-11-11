# 흐름 13. 컨트롤 플레인 전환 — 컨트롤 플레인의 Clock

트리거: 컨트롤 플레인 프로세스의 Clock. 간격(`leaderMs`)마다. 컨트롤 플레인은 둘이 뜨고(활성 하나 · 대기 하나) 한때에 하나만 일한다.
한 줄: 활성은 LeaderLock 을 늦추며 일하고, 늦추지 못하면 대기로 물러난다. 대기는 LeaderLock 이 비면 잡아 활성이 되고, 스토리지의 표와 노드 · 게이트웨이의 보고로 제 표를 다시 세운 뒤에 일을 시작한다. 노드 · 게이트웨이 · API 서버는 번호(term)가 가장 큰 활성만 따른다.

## 순서

```text
Service.elect                                           [앱 — 컨트롤 플레인]
  LeaderLock.acquire                                    [스토리지]
    못 잡았다 ─► 대기 ◇ — 간격마다 다시
    잡았다 ─► 활성
      Fleet.start ── Assignment.all · Database.all(nodes)        [플릿 · 스토리지]
      SessionManager — Database.all(zones) · Operator            [세션 · 스토리지]
      settling ◇ — 보고를 모은다
        NodeRpc register · heartbeat ─► Fleet.register · Fleet.heartbeat · SessionManager.reconcile
        SessionRpc heartbeat ─► SessionManager.heartbeat
      settling 끝 — 일을 시작한다                           ⇒ 흐름 5 · 12
  활성 — LeaderLock.renew × 간격
    늦추지 못했다 ─► 표를 버리고 대기로
노드 · 게이트웨이 · API 서버 — 활성에 닿지 않으면
  LeaderLock.holder                                     [스토리지]
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Service.elect → LeaderLock.acquire(name, holder, ttl) | 비었거나 만료됐으면 term 을 하나 올려 잡는다. holder 는 이 프로세스의 내부 주소 | term 또는 null |
| 2 | (못 잡았다) Service | 대기다. 아무것도 듣지 않고 표도 세우지 않는다. 간격마다 1 로 | 대기 ◇ |
| 3 | (잡았다) Service → Fleet.start | 활성이 된다. Assignment.all 의 줄마다 Instance 를 세운다 — 표에 `stopped` · `failed` 인 것은 그대로(draining · restarts · 세대도), 도는 것(`running`)은 노드가 알릴 때까지 `unknown` 이다. 표 `nodes` 에서 알던 노드의 이름과 cordoned 를 읽는다. Clock.run | Instance × 줄 |
| 4 | Service → SessionManager · Operator | 설정의 존마다 Zone · Queue 를 세우고 표 `zones` 에서 closed 를 읽는다. 플릿의 기능과 계정의 기능 · Signer 의 issue 를 값으로 준다. SessionRpc · NodeRpc · Operator 를 듣고, 보내는 글마다 term 을 싣는다 | settling ◇ |
| 5 | 노드 · 게이트웨이 · API 서버 → LeaderLock.holder(name) | 활성에 보낸 글이 닿지 않거나 더 큰 term 의 글을 받으면 지금의 활성을 다시 읽는다. 노드는 NodeRpc register 를, 게이트웨이는 SessionRpc heartbeat 를 새 활성에 보낸다 | 주소 · term |
| 6 | Fleet.register · Fleet.heartbeat · SessionManager.reconcile (settling) | 노드가 알린 인스턴스는 그 state 가 되고, 로드된 캐릭터마다 세션이 없으면 `grace` 로 되찾는다(Presence.put — 재접속 유예를 새로 건다). 그 인스턴스의 슬롯이 그만큼 세어진다. 표와 다른 인스턴스를 내리게 하는 것(흐름 5 의 7 ①)은 settling 에도 한다 | 세션 |
| 7 | SessionManager.heartbeat (settling) | 게이트웨이가 알린 접속마다 세션이 있으면 `active` 로 하고 그 게이트웨이를 적는다. 세션이 아직 없는 접속은 두고 본다(그 노드가 아직 알리지 않았을 수 있다) | 접속 표 |
| 8 | Service | 표 `nodes` 의 노드가 전부 알렸거나 한계(`settleMs`)가 지나면 settling 을 끝낸다. 그때까지 입장 · 접속 · 사람의 존 이동은 「잠시 뒤 다시」(503 · 1013)이고, 띄움 · 내림 · 죽음의 판정 · 세션을 지우는 맞춤 · 운영자의 `restore` · `remove` 는 하지 않는다 | 활성 |
| 9 | Fleet · SessionManager (settling 끝) | 아직 `unknown` 인 인스턴스는 죽은 것이다 ⇒ 흐름 12. 그 뒤로 흐름 5 의 맞춤이 전부 돈다 — 세션 없는 접속은 kick, 접속이 이어진 곳과 로드된 곳이 다르면 reroute, 로드되지 않은 세션은 지운다 | |
| 10 | 활성 → LeaderLock.renew(name, holder, term) | 간격마다 만료를 늦춘다. 거절되거나(남이 잡았다) 스토리지에 닿지 않은 채 ttl 이 지나면 듣기를 닫고 표를 버리고 2 로 물러난다. 인스턴스는 내리지 않는다 | 대기 ◇ |
| 11 | 노드 · 게이트웨이 | 제가 받아들인 term 보다 작은 term 의 글(launch · stop · load · unload · reload · reroute · kick)은 버린다 | |

## 멈추는 자리

- 활성 하나가 일한다. 대기는 기다린다. LeaderLock 의 줄이 스토리지에.

## 이어지는 흐름

- 1 시작 · 5 주기 작업 · 7 종료 · 12 장애 복구.

## 규칙

- 활성이 둘인 때가 없다. 옛 활성이 물러난 줄 모르고 보낸 글은 term 이 작아 버려진다 — 옛 활성의 지시로 인스턴스가 내려가거나 캐릭터가 옮겨지지 않는다.
- 전환을 넘어 남는 것은 스토리지의 것이다 — 인스턴스의 줄(내려가 있는가 · 비우는 가운데인가 · 몇 번 죽었는가 · 세대), 존의 닫힘, 노드의 cordoned. 점검 가운데 전환되어도 닫은 존은 닫혀 있고 비우던 인스턴스는 세션을 받지 않는다.
- 세션은 스토리지에 없다. 노드가 든 것(로드된 캐릭터)에서 `grace` 로, 게이트웨이가 든 것(접속)에서 `active` 로 다시 선다. `pending` 이던 세션과 대기열은 사라지고, 클라이언트가 다시 물으면 새로 선다.
- settling 이 있는 까닭: 표가 다 서기 전에 일하면 꽉 찬 인스턴스가 빈 것으로 세어져 상한을 넘기고, 아직 알리지 않은 노드의 인스턴스를 죽은 것으로 보아 멀쩡한 사람을 옮긴다.
- 전환 사이(ttl 과 settling)에는 입장 · 존 이동 · 장애 복구가 기다린다. 붙어 있는 사람은 그대로 논다.
- 이동 가운데 전환되면 그 이동은 이어지지 않는다. 값이 로드된 곳이 그 캐릭터의 자리가 되고(9), 어디에도 로드되지 않았으면(언로드와 로드 사이) 접속을 닫는다 — 값은 스토리지에 있고 클라이언트는 다시 입장한다.
- 대기는 활성과 같은 설정 · 같은 빌드다. 배포의 전환(흐름 6 의 규칙) 동안만 다를 수 있고, 그때는 새 것이 활성이 되는 것이 그 전환이다.
- 활성이 종료 신호로 내려갈 때는 LeaderLock.resign 으로 놓는다 — 대기가 ttl 을 기다리지 않고 잡는다(흐름 7).

## 미정

- 없음.

# 흐름 13. 컨트롤 플레인 전환 — 컨트롤 플레인의 Clock

트리거: 컨트롤 플레인 프로세스의 Clock. 간격(`leaderMs`)마다. 컨트롤 플레인은 둘이 뜨고(활성 하나 · 대기 하나) 한때에 하나만 일한다.
한 줄: 활성은 LeaderLock 을 늦추며 일하고, 늦추지 못하면 스스로 멈춘다. 대기는 LeaderLock 이 비면 잡아 활성이 되고 표를 다시 세운다. 노드 · 게이트웨이 · API 서버는 번호(term)가 가장 큰 활성만 따른다.

## 순서

```text
Service.elect                                           [앱 — 컨트롤 플레인]
  LeaderLock.acquire                                    [스토리지]
    잡았다 ─► 활성 — Fleet.start · SessionManager · Operator     ⇒ 흐름 1 의 5 · 6
    못 잡았다 ─► 대기 ◇ — 간격마다 다시
  활성 — LeaderLock.renew × 간격
    늦추지 못했다 ─► Service.stop                         ⇒ 흐름 7
노드 · 게이트웨이 · API 서버 — 활성에 닿지 않으면
  LeaderLock.holder                                     [스토리지]
  NodeRpc register · SessionRpc heartbeat                ⇒ 흐름 1 의 8 · 흐름 5 의 9
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Service.elect → LeaderLock.acquire(name, holder, ttl) | 비었거나 만료됐으면 term 을 하나 올려 잡는다. holder 는 이 프로세스의 내부 주소 | term 또는 null |
| 2 | (잡았다) Service | 활성이 된다 — 흐름 1 의 5 · 6 을 이제 한다. SessionRpc · NodeRpc · Operator 를 듣고, 보내는 글마다 term 을 싣는다 | 활성 |
| 3 | (못 잡았다) Service | 대기다. 아무것도 듣지 않고 표도 세우지 않는다. 간격마다 1 로 | 대기 ◇ |
| 4 | 활성 → LeaderLock.renew(name, holder, term) | 간격마다 만료를 늦춘다. 거절되거나(남이 잡았다) 스토리지에 닿지 않은 채 ttl 이 지나면 스스로 Service.stop — 듣기를 닫는다. 인스턴스는 내리지 않는다 | |
| 5 | 노드 · 게이트웨이 · API 서버 → LeaderLock.holder(name) | 활성에 보낸 글이 닿지 않거나 더 큰 term 의 글을 받으면 지금의 활성을 다시 읽는다 | 주소 · term |
| 6 | 노드 → NodeRpc register · 게이트웨이 → SessionRpc heartbeat | 새 활성에 제 것을 알린다 — 노드는 도는 인스턴스와 든 캐릭터들, 게이트웨이는 붙은 캐릭터들. 새 활성의 Fleet.register · SessionManager.heartbeat 가 표를 다시 채운다 | 표 |
| 7 | 노드 · 게이트웨이 | 제가 받아들인 term 보다 작은 term 의 글(launch · stop · load · unload · reroute · kick)은 버린다 | |

## 멈추는 자리

- 활성 하나가 일한다. 대기는 기다린다. LeaderLock 의 줄이 스토리지에.

## 이어지는 흐름

- 1 시작 · 5 주기 작업 · 7 종료.

## 규칙

- 활성이 둘인 때가 없다. 옛 활성이 멈춘 줄 모르고 보낸 글은 term 이 작아 버려진다 — 옛 활성의 지시로 인스턴스가 내려가거나 캐릭터가 옮겨지지 않는다.
- 전환 사이(ttl 까지)에는 입장 · 존 이동 · 장애 복구가 기다린다. 붙어 있는 사람은 그대로 논다.
- 세션(pending · grace)의 만료 시각은 전환으로 사라진다. 새 활성은 게이트웨이가 알린 캐릭터를 `active` 로, 노드가 알렸으나 어느 게이트웨이에도 없는 캐릭터를 `grace` 로 되찾아 재접속 유예를 새로 건다. 대기열은 비고, 클라이언트가 다시 물으면 새로 선다.
- 대기는 활성과 같은 설정 · 같은 빌드다.

## 미정

- 없음.

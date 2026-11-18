# 플릿 fleet — 책임

플릿이란, 컨트롤 플레인에서 인스턴스(호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나)를 어느 노드에 띄우고 지키고 내릴지 정하는 것이다. 프로세스를 실제로 띄우고 캐릭터의 값을 올리고 내리는 것은 노드 모듈이다([node.md](node.md)).

- 컨트롤 플레인에만 산다. 노드와는 NodeRpc 로만 만난다 — 노드에 보내는 것(launch · stop · command · load · unload)은 노드의 주소마다의 NodeSocket, 노드가 알리는 것(register · report · handoff · exited)은 이 모듈이 받는다(ControlSocket).
- 누가 누구인가를 모른다. 캐릭터는 이름 글 하나다. 어디에 배정할지는 세션 모듈이 정한다.
- 세계 안을 모른다. 엔진에 닿지 않는다 — 노드가 본 것(보고)만 안다.
- 게임 명사를 모른다. 존의 데이터셋 · NPC 묶음은 설정 값이다.

| 개념 | 책임 하나 |
|---|---|
| Registry | 인스턴스의 표를 든다 |
| Nodes | 노드의 표와 살아 있음을 든다 |
| Scheduler | 새 인스턴스를 띄울 노드를 고른다 |
| Scaler | 존마다 예비 용량을 맞춘다 |
| Recoverer | 죽은 인스턴스의 뒤를 수습한다 |
| Clock | 간격마다 부른다(컨트롤 플레인의 것) |

## 개념

### Registry
- 데이터: db(참조 — 표 `instances`: 이름 → Instance).
- 기능: all 은 줄 전부. put(instance) 는 줄을 적는다. remove(instance) 는 내려간 인스턴스의 줄을 지운다. ready(zone) 은 그 존의 `ready` 이고 비우는 가운데가 아닌 인스턴스들. drain(instance, on) 은 비우는 가운데 표시를 켜고 끈다(새 세션을 받지 않는다). reset(instance) 은 운영자가 본 인스턴스의 죽은 셈을 비우고, `failed` 면 `stopped` 로 둔다 — 다시 띄울 수 있다(흐름 6 의 start · restore).
- 생애: Service.start 가 만든다.

### Instance
- 데이터: name(`<존>-<번호>`) · zone · node · port · epoch:int(띄울 때마다 하나 오른다) · build · state:`starting`|`ready`|`stopping`|`stopped`|`failed` · draining:bool · restarts:int.
- 기능: 없음. 인스턴스 하나 = 호스트 하나 = Store 자리 하나.

### Nodes
- 데이터: rows:map<이름, Node> · db(참조 — 표 `nodes`: 이름 → cordoned) · registry(참조) · missing:map<인스턴스 이름, int>(보고에 잇달아 없던 수).
- 기능: register(node) 는 노드를 적는다. heartbeat(보고) 는 보고가 온 때와 그 보고(인스턴스들의 state · 사람 수 · 틱 지연 · 로드된 캐릭터)를 적고 표와 맞춘다 — 표에 없는(세대가 다른) 인스턴스는 내릴 것으로, 표에서는 그 노드에서 `ready` 인데 보고에 잇달아 둘 없는 인스턴스는 죽은 것으로 준다(⇒ 흐름 12). 하나는 방금 띄운 것과 엇갈린 보고일 수 있다. dead() 는 보고가 한계(`reportLimitMs`)를 넘겨 끊긴 노드들 — 노드의 절반 넘게가 한꺼번에 끊겨 보이면 컨트롤 플레인 쪽 망을 의심해 판정하지 않고 그 노드들을 둔다(흐름 5 의 「실패하면」). cordon(node) · uncordon(node) 는 그 노드에 새로 띄우지 않게 하고 푼다. forget(node) 는 표에서 뺀다. list · live.
- 생애: Service.start 가 만든다.

### Node
- 데이터: name · address(NodeRpc 의 주소) · host(내부망에서 호스트가 보이는 이름) · build · slots:int(띄울 수 있는 인스턴스의 수 — 코어) · used:int · seen · cordoned:bool · closing:bool.
- 기능: 없음.

### Scheduler
- 데이터: nodes(참조) · registry(참조).
- 기능: place(zone, build) 는 그 빌드를 들고 slots 에 여유가 있고 cordoned · closing 이 아닌 노드 하나와, 그 존의 내려가 있는 이름(없으면 빈 번호)을 고른다. 없으면 null.
- 생애: Service.start 가 만든다.

### Scaler
- 데이터: registry(참조) · count(인스턴스 → 잡힌 슬롯, 세션 모듈의 기능 — 앱이 준다) · zones(설정).
- 기능: balance 는 존마다 빈 슬롯의 합이 Zone.spare 보다 작으면 하나 띄우게 하고, 사람 없이 오래(`idleLimit`) 쉬었고 내려도 예비 용량이 남는 인스턴스와 다 비운 인스턴스는 내리게 한다.
- 생애: Service.start 가 만든다.

### Recoverer
- 데이터: registry(참조) · leases(참조) · move(세션 모듈의 기능 — 앱이 준다).
- 기능: recover(instance) 는 흐름 12 를 차례로 한다 — 줄을 `failed` 로, lease 를 끊고, 사람을 다시 배정하게 하고, 한계(`restartLimit`) 안이면 다시 띄우게 한다.
- 생애: Service.start 가 만든다.

### Clock
- 데이터: interval:int(불변, ms).
- 기능: run(tick) 은 간격마다 tick — 앞의 것이 끝나기 전에는 다음을 부르지 않는다. stop.
- 생애: Service.start 가 만든다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| NodeRpc register · report | 노드 → 컨트롤 플레인 | NodeReporter 의 것 | 없음 |
| NodeRpc handoff | 노드 → 컨트롤 플레인 | 인스턴스 · Character.id · to | 없음 |
| NodeRpc exited | 노드 → 컨트롤 플레인 | 인스턴스 · epoch · 종료 코드 | 없음 |
| NodeRpc launch · stop · command · load · unload | 컨트롤 플레인 → 노드 | [node.md](node.md) 의 소켓 | |

## 미정

- 없음.

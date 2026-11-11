# 플릿 fleet — 책임

플릿이란, 인스턴스(호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나)를 노드에 띄우고 지키고 내리며, 캐릭터의 값을 인스턴스에 건네는 것이다.

- 반은 컨트롤 플레인에(Fleet — 어느 노드에 무엇이 있는가), 반은 노드에(NodeAgent — 이 서버의 프로세스) 있다. 둘은 NodeRpc 소켓(`protocol/node.ts`)으로 만난다.
- 누가 누구인가를 모른다. 캐릭터는 이름 글 하나다. 어디에 배정할지는 세션 모듈이 정한다.
- 세계 안을 모른다. 호스트의 글은 머리글 · status 의 머리와 접속 · 지연 칸 · 이동 요청 줄만 읽는다. 캐릭터 파일의 안을 보지 않는다.
- 엔진에 닿는 길은 Spawner 하나다. 들고 가는 것은 `protocol/engine.ts` 의 인자와 Console 글뿐이다.
- 게임 명사를 모른다. 존의 데이터셋 · NPC 묶음은 설정 값이다.
- 인스턴스에는 세대(epoch)가 있다. 띄울 때마다 하나 오르고, 표(`instances`)의 세대가 그 이름의 진짜다. 노드가 알리는 글과 Store 를 올리는 것에는 세대가 실리고, 표와 다른 세대의 것은 버려지거나 내려진다 — 끊겼다 돌아온 노드의 낡은 호스트가 새 것을 해치지 못한다.
- 노드는 든 것(도는 인스턴스 · 로드된 캐릭터)을 간격마다 전부 알린다. 컨트롤 플레인의 표는 그것과 맞춰진다(흐름 5).
- 스토리지에는 SnapshotStore · Database · CharacterStore 소켓(`protocol/storage.ts`)으로만 닿는다. 토큰은 앱이 준 함수(issue)로만 낸다.

```text
Fleet ← Service(컨트롤 플레인)
├ Assignment ── Database (인스턴스의 표)
├ Node × 노드
├ Instance × 인스턴스
└ Clock

NodeAgent ← Service(노드)
├ Ports
├ Spawner (정적)
├ Probe (정적)
├ Clock
└ GameServer × 이 서버의 인스턴스
  ├ Process(host)
  └ Process(agent)
```

## 개념

### Fleet
- 데이터: nodes:map<이름, Node> · instances:map<이름, Instance> · assignment · clock · rpc(참조, NodeRpc 소켓) · snapshots(참조) · characters(참조 — CharacterStore 의 expire) · sessions(세션 모듈의 기능 여섯 transfer · failover · migrate · reconcile · count · waiting, 앱이 준다) · lock(참조 — LeaderLock 의 renew · resign) · db(참조 — 표 `nodes`) · settling:bool(막 활성이 됐다 — 흐름 13) · term(이 활성의 번호 — 스토리지에 쓰는 것마다 싣는다) · config:{zones, build(새 사람을 받는 빌드), reportLimitMs, restartLimit, stableMs, idleLimit, lagLimit, settleMs}.
- 기능: start 는 흐름 1. instances(zone) 은 그 존의 ready 이고 `draining` 이 아니며 내려가는 노드(Node.closing)의 것이 아닌 Instance 들 — 새로 배정할 곳. instance(name) 은 그 인스턴스 하나의 state · draining · address · build · key — 이미 배정된 세션이 그곳에 이을 수 있는가를 본다(`draining` 이어도 ready 면 잇는다). launch(zone, build, instance) 은 흐름 3 — 인스턴스를 예비 용량 있는 Node 에 띄운다. instance 를 주면 그 이름을(`failed` · `stopped` 인 것을 다시 띄울 때), 안 주면 그 존의 `stopped` 인 이름(운영자가 붙든 것 — held — 은 빼고)이나 빈 번호를 쓴다. 올리지 못한 채 내려간 이름(줄의 local)은 그 노드에만 띄운다. 세대를 올려 SnapshotStore.claim 으로 Store 자리의 주인을 적고 줄을 적은 뒤 노드에 시킨다. 띄우는 가운데의 것이 있으면 그것을 기다린다. settling 이면 하지 않는다. terminate(instance, hold) 는 내린다 — hold 면 줄에 붙듦(held)을 적는다(운영자의 `stop`). resume(instance) 는 붙듦을 풀고 셈(restarts)을 0 으로 해 그 이름으로 launch 한다(운영자의 `start`). dead(node) 는 그 노드가 죽었는가 — 바로 오는 heartbeat 가 한계를 넘겨 끊겼고, 그 노드가 스토리지에 적는 표지(표 `beacons`)도 한계보다 낡았을 때만 참이다. drain(instance) · undrain(instance) 은 `draining` 으로 하고 되돌린다. remove(instance) 는 내려간 인스턴스의 표의 줄을 지운다. load(instance, character, op, spot) · unload(instance, character, op) · reload(instance, character, op) 는 그 Node 의 NodeAgent 에 시킨다. op 는 세션 모듈이 낸 일의 번호다. command(instance, 글) 은 Console 글과 그 답. register(node, 보고) · heartbeat(node, 보고) 는 노드의 알림을 받아 표와 맞춘다(흐름 1 · 5). 보고에는 그 프로세스가 뜬 때의 표지(boot)와 순번이 있다. 같은 boot 의 순번이 앞에 받은 것보다 작으면 버린다. boot 가 바뀌었으면(노드 에이전트가 다시 떴다) 순번을 새로 세고, 그 노드에 걸린 since 는 전부 넘긴 것으로 본다. 모르는 노드의 heartbeat 에는 register 를 다시 하라고 답한다. forget(node) 는 그 노드를 죽은 것으로 하고(그 인스턴스들을 흐름 12 로) 표의 줄을 지운다 — 사람이 판정한다. handoff(node, instance, epoch, character, to) 는 세션 모듈의 transfer 로 넘긴다(흐름 10). exited(node, instance, epoch, code, uploaded) 는 흐름 12. 셋 다 알린 노드와 세대가 표의 것과 다르면 버린다. cordon(node) · uncordon(node) 는 그 Node 에 새 인스턴스를 띄우지 않게 하고 푼다. 표 `nodes` 에 적는다. purge(instance) 는 줄이 지워진 인스턴스의 Store 자리와 백업을 지운다. backup(instance) · restore(instance, 백업) · copies(instance) 는 내려간 인스턴스의 Store 를 SnapshotStore 의 copy · restore · list 로 백업하고 복원하고 센다. restore 는 세대를 하나 올려 표와 Store 자리에 적는다. tick 은 흐름 5. stats 는 노드 · 인스턴스마다의 state · 사람 수 · 틱 지연(흐름 14).
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Node
- 데이터: name(불변) · address(NodeRpc 의 주소) · build(그 노드의 엔진 커밋) · slots:int(띄울 수 있는 인스턴스의 수 — 코어) · used:int · host(내부망에서 호스트가 보이는 이름) · keys(든 서명 키의 자리들) · boot · seq(받은 보고의 표지와 순번) · seen(마지막 보고 시각) · cordoned:bool(표 `nodes` 의 값) · closing:bool(노드가 내려가는 가운데라고 알렸다).
- 기능: 없음.
- 생애: Fleet.register 가 만든다. 보고가 한계(`reportLimitMs`)를 넘겨 끊기면 사라진다. 표 `nodes` 의 줄(이름 · cordoned)은 남는다.

### Instance
- 데이터: name(불변, `<존>-<번호>`) · zone(불변) · node · port · epoch:int(띄울 때마다 하나 오른다) · build · key(이 호스트가 뜬 서명 키의 자리) · state:`unknown`(표에는 도는 것으로 있으나 노드가 아직 알리지 않았다)|`starting`|`ready`|`stopping`|`stopped`|`failed` · draining:bool · since(이 인스턴스가 마지막으로 바뀐 때의 그 노드의 보고 순번) · players:int · lag:int(틱 지연) · idle:int · restarts:int · why:string|null.
- 기능: address 는 `ws://<node.host>:<port>`(내부망).
- 생애: Fleet.launch 가 만들거나 Fleet.start 가 표의 줄마다 만든다. 표의 줄이 지워질 때 사라진다.
- 인스턴스 하나 = 호스트 하나 = Store 자리 하나. `draining` 은 새 세션을 받지 않는다.

### Assignment
- 데이터: db(참조). 값은 스토리지에 — 표 `instances`(이름 → {zone, dataset, node, port, epoch, build, key, state(`running`|`stopped`|`failed`), draining, restarts, held(운영자가 내려 붙들었다), local(올리지 못한 채 내려갔다 — 그 노드의 자리가 가장 새것), ran(그 노드에서 마지막으로 돈 세대 — 노드가 답 · 보고로 알린 것), expired(이 세대가 죽은 뒤 lease 를 끊었는가 — 다시 띄우면 지운다)}).
- 기능: get(instance) · put(instance, row) · remove(instance) · all.
- 생애: Fleet 과 함께.
- 컨트롤 플레인이 바뀌어도 남아야 하는 것(내려가 있는가 · 비우는 가운데인가 · 몇 번 죽었는가 · 몇 번째 세대인가)이 여기 있다.

### NodeAgent
- 데이터: name(불변, 이 노드의 이름) · build(불변) · servers:map<인스턴스 이름, GameServer> · ports · clock · snapshots · characters(참조) · rpc(참조) · issue(NPC 계정 · 서명 키의 자리 → Token, 앱이 준다 — 그 호스트가 뜬 키로 낸다) · term(받아들인 활성 컨트롤 플레인의 번호) · held:map<Character.id, {file, lease}>(언로드했으나 아직 저장하지 못한 것) · boot(이 프로세스가 뜬 때의 표지) · seq:int(보고의 순번) · ops:map<Character.id, {term, op}>(그 캐릭터에 대해 받은 가장 큰 일의 번호) · unpushed:set<인스턴스>(내렸으나 Store 를 올리지 못한 것 — spool 에 적어 다시 떠도 남는다) · closing:bool · db(참조 — 표 `beacons` 의 제 줄) · config:{engineDir, beat, sparse, slots, spool, checkinEvery, backupEvery, statusMiss, closingMs, 한계들}.
- spool 은 이 서버의 디렉터리다. 인스턴스마다 캐릭터 파일(`<character>.json`)과 그 lease 의 번호(`<character>.lease`), 띄운 프로세스의 pid 표, Store 자리의 세대 표지가 여기 있다 — 노드 에이전트가 죽었다 다시 떠도 남는다.
- 기능: start 는 흐름 1 — reap, recover, 컨트롤 플레인에 register, Clock.run. reap 는 지난 실행이 남긴 호스트 · 에이전트 프로세스를 끝낸다(spool 의 pid 표). recover 는 spool 에 남은 캐릭터 파일을 그 lease 의 번호로 CharacterStore.checkin(release) 한다 — 거절되면 버리고, 스토리지에 닿지 않으면 held 에 둔다. launch(spec) 는 같은 이름의 다른 세대 GameServer 가 이 서버에 돌고 있으면 먼저 discard 로 내리고(그 이름이 unpushed 에 있으면 뺀다 — 이 서버의 자리에서 이어 뜬다), Store 자리를 마련한 뒤(spec 이 「이 서버의 세대 e 의 자리에서 이어라」고 했고 이 서버의 표지가 그 세대면 그대로, 아니면 이 서버의 자리를 버리고 SnapshotStore.pull) Ports.take · GameServer.start(흐름 3). stop(instance, discard) 은 그 GameServer 의 캐릭터를 전부 unload 하고 GameServer.stop 뒤, discard 가 아니면 SnapshotStore.push 로 올리고 SnapshotStore.copy · SnapshotStore.prune 으로 백업 하나를 남긴 다음 exited 를 uploaded 로 알린다. 올리지 못하면(스토리지에 닿지 않는다) unpushed 에 두고 uploaded 아님으로 알린다 — 그 서버의 자리가 가장 새것이다. discard 면(표가 이 노드의 것이 아니라고 했다) 올리지 않고 캐릭터의 값도 저장하지 않고 내린다 — 든 lease 는 CharacterStore.release 로 풀고(번호가 이미 다르면 그만이다) 이 서버의 그 Store 자리를 지운다. load(instance, character, spot) 는 CharacterStore.checkout 으로 값과 lease 를 받아 spool 에 두고 GameServer.load(흐름 9 · 10). 그 캐릭터가 이미 로드돼 있으면 — 같은 일의 번호의 글이면 됨을 답하고(다시 보낸 글), 다른 번호면 든 묶음은 앞의 세션의 것이다: 든 lease 로 저장하고 풀어(unload 와 같다 — 되면 그것이 마지막 진행이고, 거절되면 버린다) 새로 checkout 해 로드한다. 저장하지 못해 held 에 있는 캐릭터의 load 는 그 저장을 먼저 해 보고, 안 되면 실패를 답한다. 엔진이 거절하면 CharacterStore.release. unload(instance, character) 는 GameServer.unload 뒤 CharacterStore.checkin(release). 저장하지 못하면(스토리지에 닿지 않는다) held 에 두고 실패를 답한다(흐름 10 · 11). reload(instance, character) 는 held 의 파일로 같은 인스턴스에 GameServer.load 를 다시 하고 held 에서 뺀다(흐름 10 의 물러남). command(instance, 글). tick 은 흐름 5 — status · 스냅샷 저장 · held 다시 저장 · 백업. heartbeat 는 tick 과 따로 제 간격으로 든 것을 전부 알린다 — 저장 · 백업이 밀려도 보고는 간다. 같은 간격에 스토리지의 표 `beacons` 에 제 줄도 적는다(살아 있다는 표지 — 컨트롤 플레인이 이 노드에 닿지 못할 때 죽은 것과 가르는 증거). 보고마다 seq 가 오르고, launch · load · unload · reload 의 답에도 그때의 seq 를 싣는다. 한 캐릭터의 로드 · 저장 · 언로드는 한 번에 하나다(주기 저장 가운데 온 언로드는 그 저장이 끝난 뒤에). load · unload · reload 의 글에 실린 일의 번호(term 과 op — term 이 먼저다)가 그 캐릭터에 대해 받은 것보다 작으면 버린다. 올리지 못한 Store(unpushed)는 tick 마다 다시 올리고, 올렸거나 거절돼 버렸으면 exited 를 한 번 더 알린다. heartbeat 에 unpushed 인 이름들도 싣는다. stopAll 은 흐름 7. stats 는 GameServer 마다의 state · 틱 지연(흐름 14).
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### GameServer
- 데이터: name(불변, 인스턴스 이름) · epoch(불변) · spec:{zone, dataset, storeDir, port, party, npc, key(서명 키의 자리), resume(이어갈 자리 — 이 서버의 세대 e 의 것 또는 올라가 있는 것)}(불변) · state:`stopped`|`starting`|`ready`|`stopping`|`failed` · host:Process|null · agent:Process|null · lastStatus:StatusLine|null · linked:list<Character.id>(접속한 것) · loaded:map<Character.id, Lease>(로드된 것) · lag:int · misses:int(답 없는 status 의 수) · agentRestarts:int · why:string|null · waiting(답을 기다리는 명령 줄).
- 기능: start 는 흐름 3 의 띄움 — Spawner.host, 머리글, NPC 묶음의 grant, Spawner.agent. stop. command(글) 은 호스트의 stdin 에 글 한 줄을 쓰고 그 답 한 줄을 돌려준다. load(character, file, lease, spot) 는 로드의 Console 글을 쓰고 loaded 에 둔다. unload(character, file) 은 언로드의 Console 글을 쓰고 loaded 에서 뺀다. 없는 캐릭터의 unload 는 됨을 답한다(다시 보낸 글). snapshot(dir) 은 스냅샷의 Console 글(`keep` — 계정 없이)로 로드된 캐릭터 전부의 값을 한 번에 쓴다. 같은 창 사이의 값이다. backup(dir) 은 Console `backup <dir>` 을 쓰고 `backup 끝 — ` 줄이 오면 끝난다(한계 안에 없으면 실패). line(which, 줄) · exited(which, code) 는 흐름 4.
- 생애: NodeAgent.launch 가 만든다. NodeAgent.stop 뒤 사라진다.

### Ports
- 데이터: range:[from, to](불변) · used:set<int>.
- 기능: take() 는 쓰지 않고 지금 열 수 있는 포트 하나 또는 null. free(port).
- 생애: NodeAgent 와 함께.

### Spawner
- 데이터: engineDir(불변). 정적.
- 기능: missing(engineDir) 는 엔진 체크아웃이 없으면 그 까닭. bundle(engineDir, outfile) 는 뷰어를 묶는다(API 서버의 시작). host(engineDir, args, key) 는 엔진의 `host` 를(key 는 spec 이 가리킨 자리의 서명 키) `<dataset> --port <port> --store <storeDir> --beat <beat> --sparse <sparse> --party <party> --handoff <spool>` 과 환경 `HOST_AUTH_KEY` 로 띄운다. agent(server, npc, token) 은 엔진의 `agent` 를 띄운다. 셋 다 Process.
- 생애: 없음.
- 엔진의 인자는 `protocol/engine.ts` 가 든다. 거기 없는 인자를 쓰지 않는다.

### Process
- 데이터: pid · lines(stdout · stderr 의 줄을 받는 자리) · exit:int|null.
- 기능: write(글) · kill(신호) · onLine · onExit.
- 생애: Spawner 가 만든다. exit 뒤 사라진다.

### Probe
- 데이터: 없음. 정적.
- 기능: read(line) → `{kind:'listening'}` | `{kind:'ready'}` | `{kind:'status', status:StatusLine, accounts:list<string>, lag:int}` | `{kind:'handoff', character, to}`(이동 요청 줄 `떠남 — `) | `{kind:'backed', dir}`(`backup 끝 — ` 줄) | `{kind:'halt'}` | `{kind:'other'}`. answers(명령, line) 은 그 줄이 그 Console 명령의 답인가.
- 생애: 없음.

### Clock
- 데이터: interval:int(불변, ms) · timer.
- 기능: run(tick) 은 간격마다 tick — 앞의 tick 이 끝나기 전에는 다음을 부르지 않는다. stop.
- 생애: Fleet · NodeAgent 와 함께.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| NodeRpc register | 노드 → 컨트롤 플레인 | 노드의 이름 · 주소 · 빌드 · slots · 든 서명 키의 자리들과 heartbeat 의 것 전부 | 없음 |
| NodeRpc heartbeat | 노드 → 컨트롤 플레인 | boot · 순번(seq) · 노드의 closing, 인스턴스마다 이름 · epoch · port · state · players · lag · 로드된 캐릭터들 · 접속한 캐릭터들, 그리고 unpushed 인 이름들 | 없음 또는 「register 를 다시」 |
| NodeRpc handoff | 노드 → 컨트롤 플레인 | 노드 · 인스턴스 · epoch · Character.id · to | 없음 |
| NodeRpc exited | 노드 → 컨트롤 플레인 | 노드 · 인스턴스 · epoch · 종료 코드 · uploaded(노드가 내려서 Store 를 올렸다 — 뒤늦게 올렸을 때 한 번 더 알린다) | 없음 |
| NodeRpc launch | 컨트롤 플레인 → 노드 | 인스턴스 이름 · epoch · spec(서명 키의 자리와 이어갈 자리를 든다) · term | port · seq 또는 까닭 |
| NodeRpc stop | 컨트롤 플레인 → 노드 | 인스턴스 · epoch · discard · term | 없음 |
| NodeRpc command | 컨트롤 플레인 → 노드 | 인스턴스 · Console 글 한 줄 · term | 답 글 한 줄 |
| NodeRpc load · unload · reload | 컨트롤 플레인 → 노드 | 인스턴스 · epoch · Character.id · op(· spot) · term | 됨 · seq 또는 까닭 |
| Engine host · agent · bundle | 노드 · API 서버 → 엔진 | 인자 · 환경 | 머리글 또는 exit |
| Engine command | 노드 → 엔진 | Console 글 한 줄 | 답 글 한 줄 |
| Engine line | 엔진 → 노드 | stdout · stderr 한 줄 · exit | 없음 |
| SnapshotStore pull · push · epochOf · copy · prune | 노드 → 스토리지 | 인스턴스 이름 · epoch · dataset · dir | dir · 백업 이름 · 세대 · 거절 |
| SnapshotStore claim · epochOf · copy · restore · list · purge | 컨트롤 플레인 → 스토리지 | 인스턴스 이름 · epoch · 백업 이름 · term | 백업 이름 · 목록 · 세대 · 거절 |
| CharacterStore checkout · checkin · release | 노드 → 스토리지 | Character.id · 든 자(인스턴스) · lease · 파일 | 값과 lease · 됨 |
| CharacterStore expire | 컨트롤 플레인 → 스토리지 | 든 자(인스턴스) · term | 됨 또는 거절 |
| Database get · put · remove · all | 플릿 → 스토리지 | 표 `instances` · `nodes` 의 줄 하나 · term | 값 또는 null |
| LeaderLock renew · resign | 플릿(Fleet) → 스토리지 | 이름 · holder · term | 됨 또는 거절 |
| Database put · get(beacons) | 노드 → 스토리지 · 컨트롤 플레인 → 스토리지 | 노드의 이름 | 적은 때 |
| LeaderLock holder | 플릿(NodeAgent) → 스토리지 | 이름 | 주소 · term |

## 미정

- 없음.

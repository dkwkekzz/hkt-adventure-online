# 플릿 fleet — 책임

플릿이란, 인스턴스(호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나)를 노드에 띄우고 지키고 내리며, 캐릭터의 값을 인스턴스에 건네는 것이다.

- 반은 컨트롤 플레인에(Fleet — 어느 노드에 무엇이 있는가), 반은 노드에(NodeAgent — 이 서버의 프로세스) 있다. 둘은 NodeRpc 소켓(`protocol/node.ts`)으로 만난다.
- 누가 누구인가를 모른다. 캐릭터는 이름 글 하나다. 어디에 배정할지는 세션 모듈이 정한다.
- 세계 안을 모른다. 호스트의 글은 머리글 · status 의 머리와 접속 · 지연 칸 · 이동 요청 줄만 읽는다. 캐릭터 파일의 안을 보지 않는다.
- 엔진에 닿는 길은 Spawner 하나다. 들고 가는 것은 `protocol/engine.ts` 의 인자와 Console 글뿐이다.
- 게임 명사를 모른다. 존의 데이터셋 · NPC 묶음은 설정 값이다.
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
- 데이터: nodes:map<이름, Node> · instances:map<이름, Instance> · assignment · clock · rpc(참조, NodeRpc 소켓) · snapshots(참조) · sessions(세션 모듈의 기능 둘 transfer · failover, 앱이 준다) · config:{zones, reportLimitMs, restartLimit, idleLimit, lagLimit}.
- 기능: start 는 흐름 1. instances(zone) 은 그 존의 ready 인 Instance 들. launch(zone) 은 흐름 3 — 빈 번호의 인스턴스를 예비 용량 있는 Node 에 띄운다(띄우는 가운데의 것이 있으면 그것을 기다린다). remove(instance) 는 내려간 인스턴스의 표의 줄을 지운다. stats 는 노드 · 인스턴스마다의 state · 사람 수 · 틱 지연(흐름 14). drain(instance) 은 `draining` 으로 — 새 세션을 받지 않는다. terminate(instance) 는 내린다. backup(instance) · restore(instance, 백업) · copies(instance) 는 내려간 인스턴스의 Store 를 SnapshotStore 의 copy · restore · list 로 백업하고 복원하고 센다. load(instance, character) · unload(instance, character) 는 그 Node 의 NodeAgent 에 로드 · 언로드를 시킨다. command(instance, 글) 은 Console 글과 그 답. register(node) · heartbeat(node, 보고) 는 노드의 알림을 받는다(흐름 1 · 5). handoff(instance, character, zone) 은 세션 모듈의 transfer 로 넘긴다(흐름 10). exited(instance, code) 와 tick 의 보고 끊김은 흐름 12. tick 은 흐름 5.
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Node
- 데이터: name(불변) · address(NodeRpc 의 주소) · build(그 노드의 엔진 커밋) · term(받아들인 활성의 번호) · slots:int(띄울 수 있는 인스턴스의 수 — 코어) · used:int · host(내부망에서 호스트가 보이는 이름) · seen(마지막 보고 시각).
- 기능: 없음.
- 생애: Fleet.register 이 만든다. 보고가 한계(`reportLimitMs`)를 넘겨 끊기면 사라진다.

### Instance
- 데이터: name(불변, `<존>-<번호>`) · zone(불변) · node · port · build(그 노드의 빌드) · state:`starting`|`ready`|`draining`|`stopping`|`stopped`|`failed` · players:int · lag:int(틱 지연) · idle:int · restarts:int · dirty:bool · why:string|null.
- 기능: address 는 `ws://<node.host>:<port>`(내부망).
- 생애: Fleet.launch 가 만들거나 Fleet.start 가 표의 줄마다 `stopped` 로 만든다. 표의 줄이 지워질 때 사라진다.
- 인스턴스 하나 = 호스트 하나 = Store 자리 하나. `draining` 은 새 세션을 받지 않는다.

### Assignment
- 데이터: db(참조). 값은 스토리지에 — 표 `instances`(이름 → {zone, dataset, node, port}).
- 기능: get(instance) · put(instance, row) · remove(instance) · all.
- 생애: Fleet 과 함께.

### NodeAgent
- 데이터: name(불변, 이 노드의 이름) · shards:map<인스턴스 이름, GameServer> · ports · clock · snapshots · characters(참조) · rpc(참조) · issue(NPC 계정 → Token, 앱이 준다) · config:{engineDir, beat, sparse, slots, spool(캐릭터 파일의 자리), checkinEvery, backupEvery, 한계들}.
- 기능: reap 는 지난 실행이 남긴 호스트 · 에이전트 프로세스를 끝낸다(spool 의 pid 표 — 흐름 1). stats 는 이 서버의 GameServer 마다의 state · 틱 지연(흐름 14). start 는 컨트롤 플레인에 register 를 보내고 Clock.run(흐름 1). launch(spec) 는 SnapshotStore.pull 로 Store 를 받고 Ports.take 뒤 GameServer.start(흐름 3). stop(instance) 은 그 GameServer 의 캐릭터를 전부 unload 하고 GameServer.stop, SnapshotStore.push 로 올린 뒤 SnapshotStore.copy · SnapshotStore.prune 으로 백업 하나를 남긴다. command(instance, 글). load(instance, character) 는 CharacterStore.checkout 으로 값과 lease 를 받아 GameServer.load(흐름 9 · 10). unload(instance, character) 는 GameServer.unload 뒤 CharacterStore.checkin 으로 저장하고 lease 를 푼다(흐름 10 · 11). tick 은 흐름 5 — status · 스냅샷 저장 · 보고. stopAll 은 흐름 7.
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### GameServer
- 데이터: name(불변, 인스턴스 이름) · spec:{zone, dataset, storeDir, port, party, npc}(불변) · state:`stopped`|`starting`|`ready`|`stopping`|`failed` · host:Process|null · agent:Process|null · lastStatus:StatusLine|null · linked:list<Character.id> · lent:map<Character.id, Lease> · lag:int · agentRestarts:int · why:string|null · waiting(답을 기다리는 명령 줄).
- 기능: start 는 흐름 3 의 띄움 — Spawner.host, 머리글, NPC 묶음의 grant, Spawner.agent. stop. command(글) 은 호스트의 stdin 에 글 한 줄을 쓰고 그 답 한 줄을 돌려준다. load(character, file, lease, spot) 는 로드의 Console 글을 쓰고 lent 에 둔다. unload(character, file) 은 언로드의 Console 글을 쓰고 lent 에서 뺀다. snapshot(character, file) 은 스냅샷의 Console 글(`keep`). backup(dir) 은 Console `backup <dir>` 을 쓰고 `backup 끝 — ` 줄이 오면 끝난다(한계 안에 없으면 실패). line(which, 줄) · exited(which, code) 는 흐름 4.
- 생애: NodeAgent.launch 가 만든다. NodeAgent.stop 뒤 사라진다.

### Ports
- 데이터: range:[from, to](불변) · used:set<int>.
- 기능: take() 는 쓰지 않고 지금 열 수 있는 포트 하나 또는 null. free(port).
- 생애: NodeAgent 과 함께.

### Spawner
- 데이터: engineDir(불변). 정적.
- 기능: missing(engineDir) 는 엔진 체크아웃이 없으면 그 까닭. bundle(engineDir, outfile) 는 뷰어를 묶는다(API 서버의 시작). host(engineDir, args, key) 는 엔진의 `host` 를 `<dataset> --port <port> --store <storeDir> --beat <beat> --sparse <sparse> --party <party> --handoff <spool>` 과 환경 `HOST_AUTH_KEY` 로 띄운다. agent(shard, npc, token) 은 엔진의 `agent` 를 띄운다. 셋 다 Process.
- 생애: 없음.
- 엔진의 인자는 `protocol/engine.ts` 가 든다. 거기 없는 인자를 쓰지 않는다.

### Process
- 데이터: pid · lines(stdout · stderr 의 줄을 받는 자리) · exit:int|null.
- 기능: write(글) · kill(신호) · onLine · onExit.
- 생애: Spawner 가 만든다. exit 뒤 사라진다.

### Probe
- 데이터: 없음. 정적.
- 기능: read(line) → `{kind:'listening'}` | `{kind:'ready'}` | `{kind:'status', status:StatusLine, accounts:list<string>, lag:int}` | `{kind:'handoff', character, zone, spot}`(spot 은 `@` 뒤의 공간 이름 또는 null)(이동 요청 줄) | `{kind:'backed', dir}`(`backup 끝 — ` 줄) | `{kind:'halt'}` | `{kind:'other'}`. answers(명령, line) 은 그 줄이 그 Console 명령의 답인가.
- 생애: 없음.

### Clock
- 데이터: interval:int(불변, ms) · timer.
- 기능: run(tick) 은 간격마다 tick — 앞의 tick 이 끝나기 전에는 다음을 부르지 않는다. stop.
- 생애: Fleet · NodeAgent 과 함께.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| NodeRpc register | 노드 → 컨트롤 플레인 | 노드의 이름 · 주소 · slots · 지금 도는 인스턴스들 | 없음 |
| NodeRpc heartbeat | 노드 → 컨트롤 플레인 | 인스턴스마다 state · players · lag · 접속한 캐릭터들 | 없음 |
| NodeRpc handoff | 노드 → 컨트롤 플레인 | 인스턴스 · Character.id · 존 이름 | 없음 |
| NodeRpc exited | 노드 → 컨트롤 플레인 | 인스턴스 · 종료 코드 | 없음 |
| NodeRpc launch | 컨트롤 플레인 → 노드 | 인스턴스 이름 · spec | port 또는 까닭 |
| NodeRpc stop | 컨트롤 플레인 → 노드 | 인스턴스 | 없음 |
| NodeRpc command | 컨트롤 플레인 → 노드 | 인스턴스 · Console 글 한 줄 | 답 글 한 줄 |
| NodeRpc load · unload | 컨트롤 플레인 → 노드 | 인스턴스 · Character.id | 됨 또는 까닭 |
| Engine host · agent · bundle | 노드 · API 서버 → 엔진 | 인자 · 환경 | 머리글 또는 exit |
| Engine command | 노드 → 엔진 | Console 글 한 줄 | 답 글 한 줄 |
| Engine line | 엔진 → 노드 | stdout · stderr 한 줄 · exit | 없음 |
| SnapshotStore pull · push · copy · prune | 노드 → 스토리지 | 인스턴스 이름 · dataset · dir | dir · 백업 이름 |
| SnapshotStore copy · restore · list | 컨트롤 플레인 → 스토리지 | 인스턴스 이름 · 백업 이름 | 백업 이름 · 목록 |
| CharacterStore checkout · checkin | 노드 → 스토리지 | Character.id · 든 자(인스턴스) · lease · 파일 | 값과 lease · 됨 |
| CharacterStore expire | 컨트롤 플레인 → 스토리지 | 든 자(인스턴스) | 없음 |
| Database get · put · remove | 플릿 → 스토리지 | 표 `instances` 의 줄 하나 | 값 또는 null |

## 미정

- 없음.

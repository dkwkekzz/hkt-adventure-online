# 함대 fleet — 책임

함대란, 인스턴스(호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나)를 노드에 띄우고 지키고 내리며, 캐릭터의 값을 인스턴스에 건네는 것이다.

- 반은 제어에(Fleet — 어느 노드에 무엇이 있는가), 반은 노드에(Warden — 이 기계의 프로세스) 있다. 둘은 Berth 소켓(`protocol/berth.ts`)으로 만난다.
- 누가 누구인가를 모른다. 캐릭터는 이름 글 하나다. 어디에 놓을지는 배치가 정한다.
- 세계 안을 모른다. 호스트의 글은 머리글 · status 의 머리와 접속 · 지연 칸 · 건넘 글만 읽는다. 건넴 파일의 안을 보지 않는다.
- 엔진에 닿는 길은 Spawner 하나다. 들고 가는 것은 `protocol/engine.ts` 의 인자와 Console 글뿐이다.
- 게임 명사를 모른다. 존의 데이터셋 · NPC 묶음은 설정 값이다.
- 저장에는 Vault · Ledger · Locker 소켓(`protocol/vault.ts`)으로만 닿는다. 토큰은 앱이 준 함수(issue)로만 낸다.

```text
Fleet ← Service(제어)
├ Assignment ── Ledger (인스턴스의 표)
├ Machine × 노드
├ Instance × 인스턴스
└ Clock

Warden ← Service(노드)
├ Ports
├ Spawner (정적)
├ Probe (정적)
├ Clock
└ Shard × 이 기계의 인스턴스
  ├ Process(host)
  └ Process(agent)
```

## 개념

### Fleet
- 데이터: machines:map<이름, Machine> · instances:map<이름, Instance> · assignment · clock · berth(참조, Berth 소켓) · vault(참조) · placement(배치의 기능 둘 move · lost, 앱이 준다) · config:{zones, reportLimitMs, restartLimit, idleLimit, lagLimit}.
- 기능: start 는 흐름 1. instances(zone) 은 그 존의 ready 인 Instance 들. launch(zone) 은 흐름 3 — 빈 번호의 인스턴스를 여유 있는 Machine 에 띄운다(띄우는 가운데의 것이 있으면 그것을 기다린다). drain(instance) 은 `draining` 으로 — 새 자리를 주지 않는다. retire(instance) 는 내린다. backup(instance) · restore(instance, 사본) · copies(instance) 는 내려간 인스턴스의 Store 를 Vault 의 copy · restore · list 로 베끼고 되돌리고 센다. lend(instance, character) · reclaim(instance, character) 는 그 Machine 의 Warden 에 건넴을 시킨다. command(instance, 글) 은 Console 글과 그 답. join(machine) · report(machine, 보고) 는 노드의 알림을 받는다(흐름 1 · 5). crossed(instance, character, zone) 은 배치의 move 로 넘긴다(흐름 10). exited(instance, code) 와 tick 의 보고 끊김은 흐름 12. tick 은 흐름 5.
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Machine
- 데이터: name(불변) · address(Berth 의 주소) · slots:int(띄울 수 있는 인스턴스의 수 — 코어) · used:int · host(안쪽 망에서 호스트가 보이는 이름) · seen(마지막 보고 시각).
- 기능: 없음.
- 생애: Fleet.join 이 만든다. 보고가 한계(`reportLimitMs`)를 넘겨 끊기면 사라진다.

### Instance
- 데이터: name(불변, `<존>-<번호>`) · zone(불변) · machine · port · state:`starting`|`ready`|`draining`|`stopping`|`stopped`|`failed` · players:int · lag:int(박자 지연) · idle:int · restarts:int · dirty:bool · why:string|null.
- 기능: address 는 `ws://<machine.host>:<port>`(안쪽 망).
- 생애: Fleet.launch 가 만들거나 Fleet.start 가 표의 줄마다 `stopped` 로 만든다. 표의 줄이 지워질 때 사라진다.
- 인스턴스 하나 = 호스트 하나 = Store 자리 하나. `draining` 은 새 자리를 주지 않는다.

### Assignment
- 데이터: ledger(참조). 값은 저장에 — 표 `instances`(이름 → {zone, dataset, machine, port}).
- 기능: get(instance) · put(instance, row) · remove(instance) · all.
- 생애: Fleet 과 함께.

### Warden
- 데이터: name(불변, 이 노드의 이름) · shards:map<인스턴스 이름, Shard> · ports · clock · vault · locker(참조) · berth(참조) · issue(NPC 계정 → Token, 앱이 준다) · config:{engineDir, beat, sparse, slots, spool(건넴 파일의 자리), checkinEvery, 한계들}.
- 기능: start 는 제어에 join 을 보내고 Clock.run(흐름 1). launch(spec) 는 Vault.pull 로 자리를 받고 Ports.take 뒤 Shard.start(흐름 3). stop(instance) 은 그 Shard 의 캐릭터를 전부 reclaim 하고 Shard.stop, Vault.push 로 올린 뒤 Vault.copy · Vault.prune 으로 사본 하나를 남긴다. command(instance, 글). lend(instance, character) 는 Locker.checkout 으로 값과 임대를 받아 Shard.lend(흐름 9 · 10). reclaim(instance, character) 는 Shard.reclaim 뒤 Locker.checkin 으로 넣고 임대를 푼다(흐름 10 · 11). tick 은 흐름 5 — status · 베껴 넣기 · 보고. stopAll 은 흐름 7.
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Shard
- 데이터: name(불변, 인스턴스 이름) · spec:{zone, dataset, storeDir, port, party, npc}(불변) · state:`stopped`|`starting`|`ready`|`stopping`|`failed` · host:Process|null · agent:Process|null · lastStatus:StatusLine|null · linked:list<Character.id> · lent:map<Character.id, Lease> · lag:int · agentRestarts:int · why:string|null · waiting(답을 기다리는 명령 줄).
- 기능: start 는 흐름 3 의 띄움 — Spawner.host, 머리글, NPC 묶음의 grant, Spawner.agent. stop. command(글) 은 호스트의 stdin 에 글 한 줄을 쓰고 그 답 한 줄을 돌려준다. lend(character, file, lease) 는 들임의 Console 글을 쓰고 lent 에 둔다. reclaim(character, file) 은 거둠의 Console 글을 쓰고 lent 에서 뺀다. copy(character, file) 은 베낌의 Console 글. line(which, 줄) · exited(which, code) 는 흐름 4.
- 생애: Warden.launch 가 만든다. Warden.stop 뒤 사라진다.

### Ports
- 데이터: range:[from, to](불변) · used:set<int>.
- 기능: take() 는 쓰지 않고 지금 열 수 있는 포트 하나 또는 null. free(port).
- 생애: Warden 과 함께.

### Spawner
- 데이터: engineDir(불변). 정적.
- 기능: missing(engineDir) 는 엔진 체크아웃이 없으면 그 까닭. bundle(engineDir, outfile) 는 뷰어를 묶는다(앞문의 시작). host(engineDir, args, key) 는 엔진의 `host` 를 `<dataset> --port <port> --store <storeDir> --beat <beat> --sparse <sparse> --party <party>` 와 환경 `HOST_AUTH_KEY` 로 띄운다. agent(shard, npc, token) 은 엔진의 `agent` 를 띄운다. 셋 다 Process.
- 생애: 없음.
- 엔진의 인자는 `protocol/engine.ts` 가 든다. 거기 없는 인자를 쓰지 않는다.

### Process
- 데이터: pid · lines(stdout · stderr 의 줄을 받는 자리) · exit:int|null.
- 기능: write(글) · kill(신호) · onLine · onExit.
- 생애: Spawner 가 만든다. exit 뒤 사라진다.

### Probe
- 데이터: 없음. 정적.
- 기능: read(line) → `{kind:'listening'}` | `{kind:'ready'}` | `{kind:'status', status:StatusLine, accounts:list<string>, lag:int}` | `{kind:'crossed', character, zone}`(건넘 글) | `{kind:'halt'}` | `{kind:'other'}`. answers(명령, line) 은 그 줄이 그 Console 명령의 답인가.
- 생애: 없음.

### Clock
- 데이터: interval:int(불변, ms) · timer.
- 기능: run(tick) 은 간격마다 tick — 앞의 tick 이 끝나기 전에는 다음을 부르지 않는다. stop.
- 생애: Fleet · Warden 과 함께.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Berth join | 노드 → 제어 | 노드의 이름 · 주소 · slots · 지금 도는 인스턴스들 | 없음 |
| Berth report | 노드 → 제어 | 인스턴스마다 state · players · lag · 접속한 캐릭터들 | 없음 |
| Berth crossed | 노드 → 제어 | 인스턴스 · Character.id · 존 이름 | 없음 |
| Berth exited | 노드 → 제어 | 인스턴스 · 종료 코드 | 없음 |
| Berth launch | 제어 → 노드 | 인스턴스 이름 · spec | port 또는 까닭 |
| Berth stop | 제어 → 노드 | 인스턴스 | 없음 |
| Berth command | 제어 → 노드 | 인스턴스 · Console 글 한 줄 | 답 글 한 줄 |
| Berth lend · reclaim | 제어 → 노드 | 인스턴스 · Character.id | 됨 또는 까닭 |
| Engine host · agent · bundle | 노드 · 앞문 → 엔진 | 인자 · 환경 | 머리글 또는 exit |
| Engine command | 노드 → 엔진 | Console 글 한 줄 | 답 글 한 줄 |
| Engine line | 엔진 → 노드 | stdout · stderr 한 줄 · exit | 없음 |
| Vault pull · push · copy · prune | 노드 → 저장 | 인스턴스 이름 · dataset · dir | dir · 사본 이름 |
| Vault copy · restore · list | 제어 → 저장 | 인스턴스 이름 · 사본 이름 | 사본 이름 · 목록 |
| Locker checkout · checkin | 노드 → 저장 | Character.id · 든 자(인스턴스) · 임대 · 파일 | 값과 임대 · 됨 |
| Locker expire | 제어 → 저장 | 든 자(인스턴스) | 없음 |
| Ledger get · put · remove | 함대 → 저장 | 표 `instances` 의 줄 하나 | 값 또는 null |

## 미정

- 없음.

# 노드 node — 책임

노드란, 서버 하나에서 인스턴스(호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나)의 프로세스를 띄우고 지키고 내리며, 캐릭터의 값을 그 호스트에 올리고 내리는 것이다. 어느 노드에 무엇을 띄울지는 플릿 모듈이 정한다([fleet.md](fleet.md)).

- 노드 서버마다 하나 산다(뷰어를 묶는 Spawner 는 API 서버도 쓴다). 컨트롤 플레인과는 NodeRpc 로만 만난다 — 받는 것(launch · stop · command · load · unload)은 이 모듈이 받고(NodeSocket), 알리는 것(register · report · handoff · exited)은 활성 컨트롤 플레인의 ControlSocket 으로.
- 누가 누구인가를 모른다. 캐릭터는 이름 글 하나다.
- 세계 안을 모른다. 호스트의 글은 머리글 · status · 떠남 줄 · backup 끝 줄만 읽는다. 캐릭터 파일의 안을 보지 않는다.
- 엔진에 닿는 길은 Spawner(프로세스)와 Console(글) 둘이다. 엔진의 면은 `protocol/engine.ts` 가 든다.
- 게임 명사를 모른다. 데이터셋 · NPC 묶음은 컨트롤 플레인이 띄울 때 준 값이다.
- 캐릭터의 값을 든 인스턴스의 이름(lease 의 holder)은 `<인스턴스>@<epoch>` — 플릿의 Recoverer 가 같은 이름으로 끊는다. 두 모듈의 약속이라 NodeRpc 의 선언(`protocol/node.ts`)에 있다.

| 개념 | 책임 하나 |
|---|---|
| Runner | 인스턴스 하나의 프로세스를 띄우고 내린다 |
| Spawner | 엔진 프로세스를 띄운다 |
| Process | 엔진 프로세스 하나의 줄과 끝을 듣는다 |
| Ports | 포트를 낸다 |
| Probe | 호스트의 글 한 줄을 읽는다 |
| Console | 호스트에 글 한 줄을 쓰고 답을 받는다 |
| Loader | 캐릭터의 값을 인스턴스에 올리고 내린다 |
| Backuper | 인스턴스의 Store 를 백업해 올린다 |
| NodeReporter | 이 노드가 든 것을 컨트롤 플레인에 알린다 |
| Clock | 간격마다 부른다(노드의 것) |

## 개념

### Runner
- 데이터: servers:map<인스턴스 이름, Server{host:Process, agent:Process, state, epoch, port, store(Store 자리), linked:list<Character.id>(접속한 캐릭터), lag:int, idle:int(사람도 로드도 없이 지난 Clock), silent:int(status 의 답이 잇달아 없은 수)}> · spool(이 서버의 디렉터리 — 프로세스의 pid 와 캐릭터 파일).
- 기능: start(spec) 은 흐름 3 의 B — Store 를 받고 포트를 받아 호스트를 띄우고 NPC 묶음을 묶고 에이전트를 띄운다. stop(instance) 은 호스트에 `stop` 을 쓰고 끝나기를 기다린다(한계를 넘기면 신호로). line(instance, 줄) · exited(instance, code) 는 흐름 4. status(instance, 답, loaded) 는 흐름 5 의 1 의 답을 적는다 — 답이 잇달아 셋 없으면 멈춘 것이라 호스트를 끝내고(⇒ 흐름 4 → 12), 사람도 로드된 캐릭터도 없으면 쉰 셈을 올린다. backed(instance, dir) 는 호스트가 `backup <dir>` 의 끝 줄을 찍기를 기다린다(Backuper.backup). reap 는 지난 실행이 남긴 프로세스를 끝낸다.
- 생애: Service.start 가 만든다.

### Spawner
- 데이터: engineDir(불변). 정적.
- 기능: missing(engineDir) 는 엔진 체크아웃이 없으면 그 까닭. bundle(engineDir, outfile) 는 뷰어를 묶는다. host(engineDir, args, key) 는 엔진의 `host` 를 `<dataset> --port <port> --store <storeDir> --beat <beat> --sparse <sparse> --party <party> --handoff <spool>` 과 환경 `HOST_AUTH_KEY` 로 띄운다. agent(instance, npc, token) 은 엔진의 `agent` 를 띄운다. 셋 다 Process.
- 생애: 없음.

### Process
- 데이터: pid · exit:int|null.
- 기능: write(글) · kill(신호) · onLine · onExit.
- 생애: Spawner 가 만든다. exit 뒤 사라진다.

### Ports
- 데이터: range:[from, to](불변) · used:set<int>.
- 기능: take() 는 쓰지 않고 지금 열 수 있는 포트 하나 또는 null. free(port).
- 생애: Service.start 가 만든다.

### Probe
- 데이터: 없음. 정적.
- 기능: read(line) → `ready`(머리글의 마지막 줄) | `status`(접속한 캐릭터들 · 틱 지연) | `handoff`(`떠남 — ` 줄: 캐릭터 · to) | `backed`(`backup 끝 — ` 줄) | `other`.
- 생애: 없음.

### Console
- 데이터: waiting(답을 기다리는 명령 줄).
- 기능: command(instance, 글) 은 그 호스트의 stdin 에 글 한 줄을 쓰고 그 답 한 줄을 돌려준다(한계 안에 없으면 실패).
- 생애: Service.start 가 만든다.

### Loader
- 데이터: leases(참조) · values(참조 — CharacterStore) · console(참조) · spool.
- 기능: load(instance, character, spot) 는 lease 를 받고 값을 캐릭터 파일에 내려 받아 호스트에 로드시킨다(파일이 없으면 엔진이 틀에서 낳는다). unload(instance, character) 는 호스트에 언로드시켜 캐릭터 파일을 받아 저장하고 lease 를 푼다. save(instance) 는 로드된 캐릭터 전부의 값을 한 번에 쓰게 해(`keep`) lease 를 늦추고 저장한다 — 지난 저장과 같은 값은 다시 쓰지 않는다. 저장 주기는 Clock 의 간격이고 `leaseMs` 보다 짧다. lease 를 잃은 캐릭터(늦추기 · 쓰기가 거절)는 호스트에서 언로드시키고 값은 버린다(흐름 5 의 「실패하면」). recover 는 spool 에 남은 캐릭터 파일을 저장하고 lease 를 푼다.
- 생애: Service.start 가 만든다.

### Backuper
- 데이터: snapshots(참조) · console(참조).
- 기능: backup(instance) 는 도는 호스트에 Console `backup <dir>` 을 시켜 그 사본을 올리고 백업 하나를 남긴다. upload(instance) 는 내려간 인스턴스의 Store 자리를 올리고 백업 하나를 남긴다.
- 생애: Service.start 가 만든다.

### NodeReporter
- 데이터: name(불변) · runner(참조) · closing:bool.
- 기능: register 는 이름 · 주소 · 빌드 · slots 를 컨트롤 플레인에 알린다. report 는 closing 과 인스턴스마다 state · 사람 수 · 틱 지연 · 로드된 캐릭터들을 알린다.
- 생애: Service.start 가 만든다.

### Clock
- 데이터: interval:int(불변, ms).
- 기능: run(tick) 은 간격마다 tick — 앞의 것이 끝나기 전에는 다음을 부르지 않는다. stop.
- 생애: Service.start 가 만든다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| NodeRpc launch | 컨트롤 플레인 → 노드 | 인스턴스 이름 · epoch · spec | port 또는 까닭 |
| NodeRpc stop | 컨트롤 플레인 → 노드 | 인스턴스 | 없음 |
| NodeRpc command | 컨트롤 플레인 → 노드 | 인스턴스 · Console 글 한 줄 | 답 글 한 줄 |
| NodeRpc load · unload | 컨트롤 플레인 → 노드 | 인스턴스 · Character.id(· spot) | 됨 또는 까닭 |
| NodeRpc register · report · handoff · exited | 노드 → 컨트롤 플레인 | [fleet.md](fleet.md) 의 소켓 | |
| Engine host · agent · bundle | 노드 · API 서버 → 엔진 | 인자 · 환경 | 머리글 또는 exit |
| Engine command · line | 노드 ↔ 엔진 | Console 글 한 줄 · stdout 한 줄 · exit | 답 글 한 줄 |

## 미정

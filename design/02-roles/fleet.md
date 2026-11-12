# 플릿 fleet — 책임

플릿이란, 인스턴스(호스트 프로세스 하나 + NPC 에이전트 프로세스 하나 + Store 자리 하나)를 노드에 띄우고 지키고 내리며, 캐릭터의 값을 인스턴스에 올리고 내리는 것이다.

- 반은 컨트롤 플레인에(어느 노드에 무엇이 있는가), 반은 노드에(이 서버의 프로세스) 있다. 둘은 NodeRpc 로 만난다.
- 누가 누구인가를 모른다. 캐릭터는 이름 글 하나다. 어디에 배정할지는 세션 모듈이 정한다.
- 세계 안을 모른다. 호스트의 글은 머리글 · status · 떠남 줄 · backup 끝 줄만 읽는다. 캐릭터 파일의 안을 보지 않는다.
- 엔진에 닿는 길은 Spawner(프로세스)와 Console(글) 둘이다. 엔진의 면은 `protocol/engine.ts` 가 든다.
- 게임 명사를 모른다. 존의 데이터셋 · NPC 묶음은 설정 값이다.

| 어디 | 개념 | 책임 하나 |
|---|---|---|
| 컨트롤 플레인 | Registry | 인스턴스의 표를 든다 |
| 컨트롤 플레인 | Nodes | 노드의 표와 살아 있음을 든다 |
| 컨트롤 플레인 | Scheduler | 새 인스턴스를 띄울 노드를 고른다 |
| 컨트롤 플레인 | Scaler | 존마다 예비 용량을 맞춘다 |
| 컨트롤 플레인 | Recoverer | 죽은 인스턴스의 뒤를 수습한다 |
| 노드 | Runner | 인스턴스 하나의 프로세스를 띄우고 내린다 |
| 노드 | Spawner | 엔진 프로세스를 띄운다 |
| 노드 | Process | 엔진 프로세스 하나의 줄과 끝을 듣는다 |
| 노드 | Ports | 포트를 낸다 |
| 노드 | Probe | 호스트의 글 한 줄을 읽는다 |
| 노드 | Console | 호스트에 글 한 줄을 쓰고 답을 받는다 |
| 노드 | Loader | 캐릭터의 값을 인스턴스에 올리고 내린다 |
| 노드 | Backuper | 인스턴스의 Store 를 백업해 올린다 |
| 노드 | NodeReporter | 이 노드가 든 것을 컨트롤 플레인에 알린다 |
| 어디든 | Clock | 간격마다 부른다 |

## 개념

### Registry
- 데이터: db(참조 — 표 `instances`: 이름 → Instance).
- 기능: all 은 줄 전부. put(instance) 는 줄을 적는다. remove(instance) 는 내려간 인스턴스의 줄을 지운다. ready(zone) 은 그 존의 `ready` 이고 비우는 가운데가 아닌 인스턴스들. drain(instance, on) 은 비우는 가운데 표시를 켜고 끈다(새 세션을 받지 않는다).
- 생애: Service.start 가 만든다.

### Instance
- 데이터: name(`<존>-<번호>`) · zone · node · port · epoch:int(띄울 때마다 하나 오른다) · build · state:`starting`|`ready`|`stopping`|`stopped`|`failed` · draining:bool · restarts:int.
- 기능: 없음. 인스턴스 하나 = 호스트 하나 = Store 자리 하나.

### Nodes
- 데이터: rows:map<이름, Node> · db(참조 — 표 `nodes`: 이름 → cordoned).
- 기능: register(node) 는 노드를 적는다. heartbeat(node, 보고) 는 보고가 온 때와 그 인스턴스들의 state · 사람 수 · 틱 지연을 적는다. dead() 는 보고가 한계(`reportLimitMs`)를 넘겨 끊긴 노드들. cordon(node) · uncordon(node) 는 그 노드에 새로 띄우지 않게 하고 푼다. list.
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

### Runner
- 데이터: servers:map<인스턴스 이름, {host:Process, agent:Process, state, loaded:set<Character.id>, linked:set<Character.id>, lag:int}> · spool(이 서버의 디렉터리 — 프로세스의 pid 와 캐릭터 파일).
- 기능: start(spec) 은 흐름 3 의 B — Store 를 받고 포트를 받아 호스트를 띄우고 NPC 묶음을 묶고 에이전트를 띄운다. stop(instance) 은 호스트에 `stop` 을 쓰고 끝나기를 기다린다(한계를 넘기면 신호로). line(instance, 줄) · exited(instance, code) 는 흐름 4. reap 는 지난 실행이 남긴 프로세스를 끝낸다.
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
- 기능: load(instance, character, spot) 는 lease 를 받고 값을 캐릭터 파일에 내려 받아 호스트에 로드시킨다(파일이 없으면 엔진이 틀에서 낳는다). unload(instance, character) 는 호스트에 언로드시켜 캐릭터 파일을 받아 저장하고 lease 를 푼다. save(instance) 는 로드된 캐릭터 전부의 값을 한 번에 쓰게 해 저장한다(lease 는 그대로). recover 는 spool 에 남은 캐릭터 파일을 저장하고 lease 를 푼다.
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
| NodeRpc register · report | 노드 → 컨트롤 플레인 | NodeReporter 의 것 | 없음 |
| NodeRpc handoff | 노드 → 컨트롤 플레인 | 인스턴스 · Character.id · to | 없음 |
| NodeRpc exited | 노드 → 컨트롤 플레인 | 인스턴스 · epoch · 종료 코드 | 없음 |
| NodeRpc launch | 컨트롤 플레인 → 노드 | 인스턴스 이름 · epoch · spec | port 또는 까닭 |
| NodeRpc stop | 컨트롤 플레인 → 노드 | 인스턴스 | 없음 |
| NodeRpc command | 컨트롤 플레인 → 노드 | 인스턴스 · Console 글 한 줄 | 답 글 한 줄 |
| NodeRpc load · unload | 컨트롤 플레인 → 노드 | 인스턴스 · Character.id(· spot) | 됨 또는 까닭 |
| Engine host · agent · bundle | 노드 · API 서버 → 엔진 | 인자 · 환경 | 머리글 또는 exit |
| Engine command · line | 노드 ↔ 엔진 | Console 글 한 줄 · stdout 한 줄 · exit | 답 글 한 줄 |

## 미정

- 없음.

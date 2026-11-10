# 함대 fleet — 책임

함대란, 계정마다 샤드 하나를 두고 그 호스트 프로세스와 에이전트 프로세스를 띄우고 지키고 내리는 것이다.

- 세계 안을 모른다. 호스트의 글은 머리글과 status 의 머리 · 접속 칸만 읽는다.
- 와이어 글 넷(Link)을 보지 않는다. 클라이언트는 호스트에 바로 붙는다.
- 엔진에 닿는 길은 Spawner 하나다. 들고 가는 것은 `protocol/engine.ts` 의 인자와 Console 글뿐이다.
- 게임 명사를 모른다. 데이터셋 경로 · NPC 묶음(계정 이름과 body 이름들)은 설정 값이다.
- 저장장치에는 Vault · Ledger 소켓(`protocol/vault.ts`)으로만 닿는다. 토큰은 앱이 준 함수(issue)로만 낸다.

```text
Fleet ← Service
├ Assignment ── Ledger
├ Ports
├ Spawner (정적)
├ Probe (정적)
├ Clock
├ Operator
└ Shard × 계정
  ├ Process(host)
  └ Process(agent)
```

## 개념

### Fleet
- 데이터: shards:map<Account.id, Shard> · assignment · ports · spawner · clock · operator · vault(참조) · issue(Account.id → Token, 앱이 준다) · config:{engineDir, dataset, viewerOut, pageUrl, beat, sparse, npc:{account, bodies}, ports, publicHost, secure, clockMs, idleLimit, startLimitMs, stopLimitMs, commandLimitMs, restartLimit, backupEvery} · ticks:int.
- 기능: start 는 흐름 1 의 6 — 뷰어를 한 번 묶고(Spawner.bundle) Clock.run. enter(account) 는 Assignment 에서 줄을 찾거나 내고 Shard 를 start 해 주소를 답한다(흐름 3). tick 은 흐름 5. stopAll 은 살아 있는 Shard 를 전부 stop(흐름 7). shardOf(account).
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Shard
- 데이터: account(불변) · row:{dataset, storeDir, port}(port 는 revoke-port 가 비운다) · state:`stopped`|`starting`|`ready`|`stopping`|`failed` · host:Process|null · agent:Process|null · lastStatus:StatusLine|null · players:int · idle:int · restarts:int · agentRestarts:int · dirty:bool · why:string|null · waiting(답을 기다리는 명령 줄).
- 기능: start 는 흐름 3 의 5 ~ 8. stop 은 흐름 5 의 3. command(글) 은 호스트의 stdin 에 글 한 줄을 쓰고 그 답 글 한 줄을 돌려준다(Probe 가 그 명령의 답으로 읽는 다음 줄. 한계 안에 없으면 null). line(which, 줄) 은 흐름 4 의 2. exited(which, code) 는 흐름 4 의 3 · 4. address(token) 은 `{page: <pageUrl>?token=…&ws=…, ws}`.
- 생애: Fleet 이 배정 표의 줄마다 또는 enter 가 만든다. 배정 표의 줄이 지워질 때 사라진다.
- 샤드 하나 = 호스트 하나 = 세계 하나 = Store 자리 하나 = 플레이어 파티 하나.

### Assignment
- 데이터: rows:map<Account.id, {dataset, storeDir, port}> · ledger(참조).
- 기능: get(account) · put(account, row) 는 Ledger.save(`assignment`) · remove(account) · all.
- 생애: Fleet 과 함께. 값은 저장장치에.

### Ports
- 데이터: range:[from, to](불변) · used:set<int>.
- 기능: take() 는 쓰지 않고 지금 열 수 있는(잠깐 열어 보고 닫는다) 포트 하나 또는 null — 다른 프로그램이 쓰는 포트를 주면 엔진이 exit 2 로 끝나기 때문이다. mark(port) 는 배정 표의 것을 쓰는 것으로(범위 밖이면 false). free(port).
- 생애: Fleet 과 함께.

### Spawner
- 데이터: engineDir(불변). 정적.
- 기능: missing(engineDir) 는 엔진 체크아웃이 없으면 그 까닭 — Fleet 이 세울 때 묻고 없으면 시작 거부. bundle(engineDir, outfile) 는 엔진 체크아웃의 esbuild(`node_modules/.bin/esbuild`)로 엔진의 bundle.ts 와 같은 옵션을 돌려 뷰어를 outfile 에 묶는다 — 엔진 체크아웃의 out/ 를 쓰지 않는다. host(engineDir, args, key) 는 `<engineDir>/web` 에서 엔진의 `host`(`npm run host` 와 같은 진입점 — `node_modules/.bin/tsx apps/server/main.ts`, npm 을 사이에 두지 않아 신호 · stdin 이 바로 닿는다)를 `<dataset> --port <port> --store <storeDir> --beat <beat> --sparse <sparse>` 와 환경 `HOST_AUTH_KEY` 로 띄운다. agent(shard, npc, token) 은 엔진의 `agent` 를 `--url ws://localhost:<port> --account <npc.account> --token <token> --brain fsm` 으로. 셋 다 Process.
- 생애: 없음.
- 엔진의 인자는 `protocol/engine.ts` 가 든다. 거기 없는 인자를 쓰지 않는다.

### Process
- 데이터: pid · lines(stdout · stderr 의 줄을 받는 자리) · exit:int|null.
- 기능: write(글) · kill(신호) · onLine · onExit.
- 생애: Spawner 가 만든다. exit 뒤 사라진다.

### Probe
- 데이터: 없음. 정적.
- 기능: read(line) → `{kind:'listening'}`(`host ` 머리글) | `{kind:'ready'}`(머리글의 마지막 줄 `명령: ` — 머리글의 status 뒤) | `{kind:'status', status:StatusLine, accounts:list<string>}` | `{kind:'halt'}` | `{kind:'other'}`. answers(명령, line) 은 그 줄이 그 Console 명령의 답인가.
- 생애: 없음.

### Clock
- 데이터: interval:int(불변, ms) · timer.
- 기능: run(tick) 은 간격마다 tick(흐름 5) — 앞의 tick 이 끝나기 전에는 다음을 부르지 않는다. stop.
- 생애: Fleet 과 함께.

### Operator
- 데이터: fleet(참조).
- 기능: command(글 한 줄) → 답 글 한 줄. 명령 여덟(흐름 6 의 1)과 `help`.
- 생애: Fleet 이 만든다.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Engine bundle | 함대 → 엔진 | esbuild 의 인자 · outfile | exit 0 또는 그 밖(묶지 못함) |
| Engine host | 함대 → 엔진 | host 의 인자 · 환경 | stdout 머리글 `host …` 또는 exit 2 |
| Engine agent | 함대 → 엔진 | agent 의 인자 | 없음(끊기면 exit 0) |
| Engine command | 함대 → 엔진 | Console 글 한 줄 | 답 글 한 줄 |
| Engine line | 엔진 → 함대 | stdout · stderr 한 줄 · exit | 없음 |
| Vault dirOf · copy · restore · list | 함대 → 저장장치 | account · dataset · dir · 사본 이름 | dir · 사본 이름 · 목록 |
| Ledger load · save | 함대 → 저장장치 | slot `assignment`(· value) | value 또는 null |
| Operator | 운영자 → 함대 | 글 한 줄 | 글 한 줄 |

## 미정

- (미정) 여럿이 한 세계에서 서로 보려면 데이터셋에 플레이어 묶음이 둘 이상 서야 한다(엔진의 컨텐츠 작업). 그때 Shard 가 계정 K 개를 들고 Assignment 가 샤드 id 를 든다. 지금은 K = 1 — 피드백 2.

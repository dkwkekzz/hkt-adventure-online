# 흐름 3. 입장 — 클라이언트의 토큰

트리거: Api 의 `enter`. 토큰 하나.
한 줄: 토큰을 Account.id 로 풀고, 그 계정의 샤드를 찾거나 세워 띄우고, 접속 주소를 준다. 클라이언트는 그 주소로 엔진의 흐름 2(접속)를 간다.

## 순서

```text
Api enter                                               [앱]
  Signer.verify                                         [계정]
  Fleet.enter                                           [함대]
    Assignment.get — 없으면
      Vault.dirOf                                       [저장장치]
      Ports.take
      Assignment.put ── Ledger.save                     [저장장치]
    Shard.start — stopped 또는 failed 이면
      Spawner.host                                      [엔진]
      Probe.read — 머리글                                ⇐ 흐름 4
      Spawner.agent                                     [엔진]
  답 — 주소                                              ◇
클라이언트 → 엔진 Host 2(토큰)                           ⇒ 엔진의 흐름 2
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Signer.verify(token) | 서명과 만료. 틀리면 거절 ✕ | Account.id |
| 2 | Fleet.enter → Assignment.get | 계정의 줄 `{dataset, storeDir, port}` | 줄 또는 없음 |
| 3 | Fleet → Vault.dirOf · Ports.take · Assignment.put | 없으면 자리를 내고 포트를 받아 줄을 적고 Ledger.save. 포트가 없으면 거절 ✕ | 줄 |
| 4 | Fleet → Shard.start | `ready` 면 건너뛴다. `starting` 이면 그 시작을 기다린다. `stopped` · `failed` 면 아래. 셈(restarts)이 한계를 넘은 `failed` 는 거절 ✕ — 운영자가 본다 | |
| 5 | Shard → Spawner.host | 엔진의 `dev` 를 데이터셋 · 포트 · Store 자리 · 박자 · sparse · keymap · NPC 묶음의 `--grant <npc 계정>=<body…>` 로, 환경 `HOST_AUTH_KEY` 와 함께 | Process · `starting` |
| 6 | Shard ← Probe.read | stdout 에 `host ` 머리글(소켓이 듣는다) 뒤 dev 의 마지막 줄 `뷰어: …` 가 오면 준비가 끝났다. `--grant` 는 그 둘 사이에 같은 박자로 명부에 들어 어떤 접속보다 먼저다. 이 줄 앞의 글(머리글의 status · grant 의 답)은 명령의 답으로 읽지 않는다. 한계(`startLimitMs`) 안에 오지 않거나 그 전에 끝나면 `failed` ✕ | |
| 7 | Shard → Spawner.agent | 엔진의 `agent` 를 `--url ws://localhost:<port> --account <npc 계정> --token <그 계정의 토큰> --brain fsm` 으로 | Process · `ready` |
| 8 | Api | 주소 `{ page: http(s)://<publicHost>:<port>/?token=<토큰>, ws: ws(s)://<publicHost>:<port> }` | 클라이언트 ◇ |

## 멈추는 자리

- 샤드가 `ready`. 배정 표가 저장장치에. 클라이언트가 주소를 든다.

## 이어지는 흐름

- 엔진의 흐름 2(접속) · 4 호스트의 글 · 5 박자.

## 규칙

- NPC 묶음의 grant 가 플레이어 접속보다 먼저다(`ONLINE.md` §1.3 의 함정). 그래서 grant 는 stdin 의 글이 아니라 `--grant` 인자로 든다 — 머리글과 같은 박자에 끝난다.
- 같은 계정의 입장이 겹치면 한 번만 띄운다.
- 함대는 한 번에 샤드 하나만 띄운다(Fleet 의 시작 줄). `dev` 가 뜰 때 엔진 체크아웃의 같은 파일(뷰어 묶음)을 쓰기 때문이다.
- 토큰은 엔진의 Gate 가 풀고 서비스는 Account.id 만 본다. 샤드 하나에 Store 자리 하나.

## 미정

- 없음.

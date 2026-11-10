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
      Shard.command grant × NPC 묶음                    [엔진]
      Spawner.agent                                     [엔진]
  답 — 주소                                              ◇
클라이언트 → Static 의 /play → 엔진 Host 2(토큰)        ⇒ 엔진의 흐름 2
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Signer.verify(token) | 서명과 만료. 틀리면 거절 ✕ | Account.id |
| 2 | Fleet.enter → Assignment.get | 계정의 줄 `{dataset, storeDir, port}` | 줄 또는 없음 |
| 3 | Fleet → Vault.dirOf · Ports.take · Assignment.put | 없으면 자리를 내고 포트를 받아 줄을 적고 Ledger.save. 포트가 없으면 거절 ✕ | 줄 |
| 4 | Fleet → Shard.start | `ready` 면 건너뛴다. `starting` 이면 그 시작을 기다린다. `stopped` · `failed` 면 아래. 셈(restarts)이 한계를 넘은 `failed` 는 거절 ✕ — 운영자가 본다 | |
| 5 | Shard → Spawner.host | 엔진의 `host`(세계만 — 소켓 하나, http 없음)를 데이터셋 · 포트 · Store 자리 · 박자 · sparse 로, 환경 `HOST_AUTH_KEY` 와 함께 | Process · `starting` |
| 6 | Shard ← Probe.read | stdout 에 `host ` 머리글(소켓이 듣는다) 뒤 머리글의 마지막 줄 `명령: …` 이 오면 준비가 끝났다. 이 줄 앞의 글(머리글의 status)은 명령의 답으로 읽지 않는다. 한계(`startLimitMs`) 안에 오지 않거나 그 전에 끝나면 `failed` ✕ | |
| 7 | Shard.command | NPC 묶음마다 `grant <npc 계정> <body 이름>` 을 stdin 에. 답이 `grant — ` 로 시작하지 않으면 호스트를 내리고 `failed`(같은 설정으로 다시 띄워도 같다) ✕ | 명부 |
| 8 | Shard → Spawner.agent | 엔진의 `agent` 를 `--url ws://localhost:<port> --account <npc 계정> --token <그 계정의 토큰> --brain fsm` 으로 | Process · `ready` |
| 9 | Api | 주소 `{ page: <pageUrl>?token=<토큰>&ws=<ws>, ws: ws(s)://<publicHost>:<port> }`. page 는 서비스의 Static 이 주는 뷰어 페이지 — 뷰어는 `?ws=` 의 샤드에 `?token=` 으로 붙는다 | 클라이언트 ◇ |

## 멈추는 자리

- 샤드가 `ready`. 배정 표가 저장장치에. 클라이언트가 주소를 든다.

## 이어지는 흐름

- 엔진의 흐름 2(접속) · 4 호스트의 글 · 5 박자.

## 규칙

- NPC 묶음의 grant 가 플레이어 접속보다 먼저다(`ONLINE.md` §1.3 의 함정). 주소는 grant 가 다 끝난 뒤에야 답하므로 어떤 사람도 그 전에 샤드를 모른다.
- 같은 계정의 입장이 겹치면 한 번만 띄운다. 다른 계정의 샤드는 한꺼번에 띄운다 — 샤드는 엔진 체크아웃의 파일을 쓰지 않는다(뷰어는 흐름 1 이 서비스의 자리에 한 번 묶었다).
- 토큰은 엔진의 Gate 가 풀고 서비스는 Account.id 만 본다. 샤드 하나에 Store 자리 하나.

## 미정

- 없음.

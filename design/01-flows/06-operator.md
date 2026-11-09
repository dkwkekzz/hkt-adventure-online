# 흐름 6. 운영자 명령 — 글 한 줄

트리거: 운영자의 글 한 줄. 서비스 프로세스의 stdin.
한 줄: 샤드를 보고 내리고 다시 띄우고 되돌리거나, 호스트의 Console 에 글을 넘긴다.

## 순서

```text
Operator.command                                        [함대]
  Fleet 의 표 · Shard.start · Shard.stop                 [엔진]
  Shard.command                                         [엔진]  grant · revoke · pause · resume · save · status
  Vault.copy · Vault.restore · Vault.list                [저장장치]
  답 글 한 줄                                            ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Operator.command | `shards` · `status <account>` · `start <account>` · `stop <account>` · `host <account> <Console 글>` · `backup <account>` · `restore <account> <사본>` · `revoke-port <account>`. 모르는 글이면 쓰는 법 | |
| 2 | `shards` | 배정 표의 줄마다 계정 · state · port · lastStatus 의 머리 · why | 글 |
| 3 | `status <account>` | 그 샤드의 state 와 lastStatus 전부. 사본 목록(Vault.list) | 글 |
| 4 | `host <account> <글>` | Shard.command 로 그대로. 답 글을 돌려준다. `stop` 은 넘기지 않고 `stop <account>` 로 | 글 |
| 5 | `backup` · `restore` | 샤드가 `stopped` 또는 `failed` 일 때만. restore 는 자리를 사본으로 바꾸고(기존은 사본 하나로 남긴다) restarts 셈을 0 으로 | 사본 이름 |
| 6 | `revoke-port` | 샤드가 내려가 있을 때만. 포트를 비우고 다음 입장이 새 포트를 받는다 | |
| 7 | `start` | Shard.start 와 같다. `failed` 의 셈을 0 으로 한 뒤 | |
| 8 | Operator | 답을 글 한 줄로 | 운영자 ◇ |

## 멈추는 자리

- 샤드의 state. 저장장치. 운영자의 화면.

## 이어지는 흐름

- 3 · 4 · 5.

## 규칙

- 운영자가 세계의 사실을 보는 자리는 호스트의 status 글 하나다. 명부는 `host <account> grant …` 로만 고친다.

## 미정

- 없음.

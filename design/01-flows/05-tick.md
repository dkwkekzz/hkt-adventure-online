# 흐름 5. 박자 — Clock 의 간격

트리거: Clock. 간격(`clockMs`)마다.
한 줄: 살아 있는 샤드마다 status 를 묻고, 사람의 접속 없이 쉼 한계를 넘긴 샤드를 내리고, 베낌 때가 되면 내려간 샤드의 자리를 베낀다.

## 순서

```text
Clock.tick                                              [함대]
  Shard.command status × ready                          [엔진]  ⇐ 흐름 4
  Shard.stop × 쉼 한계                                  [엔진]
  Vault.copy × 베낌 때                                   [저장장치]
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Clock.tick → Shard.command(`status`) | ready 인 샤드마다. 답은 흐름 4 가 읽는다 | lastStatus |
| 2 | Shard | 접속한 계정 가운데 NPC 계정이 아닌 것이 없으면 idle 셈 하나, 있으면 0. 셈이 한계(`idleLimit`)를 넘으면 Shard.stop | `stopping` |
| 3 | Shard.stop | stdin 에 `stop`. 호스트가 저장하고 1001 로 접속을 닫고 끝난다(흐름 4 가 `stopped` 로). 한계(`stopLimitMs`) 안에 끝나지 않으면 신호로 끝낸다. 에이전트도 끝낸다 | `stopped` |
| 4 | Clock → Vault.copy | 베낌 주기(`backupEvery` 박자)마다, `stopped` 이고 지난 베낌 뒤에 돈 적이 있는(dirty) 샤드의 자리를 베낀다 | 사본 |

## 멈추는 자리

- 내려간 샤드. 사본.

## 이어지는 흐름

- 3 입장 · 4 호스트의 글.

## 규칙

- 세계의 now 는 내려간 동안 흐르지 않는다. 그것이 엔진의 성질이고 서비스가 바꾸지 않는다.
- 도는(`ready`) 자리는 베끼지 않는다. 엔진의 Store 는 파일을 제자리에 쓰므로(잠금 · 원자적 바꿈 없음) 도는 동안의 사본은 반쯤 쓴 파일을 들 수 있다.
- NPC 에이전트는 늘 붙어 있다. 쉼은 사람의 접속으로만 센다.

## 미정

- 없음.

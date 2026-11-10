# 흐름 7. 종료 — 프로세스의 종료 신호

트리거: 프로세스. SIGINT · SIGTERM.
한 줄: 샤드를 전부 내리고(각 호스트가 저장한다) Api 를 닫고 끝난다.

## 순서

```text
Service.stop                                            [앱]
  Clock.stop                                            [함대]
  Fleet.stopAll ── Shard.stop × 살아 있는 것              [엔진]
  Api 닫기
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Service.stop → Clock.stop | 박자를 멈춘다 | |
| 2 | Fleet.stopAll | ready · starting 인 샤드마다 Shard.stop. 전부 `stopped` 또는 한계까지 | |
| 3 | Service | 표 둘은 바뀔 때마다(Directory.resolve · Assignment.put) 이미 저장장치에 있다. 따로 쓰지 않는다 | 저장장치 ◇ |
| 4 | Service | Api 를 닫고 exit 0 | |

## 멈추는 자리

- 저장장치. 다음 시작(흐름 1)이 되찾는다.

## 규칙

- 두 번 불려도 한 번.

## 미정

- 없음.

# 흐름 1. 시작 — 프로세스가 서비스를 띄운다

트리거: 프로세스. 설정(`service.config.json` — 엔진 자리 · 데이터셋 · NPC 묶음 · 포트 범위 · 저장장치 뿌리 · 쉼 한계 · 베낌 주기)과 환경변수 `HOST_AUTH_KEY`(서명 키)를 들고 온다.
한 줄: 저장장치에서 서비스의 표 둘(사용자 표 · 배정 표)을 되찾고, 함대와 시계를 세우고, Api · Operator 를 연다. 샤드는 입장이 올 때 띄운다.

## 순서

```text
Service.start                                           [앱]
  openVault · Ledger.load                               [저장장치]
  Directory 생성 · Signer 생성                           [계정]
  Fleet 생성 ── Spawner.missing · Assignment · Ports · Clock · Operator   [함대]
  Clock.run                                             ⇒ 흐름 5
  Api 열기 · stdin 을 Operator 에                        ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Service.start → openVault | 저장장치의 뿌리를 연다. 없으면 만든다 | Vault · Ledger |
| 2 | Service → Ledger.load | `directory` · `assignment` 자리의 값. 없으면 빈 것 | 표 둘 |
| 3 | Service → Directory · Signer | 사용자 표와 서명 키. 키가 없으면 시작 거부 ✕ (토큰 없는 서비스는 외부에 열지 않는다) | |
| 4 | Service → Fleet | Spawner.missing — 엔진 체크아웃이 없으면 시작 거부 ✕. 배정 표의 줄마다 Shard 를 `stopped` 로 만든다. 프로세스는 띄우지 않는다. NPC 의 토큰은 Signer.issue 를 값(함수)으로 받는다 | Shard × 줄 |
| 5 | Fleet → Ports.mark | 배정 표가 든 포트를 쓰는 것으로 센다 | |
| 6 | Service → Clock.run | 간격마다 흐름 5 | |
| 7 | Service | Api(http) 를 열고 stdin 을 Operator.command 에 댄다 | 운영자 · 클라이언트 ◇ |

## 멈추는 자리

- 샤드 전부 `stopped`. 표 둘이 메모리에. Api 가 듣는다.

## 이어지는 흐름

- 2 로그인 · 3 입장 · 5 박자 · 6 운영자 · 7 종료.

## 규칙

- 엔진 프로세스는 입장이 세운다. 시작은 아무것도 띄우지 않는다.
- 배정 표에 있는데 포트가 범위 밖이면 그 줄의 포트를 비운다(다음 입장이 새로 받는다).

## 미정

- 없음.

# 흐름 4. 호스트의 글 — 엔진 프로세스의 stdout 한 줄 또는 종료

트리거: 프로세스(밖). 호스트의 stdout 줄, stderr 줄, 종료 코드. 에이전트 프로세스의 종료도 같다.
한 줄: 글을 읽어 샤드의 상태를 바꾸고 기록에 남긴다. 세계에는 아무것도 가지 않는다.

## 순서

```text
Process 의 줄                                           [엔진]
  Probe.read                                            [함대]
  Shard.line ── state · lastStatus · 답을 기다리는 명령
  Log                                                   ◇
Process 의 종료
  Shard.exited
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Probe.read(line) | `host ` 머리글이면 listening, dev 의 `뷰어: ` 줄이면 ready. `beats ` 로 시작하면 StatusLine(`readStatus` 와 같은 머리)과 접속한 계정들(`· 접속 ` 뒤 ` · 명부 ` 앞, `-` 면 없다). `멈춤 — ` 이면 halt. 그 밖은 other | Probe 의 답 |
| 2 | Shard.line | ready 면 시작을 잇는다(흐름 3 의 6). status 면 lastStatus. 답을 기다리는 명령이 있고 줄이 그 명령의 답이면 그 명령에 준다 | |
| 3 | Shard.exited(which, code) | 호스트가 0 이면 `stopped`. 2 면 `failed`(데이터셋 거부 · 포트 — 같은 인자로 다시 띄워도 같다). 그 밖이면 `failed` 와 셈(restarts) 하나. 에이전트 프로세스를 함께 끝낸다 | state |
| 4 | Shard.exited | 에이전트만 끝났고 호스트가 `ready` 면 에이전트를 다시 띄운다. 셈이 한계를 넘으면 샤드를 내리고 `failed` 로 | |
| 5 | Log | 줄마다 `<Account.id> <host\|agent> <줄>`. 에이전트의 stdout 은 첫 줄만(두뇌가 창마다 찍는다) | 운영자 ◇ |

## 멈추는 자리

- 샤드의 state · lastStatus. 기록.

## 이어지는 흐름

- 3 입장(`stopped` · `failed` 는 다음 입장이 다시 띄운다) · 5 박자.

## 규칙

- 샤드의 Store 자리와 포트는 종료로 비우지 않는다. 그 계정의 것이다.
- `failed` 의 까닭(why)은 운영자가 본다(흐름 6).

## 미정

- 없음.

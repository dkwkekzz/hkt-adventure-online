# 흐름 4. 호스트의 글 — 엔진 프로세스의 stdout 한 줄 또는 종료

트리거: 프로세스(밖). 노드가 띄운 호스트의 stdout 줄, stderr 줄, 종료 코드. 에이전트 프로세스의 종료도 같다.
한 줄: 글을 읽어 Shard 의 상태를 바꾸고 기록에 남긴다. 건넘 글과 종료는 제어에 알린다.

## 순서

```text
Process 의 줄                                           [엔진]
  Probe.read                                            [함대 — 노드]
  Shard.line ── state · lastStatus · lag · 답을 기다리는 명령
    건넘 글 ─► Berth crossed                             ⇒ 흐름 10
  Log                                                   ◇
Process 의 종료
  Shard.exited ─► Berth exited                          ⇒ 흐름 12
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Probe.read(line) | `host ` 머리글이면 listening, 머리글의 마지막 줄이면 ready. `beats ` 로 시작하면 StatusLine 과 접속한 캐릭터들 · 박자 지연. 건넘 글이면 crossed(캐릭터 · 존 이름). `멈춤 — ` 이면 halt. 그 밖은 other | Probe 의 답 |
| 2 | Shard.line | ready 면 띄움을 잇는다(흐름 3 의 6). status 면 lastStatus · linked · lag. 답을 기다리는 명령이 있고 줄이 그 답이면 그 명령에 준다 | |
| 3 | Shard.line → Berth crossed | crossed 면 제어에 인스턴스 · 캐릭터 · 존 이름을 알린다 | ⇒ 흐름 10 |
| 4 | Shard.exited(which, code) | 호스트가 끝나면 에이전트를 함께 끝내고 제어에 Berth exited(인스턴스 · 코드)를 알린다. 내리는 가운데(`stopping`)였으면 `stopped`, 아니면 `failed` | ⇒ 흐름 12 |
| 5 | Shard.exited | 에이전트만 끝났고 호스트가 `ready` 면 에이전트를 다시 띄운다. 셈이 한계를 넘으면 Shard 를 내리고 `failed` 로 | |
| 6 | Log | 줄마다 `<인스턴스> <host\|agent> <줄>`. 에이전트의 stdout 은 첫 줄만 | 운영자 ◇ |

## 멈추는 자리

- Shard 의 state · lastStatus · lag. 기록.

## 이어지는 흐름

- 5 박자 · 10 존 건넘 · 12 잃음.

## 규칙

- 호스트의 글은 그 노드가 읽는다. 제어에는 박자의 보고(흐름 5)와 건넘 · 종료의 알림만 간다.
- 인스턴스의 Store 자리는 종료로 비우지 않는다.

## 미정

- 없음.

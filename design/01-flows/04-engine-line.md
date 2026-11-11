# 흐름 4. 호스트의 글 — 엔진 프로세스의 stdout 한 줄 또는 종료

트리거: 프로세스(밖 — Process.onLine · Process.onExit 가 받는다). 노드가 띄운 호스트의 stdout 줄, stderr 줄, 종료 코드. 에이전트 프로세스의 종료도 같다.
한 줄: 글을 읽어 GameServer 의 상태를 바꾸고 기록에 남긴다. 이동 요청 줄과 종료는 컨트롤 플레인에 알린다.

## 순서

```text
Process 의 줄                                           [엔진]
  Probe.read                                            [플릿 — 노드]
  GameServer.line ── state · lastStatus · lag · 답을 기다리는 명령
    이동 요청 줄 ─► NodeRpc handoff                       ⇒ 흐름 10
  Log                                                   ◇
Process 의 종료
  GameServer.exited ── Ports.free
    NodeRpc exited                                      ⇒ 흐름 12
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Probe.read(line) | `host ` 머리글이면 listening, 머리글의 마지막 줄이면 ready. `beats ` 로 시작하면 StatusLine 과 접속한 캐릭터들 · 틱 지연(꼬리의 ` · 지연 N`). `떠남 — ` 이면 handoff(캐릭터 · to). `backup 끝 — ` 이면 backed(dir). `멈춤 — ` 이면 halt(내리는 가운데의 마지막 글 — 기록만). listening 도 기록만이다. 그 밖은 other | Probe 의 답 |
| 2 | GameServer.line | ready 면 띄움을 잇는다(흐름 3 의 8). status 면 lastStatus · linked · lag 을 고치고 답 없는 셈(misses)을 0 으로. 답을 기다리는 명령이 있고 줄이 그 답이면(Probe.answers) 그 명령에 준다. backed 면 기다리던 GameServer.backup 에 준다 | |
| 3 | GameServer.line → NodeRpc handoff | handoff 면 컨트롤 플레인에 노드 · 인스턴스 · 세대 · 캐릭터 · to 를 알린다 | ⇒ 흐름 10 |
| 4 | GameServer.exited(which, code) | 호스트가 끝나면 에이전트를 함께 끝내고 Ports.free 로 포트를 돌려준다. 내리는 가운데(`stopping`)였으면 `stopped` — 알리는 것은 NodeAgent.stop 이 Store 를 올린 뒤에 한다(흐름 7 의 3). 아니면 코드가 무엇이든 `failed` 이고 바로 NodeRpc exited(노드 · 인스턴스 · 세대 · 코드, uploaded 아님)를 알린다 | ⇒ 흐름 12 |
| 5 | GameServer.exited | 에이전트만 끝났고 호스트가 `ready` 면 에이전트를 다시 띄운다. 셈이 한계를 넘으면 호스트를 끝내고 `failed` 로 | ⇒ 4 |
| 6 | Log | 줄마다 `<인스턴스> <host\|agent> <줄>`. 에이전트의 stdout 은 첫 줄만 | 운영자 ◇ |

## 멈추는 자리

- GameServer 의 state · lastStatus · lag. 기록.

## 이어지는 흐름

- 5 주기 작업 · 10 존 이동 · 12 장애 복구.

## 규칙

- 호스트의 글은 그 노드가 읽는다. 컨트롤 플레인에는 주기의 heartbeat(흐름 5)와 이동 요청 · 종료의 알림만 간다.
- 이동 요청 · 종료의 알림이 사라져도 된다. 종료는 다음 heartbeat 에 그 인스턴스가 없거나 `failed` 인 것으로 드러나고(흐름 5 의 7), 이동 요청은 사람이 다시 누르면 다시 온다.
- 인스턴스의 Store 자리는 종료로 비우지 않는다.

## 미정

- 없음.

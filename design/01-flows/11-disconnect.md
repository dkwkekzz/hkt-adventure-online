# 흐름 11. 접속 종료 — 클라이언트의 소켓이 닫힌다

트리거: 게이트웨이가 든 클라이언트의 소켓이 닫힌다. 클라이언트가 끊었거나 선이 끊겼다.
한 줄: 세션에 재접속 유예를 걸고, 재접속 유예가 지나도록 돌아오지 않으면 값을 언로드해 저장하고 세션을 지운다.

## 순서

```text
Connection.close ─► SessionRpc detach                              [게이트웨이]
SessionManager.disconnect ── Session(grace)                          [세션 — 컨트롤 플레인]  ◇
  … 재접속 유예가 지난다 — SessionManager.tick                        ⇐ 흐름 5
Fleet.unload ─► NodeAgent.unload                         [플릿]
  GameServer.unload                                         [엔진]
  CharacterStore.checkin(release)                               [스토리지]
Presence.drop · Database.put(lastZone)                    [스토리지]
Queue.next                                              ⇒ 흐름 5 의 8
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Connection.close | upstream 을 닫는다. 호스트는 그 묶음을 무대 밖에 둔다(엔진의 끊김). 컨트롤 플레인에 SessionRpc detach | |
| 2 | SessionManager.disconnect(character) | Session 을 `grace` 로, 만료는 `graceMs` 뒤 | Session ◇ |
| 3 | (재접속 유예 안에 다시 온다) | 흐름 3 의 2 → 흐름 9. 로드를 건너뛰고 같은 인스턴스에 잇는다 | |
| 4 | SessionManager.tick → Fleet.unload | 재접속 유예가 지났다. NodeAgent.unload — GameServer.unload 로 값을 언로드하고 CharacterStore.checkin(release)으로 저장한다 | 값이 스토리지에 |
| 5 | SessionManager → Presence.drop · Database.put | 세션을 지우고 마지막 존을 적는다. 그 존에 기다리는 사람이 있으면 Queue.next | |

## 멈추는 자리

- 캐릭터의 값이 스토리지에, lease 는 비었다. 슬롯 하나가 났다.

## 이어지는 흐름

- 3 입장 · 5 주기 작업.

## 규칙

- 재접속 유예 동안 세션은 센다. 새로고침 · 잠깐의 끊김이 언로드를 부르지 않게 하는 값이다.
- 게이트웨이가 죽어 detach 가 오지 않은 것은 heartbeat 의 끊김으로 안다(흐름 12).
- 뷰어는 닫히면 닫힘 코드를 들고 API 서버의 들어가는 페이지로 돌아간다(`?exit=` — 엔진의 면). 그 페이지가 코드를 읽어 1001 · 1013 · 끊김이면 스스로 로그인 · 선택 · 입장을 다시 하고(흐름 2 · 8 · 3), 4000(다른 곳에서 접속) · 4002(거절)면 까닭을 보이고 사람의 누름을 기다린다.
- 재접속 유예 안에 돌아오면 캐릭터는 인스턴스에 그대로 있다 — 언로드도 로드도 없다.
- 언로드한 값을 저장하지 못하면(스토리지에 닿지 않는다) 노드가 캐릭터 파일과 lease 를 쥔 채 다시 한다(흐름 5 의 7″). 그동안 그 캐릭터의 입장은 lease 에 막힌다 — 값이 둘로 갈리지 않는다.

## 미정

- 없음.

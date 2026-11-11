# 흐름 6. 운영자 명령 — 글 한 줄

트리거: 운영자의 글 한 줄. 컨트롤 플레인의 Operator 소켓(인증된 내부 주소 · 개발에서는 stdin).
한 줄: 노드와 인스턴스를 보고 띄우고 비우고 내리고 되돌리고, 존을 닫고 열고, 사람을 내보내고 막고, 호스트의 Console 에 글을 넘긴다.

## 순서

```text
Operator.command                                        [앱 — 컨트롤 플레인]
  Fleet 의 표 · Fleet.launch · Fleet.drain · Fleet.terminate        [플릿]
  Fleet.command ─► NodeRpc command ─► NodeAgent.command ─► GameServer.command               [엔진]
  Fleet.backup · Fleet.restore · Fleet.copies · Fleet.remove ── SnapshotStore · Assignment.remove           [스토리지]
  SessionManager.migrate · SessionManager.close · SessionManager.open · SessionManager.kick   [세션]
  Directory.ban · Directory.unban · Directory.list               [계정]
  답 글 한 줄                                                     ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Operator.command | `nodes` · `instances [zone]` · `status <instance>` · `start <zone>` · `drain <instance>` · `stop <instance>` · `host <instance> <Console 글>` · `remove <instance>` · `backup <instance>` · `restore <instance> <백업>` · `close <zone>` · `open <zone>` · `kick <character>` · `ban <account> <until>` · `unban <account>`. 모르는 글이면 쓰는 법 | |
| 2 | `nodes` · `instances` | Node 마다 이름 · slots · used · seen. Instance 마다 이름 · state · Node · 사람 수 · lag · why | 글 |
| 3 | `status <instance>` | 그 Instance 의 전부와 Fleet.copies 의 백업 목록 | 글 |
| 4 | `start <zone>` | Fleet.launch(zone). `failed` 의 셈을 0 으로 한 뒤 | |
| 5 | `drain <instance>` | Fleet.drain 으로 `draining`(새 세션을 받지 않는다). SessionManager.migrate 가 그 인스턴스의 캐릭터를 같은 존의 다른 인스턴스로 옮긴다(흐름 10 의 2 부터). 비면 Fleet.terminate | |
| 6 | `stop <instance>` | Fleet.terminate 바로. 든 값은 언로드해 저장한다. 붙어 있던 사람은 흐름 12 의 3 처럼 다시 배정된다 | |
| 7 | `host <instance> <글>` | Fleet.command 로 그대로. 답 글을 돌려준다. `stop` 과 로드 · 언로드의 글은 넘기지 않는다 | 글 |
| 8 | `backup` · `restore` | 인스턴스가 `stopped` 또는 `failed` 일 때만. Fleet.backup 은 백업 하나를, Fleet.restore 는 자리를 백업으로 바꾼다(기존은 백업 하나로 남긴다) — SnapshotStore.copy · SnapshotStore.restore. 목록은 SnapshotStore.list | 백업 이름  |
| 9 | `close` · `open` | SessionManager.close · SessionManager.open — 그 존의 입장(흐름 3 의 3)을 차단하고 푼다. 붙어 있는 사람은 그대로다 | |
| 10 | `kick <character>` | SessionManager.kick — 게이트웨이가 닫고(SessionRpc kick) 값을 언로드하고 세션을 지운다 게이트웨이에서는 Gateway.kick 이 그 Connection 을 닫는다(detach 를 보내지 않는다) |  |
| 11 | `ban` · `unban` | Directory.ban · Directory.unban. ban 은 Directory.list 의 캐릭터마다 SessionManager.kick 도 한다 표의 줄은 Database.put · Database.remove |  |
| 11′ | `remove <instance>` | 인스턴스가 `stopped` 또는 `failed` 일 때만. Fleet.remove 가 Assignment.remove 로 표의 줄을 지운다. 올려 둔 Store 와 백업은 남는다 — 같은 이름으로 다시 띄우면 이어간다 | |
| 12 | Operator | 답을 글 한 줄로 | 운영자 ◇ |

## 멈추는 자리

- 컨트롤 플레인의 표. 스토리지. 운영자의 화면.

## 이어지는 흐름

- 3 · 5 · 10 · 12.

## 규칙

- 점검은 `close` 로 입장을 막고 `drain` 으로 비우는 것이다. 엔진을 바꾸는 배포도 같다 — 새 것을 띄우고 옛 것을 비운다.
- 운영자가 세계의 사실을 보는 자리는 호스트의 status 글 하나다. 명부는 `host <instance> grant …` 로만 고친다.

## 미정

- 없음.

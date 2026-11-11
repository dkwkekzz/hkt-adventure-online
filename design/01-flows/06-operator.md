# 흐름 6. 운영자 명령 — 글 한 줄

트리거: 운영자의 글 한 줄. 컨트롤 플레인의 Operator 소켓(인증된 내부 주소 · 개발에서는 stdin).
한 줄: 노드와 인스턴스를 보고 띄우고 비우고 내리고 되돌리고, 존을 닫고 열고, 사람을 내보내고 막고, 호스트의 Console 에 글을 넘긴다.

## 순서

```text
Operator.command                                        [앱 — 컨트롤 플레인]
  Signer.verify · Database.put(audit)                           [계정 · 스토리지]
  Fleet 의 표 · Fleet.launch · Fleet.drain · Fleet.undrain · Fleet.terminate · Fleet.cordon · Fleet.uncordon        [플릿]
  Fleet.command ─► NodeRpc command ─► NodeAgent.command ─► GameServer.command               [엔진]
  Fleet.backup · Fleet.restore · Fleet.copies · Fleet.remove ── SnapshotStore · Assignment.remove           [스토리지]
  SessionManager.migrate · SessionManager.close · SessionManager.open · SessionManager.kick   [세션]
  Directory.ban · Directory.unban · Directory.list               [계정]
  답 글 한 줄                                                     ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Operator.command | `nodes` · `instances [zone]` · `status <instance>` · `start <zone>` · `drain <instance>` · `undrain <instance>` · `stop <instance>` · `host <instance> <Console 글>` · `remove <instance>` · `backup <instance>` · `restore <instance> <백업>` · `close <zone>` · `open <zone>` · `versions <character>` · `rollback <character> <때>` · `cordon <node>` · `uncordon <node>` · `kick <character>` · `ban <account> <until>` · `unban <account>`. 모르는 글이면 쓰는 법. 글의 머리에 운영자의 토큰이 온다 — Signer.verify 로 풀어 운영자의 이름을 얻고(id 가 `o` 로 시작하고 설정의 `operators` 에 있는 이름만), 틀리면 거절 ✕. 명령마다 누가 · 언제 · 무엇을 Database.put(`audit`)으로 적는다 |  |
| 2 | `nodes` · `instances` | Node 마다 이름 · slots · used · seen. Instance 마다 이름 · state · Node · 사람 수 · lag · why | 글 |
| 3 | `status <instance>` | 그 Instance 의 전부와 Fleet.copies 의 백업 목록 | 글 |
| 4 | `start <zone>` | Fleet.launch(zone). `failed` 의 셈을 0 으로 한 뒤 | |
| 5 | `drain <instance>` | Fleet.drain 으로 `draining`(새 세션을 받지 않는다). SessionManager.migrate 가 그 인스턴스의 캐릭터를 같은 존의 다른 인스턴스로 옮긴다(흐름 10 의 2 부터). 비면 Fleet.terminate. 비었는가는 흐름 5 의 11 이 본다 — 옮길 슬롯이 없어 남은 사람은 스스로 나가거나 슬롯이 날 때까지 있는다. `undrain` 은 Fleet.undrain 으로 되돌린다. `draining` 은 표의 줄에 적혀 컨트롤 플레인이 바뀌어도 남는다 |  |
| 6 | `stop <instance>` | Fleet.terminate 바로. 든 값은 언로드해 저장한다. 옮기지 않는다 — 붙어 있던 사람은 닫히고 다시 입장한다(흐름 5 의 8). 끊지 않고 비우려면 `drain` 이다 | |
| 7 | `host <instance> <글>` | Fleet.command 로 그대로. 답 글을 돌려준다. `stop` 과 로드 · 언로드의 글은 넘기지 않는다 | 글 |
| 8 | `backup` · `restore` | 인스턴스가 `stopped` 또는 `failed` 일 때만. Fleet.backup 은 백업 하나를, Fleet.restore 는 자리를 백업으로 바꾼다(기존은 백업 하나로 남긴다) — SnapshotStore.copy · SnapshotStore.restore. 목록은 SnapshotStore.list. 컨트롤 플레인이 막 바뀌어 표를 세우는 동안(settling)과 `unknown` 인 인스턴스에는 `restore` · `remove` 를 받지 않는다 | 백업 이름   |
| 9 | `close` · `open` | SessionManager.close · SessionManager.open — 그 존의 입장(흐름 3 의 3)을 차단하고 푼다. 붙어 있는 사람은 그대로다. 표 `zones` 에 적혀 컨트롤 플레인이 바뀌어도 남는다. 닫힌 존에서도 `drain` 은 사람을 옮긴다(흐름 10 의 2) |  |
| 10 | `kick <character>` | SessionManager.kick — 게이트웨이가 닫고(SessionRpc kick) 값을 언로드하고 세션을 지운다. 게이트웨이에서는 Gateway.kick 이 그 Connection 을 닫는다(detach 를 보내지 않는다) |  |
| 11 | `ban` · `unban` | Directory.ban · Directory.unban. ban 은 Directory.list 의 캐릭터마다 SessionManager.kick 도 한다. 표의 줄은 Database.put · Database.remove |  |
| 11′ | `remove <instance>` | 인스턴스가 `stopped` 또는 `failed` 일 때만. Fleet.remove 가 Assignment.remove 로 표의 줄을 지운다. 올려 둔 Store 와 백업은 남는다 — 같은 이름으로 다시 띄우면 이어간다 | |
| 11″ | `versions` · `rollback` | SessionManager.versions 는 그 캐릭터의 지난 값의 때들. SessionManager.rollback 은 세션이 없을 때만 값을 그때로 되돌린다 — 깨진 값 · 잘못 사라진 것을 고치는 길이다 | 글 |
| 11‴ | `cordon` · `uncordon` | Fleet.cordon 은 그 Node 에 새 인스턴스를 띄우지 않게 한다. 그 뒤 인스턴스마다 `drain` 하면 노드가 빈다 — 서버를 고치거나 엔진을 바꿀 때 | |
| 12 | Operator | 답을 글 한 줄로 | 운영자 ◇ |

## 멈추는 자리

- 컨트롤 플레인의 표. 스토리지. 운영자의 화면.

## 이어지는 흐름

- 3 · 5 · 10 · 12.

## 규칙

- 점검은 `close` 로 입장을 막고 `drain` 으로 비우는 것이다. 엔진을 바꾸는 배포도 같다 — 새 것을 띄우고 옛 것을 비운다.
- 운영자가 세계의 사실을 보는 자리는 호스트의 status 글 하나다. 명부는 `host <instance> grant …` 로만 고친다.
- 배포는 있는 흐름의 차례다. API 서버: 하나씩 내리고 띄운다(상태가 없다). 게이트웨이: 하나씩 종료 신호(흐름 7 의 3) — 그 사람들은 재접속 유예 안에 다른 게이트웨이로 돌아온다. 컨트롤 플레인: 대기를 먼저 바꾸고 활성을 내린다(흐름 13 의 전환). 노드: `cordon` → 인스턴스마다 `drain` → 종료 신호 → 바꿔 띄움 → `uncordon`.
- 엔진을 바꾸는 배포(새 빌드): 새 빌드의 노드와 API 서버를 먼저 띄우고, 옛 빌드의 인스턴스를 `drain` 한다. 옛 뷰어는 같은 빌드의 인스턴스가 없어 닫히고(흐름 10 의 2), 돌아와 새 페이지를 받는다.
- 서명 키를 바꾸는 법: 새 키를 keys 의 첫 자리에, 옛 키를 뒤에 두고 프로세스를 차례로 다시 띄운다. 새로 뜨는 인스턴스는 새 키로 뜬다. 옛 키로 뜬 인스턴스에는 컨트롤 플레인이 옛 키로 토큰을 낸다(Signer.issueWith — Instance 의 key). 옛 인스턴스가 다 비면 옛 키를 뺀다.
- 존을 더하거나 빼는 것은 설정을 바꿔 컨트롤 플레인을 전환하는 것이다. 빠진 존의 인스턴스는 `drain` 뒤 `remove` 한다.
- 운영자의 토큰은 흐름이 내지 않는다. 서명 키를 든 사람이 도구로 낸다(밖) — id 가 `o<이름>` 인 토큰이고 수명이 있다. 운영자를 빼는 것은 설정의 `operators` 에서 이름을 지우는 것이다.
- Fleet.cordon 은 표 `nodes` 에 적혀 컨트롤 플레인이 바뀌어도 남는다.

## 미정

- 없음.

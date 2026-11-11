# 흐름 6. 운영자 명령 — 글 한 줄

트리거: 운영자의 글 한 줄. 컨트롤 플레인의 Operator 소켓(인증된 내부 주소 · 개발에서는 stdin).
한 줄: 노드와 인스턴스를 보고 띄우고 비우고 내리고 되돌리고, 존을 닫고 열고, 사람을 내보내고 막고, 호스트의 Console 에 글을 넘긴다.

## 순서

```text
Operator.command                                        [앱 — 컨트롤 플레인]
  Signer.verify · Database.put(audit)                           [계정 · 스토리지]
  Fleet 의 표 · Fleet.launch · Fleet.drain · Fleet.undrain · Fleet.terminate · Fleet.cordon · Fleet.uncordon · Fleet.forget        [플릿]
  Fleet.command ─► NodeRpc command ─► NodeAgent.command ─► GameServer.command               [엔진]
  Fleet.backup · Fleet.restore · Fleet.copies · Fleet.remove ── SnapshotStore · Assignment.remove           [스토리지]
  SessionManager.migrate · SessionManager.close · SessionManager.open · SessionManager.kick   [세션]
  Directory.ban · Directory.unban · Directory.list               [계정]
  답 글 한 줄                                                     ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Operator.command | `nodes` · `instances [zone]` · `status <instance>` · `start <zone\|instance>` · `drain <instance>` · `undrain <instance>` · `stop <instance>` · `host <instance> <Console 글>` · `remove <instance>` · `backup <instance>` · `restore <instance> <백업>` · `close <zone>` · `open <zone>` · `versions <character>` · `rollback <character> <때>` · `cordon <node>` · `uncordon <node>` · `forget <node>` · `kick <character>` · `ban <account> <until>` · `unban <account>`. 모르는 글이면 쓰는 법. 글의 머리에 운영자의 토큰이 온다 — Signer.verify 로 풀어 운영자의 이름을 얻고(id 가 `o` 로 시작하고 설정의 `operators` 에 있는 이름만), 틀리면 거절 ✕. 명령마다 누가 · 언제 · 무엇을 Database.put(`audit`)으로 적는다 |  |
| 2 | `nodes` · `instances` | Node 마다 이름 · slots · used · seen. Instance 마다 이름 · state · Node · 사람 수 · lag · why | 글 |
| 3 | `status <instance>` | 그 Instance 의 전부와 Fleet.copies 의 백업 목록 | 글 |
| 4 | `start <zone\|instance>` | 존이면 Fleet.launch(zone, 설정의 build). 인스턴스면 그 `failed` · `stopped` 인 것의 셈을 0 으로 하고 그 이름으로 Fleet.launch — 한계를 넘겨 멈춘 인스턴스를 다시 세우는 길이다 | |
| 5 | `drain <instance>` | Fleet.drain 으로 `draining`(새 세션을 받지 않는다). SessionManager.migrate 가 그 인스턴스의 캐릭터를 같은 존의 다른 인스턴스로 옮긴다(흐름 10 의 2 부터). 비면 Fleet.terminate. 비었는가는 흐름 5 의 11 이 본다 — 옮길 슬롯이 없어 남은 사람은 스스로 나가거나 슬롯이 날 때까지 있는다. `undrain` 은 Fleet.undrain 으로 되돌린다. `draining` 은 표의 줄에 적혀 컨트롤 플레인이 바뀌어도 남는다 |  |
| 6 | `stop <instance>` | Fleet.terminate 바로. 든 값은 언로드해 저장한다. 옮기지 않는다 — 붙어 있던 사람은 닫히고 다시 입장한다(흐름 5 의 8). 끊지 않고 비우려면 `drain` 이다 | |
| 7 | `host <instance> <글>` | Fleet.command 로 그대로. 답 글을 돌려준다. `stop` 과 로드 · 언로드의 글은 넘기지 않는다 | 글 |
| 8 | `backup` · `restore` | 인스턴스가 `stopped` 또는 `failed` 일 때만. Fleet.backup 은 백업 하나를, Fleet.restore 는 자리를 백업으로 바꾸고(기존은 백업 하나로 남긴다) 세대를 하나 올려 표와 Store 자리에 적는다 — 어느 서버에 남은 옛 자리보다 새것이 되어, 어디에 다시 뜨든 되돌린 것에서 선다 — SnapshotStore.copy · SnapshotStore.restore. 목록은 SnapshotStore.list. 컨트롤 플레인이 막 바뀌어 표를 세우는 동안(settling)과 `unknown` 인 인스턴스에는 `restore` · `remove` 를 받지 않는다 | 백업 이름   |
| 9 | `close` · `open` | SessionManager.close · SessionManager.open — 그 존의 입장(흐름 3 의 4)과 사람이 건너오는 이동(흐름 10 의 2)을 차단하고 푼다. 붙어 있는 사람은 그대로다. 표 `zones` 에 적혀 컨트롤 플레인이 바뀌어도 남는다. 닫힌 존에서도 `drain` 은 사람을 옮긴다(흐름 10 의 2) |  |
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
- 배포는 있는 흐름의 차례다. API 서버: 하나씩 내리고 띄운다(상태가 없다). 게이트웨이: 하나씩 종료 신호(흐름 7 의 5) — 그 사람들은 재접속 유예 안에 다른 게이트웨이로 돌아온다. 컨트롤 플레인: 대기를 먼저 바꾸고 활성을 내린다(흐름 13 의 전환). 노드: `cordon` → 인스턴스마다 `drain` → 종료 신호 → 바꿔 띄움 → `uncordon`.
- 엔진을 바꾸는 배포(새 빌드): 새 빌드의 노드와 API 서버를 먼저 띄우고, 옛 빌드의 인스턴스를 `drain` 한다. 옛 뷰어는 옮길 같은 빌드의 인스턴스를 띄울 노드가 없어 닫히고(흐름 10 의 3 — 옛 빌드의 노드를 먼저 `cordon` 한다), 돌아와 새 페이지를 받는다.
- 서명 키를 바꾸는 것은 두 바퀴다. 첫 바퀴: 새 키를 keys 의 뒤에 더해 모든 프로세스를 차례로 다시 띄운다 — 이제 누구나 새 키로 낸 토큰을 푼다. 둘째 바퀴: 새 키를 첫 자리로 옮겨 다시 띄운다 — 이제 새 키로 낸다. 인스턴스는 뜰 때의 키의 자리를 줄에 적고(흐름 3 의 7), 컨트롤 플레인은 그 키로 그 호스트에 줄 토큰을 낸다(Signer.issueWith). 옛 키로 뜬 인스턴스가 다 비면 옛 키를 뺀다.
- 존을 더하거나 빼는 것은 설정을 바꿔 컨트롤 플레인을 전환하는 것이다. 빠진 존의 인스턴스는 `drain` 뒤 `remove` 한다.
- 운영자의 토큰은 흐름이 내지 않는다. 서명 키를 든 사람이 도구로 낸다(밖) — id 가 `o<이름>` 인 토큰이고 수명이 있다. 운영자를 빼는 것은 설정의 `operators` 에서 이름을 지우는 것이다.
- Fleet.cordon 은 표 `nodes` 에 적혀 컨트롤 플레인이 바뀌어도 남는다. 없앤 노드는 `forget <node>`(Fleet.forget)로 표에서 지운다 — 인스턴스의 줄이 남아 있으면 거절.
- 운영자의 토큰은 서명 키와 다른 키(`OPERATOR_KEY`)로 서명한다. 밖에 열린 프로세스(API 서버 · 게이트웨이)는 그 키를 들지 않는다.

## 미정

- 없음.

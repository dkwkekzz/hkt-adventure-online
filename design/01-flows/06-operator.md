# 흐름 6. 운영자 명령 — 글 한 줄

트리거: 운영자의 글 한 줄. 컨트롤 플레인의 Operator 소켓(내부 주소 · 개발에서는 stdin). 머리에 운영자의 토큰이 온다.
한 줄: 누구의 명령인지 확인하고 기록한 뒤, 명령 하나를 그 일을 맡은 개념 하나에 넘긴다.

## 순서

```text
Operator.command → Signer.verify → Database.put(audit) → 명령마다의 개념 하나 → 답 글 한 줄
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Operator.command | 글을 받아 명령과 인자로 가른다. 모르는 글이면 쓰는 법 | |
| 2 | Signer.verify | 운영자의 토큰을 푼다. 설정의 `operators` 에 없는 이름이면 거절 | 운영자의 이름 |
| 3 | Database.put | 누가 · 언제 · 무엇을 표 `audit` 에 적는다 | |
| 4 | 아래 표의 개념 | 명령을 한다 | |
| 5 | Operator.command | 답을 글 한 줄로 | 운영자 ◇ |

| 명령 | 누가 | 무엇을 |
|---|---|---|
| `nodes` | Nodes.list | 노드마다 이름 · slots · 마지막 보고 |
| `instances [zone]` | Registry.all | 인스턴스마다 이름 · state · 노드 · 사람 수 · 지연 |
| `start <zone>` | Scheduler.place | 그 존의 인스턴스 하나를 띄운다(⇒ 흐름 3 의 B) |
| `drain <instance>` · `undrain` | Registry.drain | 새 세션을 받지 않게 하고(되돌리고), 남은 사람은 Mover.move 로 같은 존의 다른 인스턴스로 옮긴다(⇒ 흐름 10). 비면 흐름 5 의 12 가 내린다 |
| `stop <instance>` | Runner.stop | 바로 내린다(⇒ 흐름 7 의 3 ~ 6). 옮기지 않는다 |
| `remove <instance>` | Registry.remove | 내려간 인스턴스의 줄을 지운다 |
| `host <instance> <글>` | Console.command | 그 호스트의 Console 에 글을 넘기고 답을 돌려준다 |
| `backup <instance>` · `restore <instance> <백업>` · `purge <instance>` | SnapshotStore.copy · SnapshotStore.restore · SnapshotStore.purge | 내려간 인스턴스의 Store 를 백업하고 되돌리고 지운다 |
| `close <zone>` · `open <zone>` | ZoneMap.close · ZoneMap.open | 그 존의 입장을 막고 푼다 |
| `cordon <node>` · `uncordon <node>` | Nodes.cordon · Nodes.uncordon | 그 노드에 새로 띄우지 않게 하고 푼다 |
| `forget <node>` | Recoverer.recover | 그 노드를 죽은 것으로 한다 — 그 인스턴스마다 흐름 12 |
| `kick <character>` | Router.kick | 그 접속을 닫고(4000) 세션을 지운다. 값은 흐름 5 의 9 가 언로드시킨다 |
| `ban <account> <until>` · `unban <account>` | Banlist.ban · Banlist.unban | 계정을 차단하고 푼다. 차단하면 그 계정의 세션도 내보낸다 |
| `versions <character>` · `rollback <character> <때>` | CharacterStore.versions · CharacterStore.rollback | 캐릭터의 지난 값을 보고 되돌린다(세션이 없을 때만) |

## 실패하면

- 토큰이 틀리면 아무것도 하지 않고 거절한다.
- 명령이 실패하면 그 까닭을 답 글로 준다.

## 멈추는 자리

- 운영자의 화면.

## 이어지는 흐름

- 3 · 5 · 7 · 10 · 12.

## 규칙

- 점검은 `close` 로 입장을 막고 `drain` 으로 비우는 것이다.
- 배포는 있는 흐름의 차례다. API 서버 · 게이트웨이: 하나씩 내리고 띄운다(게이트웨이의 사람은 재접속 유예 안에 다른 게이트웨이로 돌아온다). 컨트롤 플레인: 대기를 먼저 바꾸고 활성을 내린다(흐름 13). 노드: `cordon` → `drain` → 내림 → 바꿔 띄움 → `uncordon`.
- 엔진을 바꾸는 배포: 새 빌드의 노드와 API 서버를 먼저 띄우고, 옛 빌드의 노드를 `cordon` 하고 인스턴스를 `drain` 한다. 옛 뷰어는 닫히고 돌아와 새 페이지를 받는다.
- 운영자의 토큰은 서명 키와 다른 키(`OPERATOR_KEY` — 컨트롤 플레인만 든다)로 서명한다. 그 키를 든 사람이 도구로 낸다.

## 미정

- 없음.

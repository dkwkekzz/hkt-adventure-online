# 흐름 7. 종료 — 프로세스의 종료 신호

트리거: 프로세스. SIGINT · SIGTERM.
한 줄: 노드는 든 캐릭터의 값을 거둬 넣고 인스턴스를 내린다. 관문은 소켓을 닫는다. 제어와 앞문은 듣기를 닫는다. 어느 것도 다른 프로세스를 내리지 않는다.

## 순서

```text
Service.stop                                            [앱]
  node     Warden.stopAll ── Warden.stop × Shard        [함대 — 노드]
             Shard.reclaim · Locker.checkin             [엔진 · 저장]
             Shard.stop · Vault.push                    [엔진 · 저장]
  gate     Gateway.stop ── Session.close × 접속          [관문]
  control  Clock.stop · 듣기 닫기                         [함대]
  front    Api 닫기
```

| # | 어느 role | 누가 | 무엇을 | 결과 |
|---|---|---|---|---|
| 1 | node | Warden.stopAll | Shard 마다 Warden.stop — 든 캐릭터를 전부 Shard.reclaim 해 Locker.checkin(release)으로 넣고, Shard.stop(호스트가 저장하고 끝난다. 한계 안에 끝나지 않으면 신호로), Vault.push 로 Store 를 올린다 | 값 · Store 가 저장에 |
| 2 | node | Shard.exited → Berth exited | 제어는 그 인스턴스를 `stopped` 로 보고 붙어 있던 사람을 다시 놓는다 | ⇒ 흐름 12 의 3 |
| 3 | gate | Gateway.stop | Session 마다 Session.close(1001). 제어에 left 가 간다 | ⇒ 흐름 11 |
| 4 | control | Service | Clock.stop. Seat · Berth · Operator 를 닫는다. 인스턴스는 내리지 않는다 — 표는 저장에 있고 다음 시작(흐름 1)이 되찾는다 | |
| 5 | front | Service | Api 를 닫는다 | |

## 멈추는 자리

- 저장. 다음 시작(흐름 1)이 되찾는다.

## 규칙

- 두 번 불려도 한 번.
- 제어 · 앞문 · 관문의 종료는 도는 인스턴스에 닿지 않는다.

## 미정

- 없음.

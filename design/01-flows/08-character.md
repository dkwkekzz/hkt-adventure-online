# 흐름 8. 캐릭터 — 클라이언트의 계정 토큰

트리거: Api 의 `characters` · `create` · `choose` · `delete`. 계정의 토큰을 든다.
한 줄: 그 계정의 캐릭터를 보고, 만들고, 지우고, 하나를 골라 캐릭터의 토큰을 받는다.

## 순서

```text
Api characters · create · choose · delete                        [앱 — API 서버]
  Signer.verify                                         [계정]
  Directory.banned
  Directory.list · Directory.create · Directory.owns
    Database.get · Database.put(characters)                 [스토리지]
  SessionRpc forget ─► SessionManager.forget ── CharacterStore.erase — delete   [세션 · 스토리지]
  Directory.remove — delete
  Signer.issue — choose                                 [계정]
  답                                                    ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Signer.verify(token) | 서명과 만료. 틀리거나 계정의 토큰이 아니면 거절 ✕ | Account.id |
| 2 | Directory.banned(account) | 차단됐으면 거절 ✕ | |
| 3 | `characters` → Directory.list(account) | 그 계정의 캐릭터들(Character.id · 이름) | 목록 ◇ |
| 4 | `create` → Directory.create(account, name) | 이름의 모양이 틀리거나 한계(`characterLimit`)를 넘으면 거절 ✕. 새 Character.id 를 짓고 적는다 | Character ◇ |
| 5 | `choose` → Directory.owns(account, character) | 그 계정의 것이 아니면 거절 ✕ | |
| 6 | `choose` → Signer.issue(character) | 캐릭터의 토큰 — 수명은 짧게(`characterTtl`) | Token ◇ |

| 7 | `delete` → Directory.owns · SessionManager.forget(character) | 그 계정의 것이 아니면 거절 ✕. 세션이 있으면(놀고 있거나 재접속 유예) 거절 ✕. CharacterStore.erase 로 값을 지운다 — 어느 인스턴스가 lease 를 들고 있으면 거절 ✕ | |
| 8 | `delete` → Directory.remove(account, character) | 캐릭터의 줄과 마지막 존을 지운다 | ◇ |

## 멈추는 자리

- 클라이언트가 캐릭터의 토큰을 든다.

## 이어지는 흐름

- 3 입장.

## 규칙

- 클라이언트는 Character.id 를 지어 보낼 수 없다. 게이트웨이와 호스트가 받는 이름은 서명된 토큰 안의 것뿐이고, 그 토큰은 owns 를 지난 뒤에만 나온다.
- 캐릭터의 값(엔진의 것)은 처음 들일 때 엔진이 틀에서 낳는다(흐름 9). 만들기는 이름과 id 만 적는다.

## 미정

- 없음.

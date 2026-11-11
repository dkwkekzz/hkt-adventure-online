# 흐름 8. 캐릭터 — 클라이언트의 계정 토큰

트리거: Api 의 `characters` · `create` · `choose`. 계정의 토큰을 든다.
한 줄: 그 계정의 캐릭터를 보고, 만들고, 하나를 골라 캐릭터의 토큰을 받는다.

## 순서

```text
Api characters · create · choose                        [앱 — 앞문]
  Signer.verify                                         [계정]
  Directory.banned
  Directory.list · Directory.create · Directory.owns
    Ledger.get · Ledger.put(characters)                 [저장]
  Signer.issue — choose                                 [계정]
  답                                                    ◇
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Signer.verify(token) | 서명과 만료. 틀리거나 계정의 토큰이 아니면 거절 ✕ | Account.id |
| 2 | Directory.banned(account) | 막혔으면 거절 ✕ | |
| 3 | `characters` → Directory.list(account) | 그 계정의 캐릭터들(Character.id · 이름) | 목록 ◇ |
| 4 | `create` → Directory.create(account, name) | 이름의 모양이 틀리거나 한계(`characterLimit`)를 넘으면 거절 ✕. 새 Character.id 를 짓고 적는다 | Character ◇ |
| 5 | `choose` → Directory.owns(account, character) | 그 계정의 것이 아니면 거절 ✕ | |
| 6 | `choose` → Signer.issue(character) | 캐릭터의 토큰 — 수명은 짧게(`characterTtl`) | Token ◇ |

## 멈추는 자리

- 클라이언트가 캐릭터의 토큰을 든다.

## 이어지는 흐름

- 3 입장.

## 규칙

- 클라이언트는 Character.id 를 지어 보낼 수 없다. 관문과 호스트가 받는 이름은 서명된 토큰 안의 것뿐이고, 그 토큰은 owns 를 지난 뒤에만 나온다.
- 캐릭터의 값(엔진의 것)은 처음 들일 때 엔진이 틀에서 낳는다(흐름 9). 만들기는 이름과 id 만 적는다.

## 미정

- 없음.

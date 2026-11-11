# 흐름 8. 캐릭터 — 클라이언트의 계정 토큰

트리거: Api 의 `characters` · `create` · `choose` · `delete`. 계정의 토큰을 든다.
한 줄: 그 계정의 캐릭터를 보고, 만들고, 지우고, 하나를 골라 캐릭터의 토큰을 받는다.

## 순서

```text
전부     Api.characters → Signer.verify → Banlist.banned
보기     → Characters.list
만들기   → Characters.create
고르기   → Characters.owner → Signer.issue
지우기   → Characters.owner → Sessions.get → Characters.remove → CharacterStore.erase → ZoneMap.forget
```

| # | 누가 | 무엇을 | 결과 |
|---|---|---|---|
| 1 | Api.characters | 요청을 받는다(`create` · `choose` · `delete` 도 같다) | |
| 2 | Signer.verify | 계정의 토큰을 푼다. 틀리면 거절 | Account.id |
| 3 | Banlist.banned | 차단됐으면 거절 | |
| 4 | Characters.list | (보기) 그 계정의 캐릭터들 | 목록 ◇ |
| 5 | Characters.create | (만들기) 새 캐릭터를 짓고 적는다. 한계를 넘으면 거절 | Character ◇ |
| 6 | Characters.owner | (고르기 · 지우기) 그 계정의 것이 아니면 거절 | |
| 7 | Signer.issue | (고르기) 캐릭터의 토큰을 낸다 — 수명은 짧게 | Token ◇ |
| 8 | Sessions.get | (지우기) 세션이 있으면(놀고 있다) 거절 | |
| 9 | Characters.remove | (지우기) 캐릭터의 줄을 지운다 | |
| 10 | CharacterStore.erase | (지우기) 값과 이력을 지운다 | |
| 11 | ZoneMap.forget | (지우기) 마지막 존을 지운다 | ◇ |

## 실패하면

- 지우기의 8 ~ 11 은 컨트롤 플레인이 한 번에 한다(SessionRpc forget). 그 사이에 그 캐릭터의 입장이 끼어들지 못한다.

## 멈추는 자리

- 클라이언트가 캐릭터의 토큰을 든다.

## 이어지는 흐름

- 3 입장.

## 규칙

- 클라이언트는 Character.id 를 지어 보낼 수 없다. 게이트웨이와 호스트가 받는 이름은 서명된 토큰 안의 것뿐이고, 그 토큰은 6 을 지난 뒤에만 나온다.
- 캐릭터의 값(엔진의 것)은 처음 로드할 때 엔진이 틀에서 낳는다(흐름 9). 만들기는 이름과 id 만 적는다.

## 미정

- 없음.

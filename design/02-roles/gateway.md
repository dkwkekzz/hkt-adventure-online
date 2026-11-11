# 관문 gateway — 책임

관문이란, 클라이언트의 소켓을 들고 그 캐릭터가 놓인 호스트와 글을 그대로 넘기는 것이다.

- 글의 안을 모른다. 읽는 것은 접속의 첫 글(`Host 2`)의 자격 하나뿐이고, 그 뒤의 글(`Link 1` · `Link 2` · `Link 3`)은 풀지 않고 넘긴다.
- 어느 호스트로 갈지 정하지 않는다. 배치가 준 주소로만 잇는다(Seat 소켓).
- 상태는 열린 소켓뿐이다. 관문이 죽으면 그 사람들은 다시 들어온다(흐름 3).
- 호스트의 주소는 클라이언트에게 가지 않는다.

```text
Gateway ← Service(관문)
├ Guard
└ Session × 접속
```

## 개념

### Gateway
- 데이터: name(불변) · address(불변, 밖에서 보는 주소) · sessions:map<Character.id, Session> · guard · seat(참조, Seat 소켓) · verify(토큰 → id, 앱이 준다).
- 기능: accept(socket) 은 흐름 9 — 첫 글의 토큰을 풀고 Seat 의 claim 으로 자리를 확인해 Session 을 연다. 같은 캐릭터의 옛 Session 이 있으면 닫는다(나중 접속이 이긴다). swap(character, address, token) 은 그 Session 의 뒤를 바꾼다(흐름 10 · 12). kick(character, why) 는 그 Session 을 닫는다. beat 는 이 관문이 살아 있음과 붙은 캐릭터들을 Seat 로 알린다(흐름 5). stop 은 Session 을 전부 닫는다.
- 생애: Service.start 가 만든다. 프로세스와 함께 사라진다.

### Session
- 데이터: character:Character.id(불변) · client(클라이언트의 소켓) · upstream(호스트로 가는 소켓 또는 null) · state:`opening`|`open`|`swapping`|`closed`.
- 기능: open(address, token) 은 호스트에 소켓을 열고 첫 글 `Host 2` 를 그 토큰으로 보낸다. relay 는 양쪽의 글을 그대로 넘긴다 — 클라이언트의 글은 Guard.check 를 지난 것만. swap(address, token) 은 옛 upstream 을 닫고 새로 open 한다 — 그 사이 클라이언트의 글은 버린다. close(code, why) 는 양쪽을 닫고 Seat 의 left 를 보낸다.
- 생애: Gateway.accept 가 만든다. close 뒤 사라진다.

### Guard
- 데이터: maxBytes:int(불변, 글 하나의 크기) · maxRate:int(불변, 초마다의 글 수).
- 기능: check(session, frame) → 괜찮으면 null, 아니면 까닭. 크기와 빈도만 본다.
- 생애: Gateway 와 함께.

## 소켓

| 메시지 | 방향 | 보내는 것 | 답 |
|---|---|---|---|
| Link | 클라이언트 ↔ 관문 ↔ 호스트 | 엔진의 글 넷 | 그대로 |
| Seat claim | 관문 → 제어 | Character.id · 관문의 이름 | `{address, token}` 또는 까닭 |
| Seat left | 관문 → 제어 | Character.id | 없음 |
| Seat beat | 관문 → 제어 | 관문의 이름 · 붙은 Character.id 들 | 없음 |
| Seat swap | 제어 → 관문 | Character.id · address · token | 없음 |
| Seat kick | 제어 → 관문 | Character.id · 까닭 | 없음 |

## 미정

- 없음.

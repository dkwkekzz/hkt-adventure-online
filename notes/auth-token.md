# 서명 키와 토큰 — 설정 · 발급 · 주입

서비스와 엔진은 **키 하나**(`HOST_AUTH_KEY`)를 같이 든다. 서비스는 그 키로 토큰을 서명해 내고, 엔진(호스트)의 Gate 는 같은 키로 토큰을 검증한다.
클라이언트는 키를 들지 않는다 — 서비스에서 토큰을 받아 엔진에 붙을 때 내밀 뿐이다.

설계의 근거는 [흐름 2 로그인](../design/01-flows/02-login.md) · [흐름 3 입장](../design/01-flows/03-enter.md) · [account 책임](../design/02-roles/account.md), 엔진 쪽 사실은 엔진의 `web/ONLINE.md` §1.2(와이어 포맷) · §1.3(자격)이다.

## 1. 키 하나가 쓰이는 자리

서비스를 띄울 때 환경변수로 준다. 엔진에 따로 줄 필요는 없다 — 서비스가 샤드를 띄울 때 넘긴다.

```bash
HOST_AUTH_KEY=change-me npm start
```

| 어디 | 하는 일 | 코드 |
|---|---|---|
| 서비스의 Signer | 로그인한 사람에게 토큰을 서명해 낸다. `/enter` 에서 토큰을 푼다 | `src/account/signer.ts` |
| 엔진(호스트) 프로세스 | 서비스가 샤드를 띄울 때 환경변수 `HOST_AUTH_KEY` 로 넘긴다. 엔진의 Gate 가 이것으로 접속의 토큰을 검증한다 | `src/fleet/spawner.ts` → 엔진 `web/host/gate.ts` |
| NPC 에이전트 | 키를 받지 않는다. 서비스가 NPC 계정(`service.config.json` 의 `fleet.npc.account`)의 토큰을 `agentTtl`(300 초)로 내어 `--token` 으로 준다. 에이전트를 다시 띄울 때마다 새로 낸다 | `src/fleet/shard.ts` 의 spawnAgent |

키가 없으면 서비스는 시작하지 않는다(흐름 1 — 토큰 없는 서비스는 외부에 열지 않는다).
엔진을 서비스 없이 `npm run dev` 로만 띄우고 키를 주지 않으면 예전처럼 이름 글이 그대로 계정이다(개발 · 테스트 · play).
엔진은 머리글에 어느 쪽인지 찍는다 — `자격: 서명된 토큰(HOST_AUTH_KEY)` 또는 `자격: 이름 글(더미)`.

## 2. 토큰의 모양

```text
hkt1.<Account.id>.<만료 epoch 초>.<sig>
sig = base64url( HMAC-SHA256(key, "hkt1.<Account.id>.<만료>") )
```

- `Account.id` 는 공백 · `.` 없이 64 자 안. 서비스의 게스트 계정은 `p` 와 16 진 12 자(`p9bd25feaf7f9`).
- 엔진의 Gate 는 접속의 첫 글에서 머리(`hkt1`) · 모양 · 서명 · 만료를 보고, 하나라도 틀리면 `Link 1 reject` 뒤 close **4002**.
- 검증은 **접속할 때 한 번**이다. 열린 연결은 만료가 지나도 끊기지 않는다.
- 토큰 안의 id 는 누구나 읽을 수 있다(비밀이 아니다). 비밀은 키다.

## 3. 새 클라이언트 — 받고 주입하기

Unreal · 다른 웹 클라이언트 · 봇 모두 같은 네 단계다.

### ① 로그인 — 토큰 받기

```bash
curl -s -X POST http://localhost:8000/login -H 'content-type: application/json' -d '{"provider":"guest"}'
```

답: `{"token":"hkt1.p….….…","subject":"…"}`

- `subject` 는 **클라이언트가 저장한다.** 같은 subject 로 다시 로그인하면 같은 계정 · 같은 세계다. 브라우저의 게스트 페이지는 localStorage 의 `hkt.guest` 에 둔다.
- 제공자는 지금 `guest` 하나. subject 는 8 ~ 64 자의 영문 · 숫자 · `_` · `-`.

```bash
curl -s -X POST http://localhost:8000/login -H 'content-type: application/json' -d '{"provider":"guest","subject":"<저장해 둔 subject>"}'
```

### ② 입장 — 샤드의 주소 받기

```bash
curl -s -X POST http://localhost:8000/enter -H 'content-type: application/json' -d '{"token":"<①의 token>"}'
```

답: `{"page":"http://<publicHost>:<port>/?token=…","ws":"ws://<publicHost>:<port>"}`

- 그 계정의 샤드가 내려가 있으면 여기서 띄운다. 처음은 몇 초 걸린다.
- 실패는 `{"why":"…"}` — 토큰이 틀렸거나 만료면 400, 샤드를 띄우지 못하면 503.

### ③ 주입 — WebSocket 의 첫 글로 토큰을 보낸다

`ws` 로 열고 **첫 글**로 `Host 2` 에 토큰을 담는다. 글은 전부 JSON 텍스트 프레임이다.

```js
const ws = new WebSocket(enter.ws);
ws.onopen = () => ws.send(JSON.stringify({ step: 'Host 2', credential: login.token }));
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  // {step:'Link 1', open:{bodies, brains, cycles}}   맡은 body 번호들 — 고르지 않는다
  // {step:'Link 1', reject:{why}}                   뒤이어 close 4002
  // {step:'Link 2', body, delta}                    박자마다 body 마다 차분(첫 창은 통째, null 은 무대 뒤)
};
// 선택: ws.send(JSON.stringify({ step: 'Link 3', input: { body, actionId, targets: [] } }))
```

엔진이 이미 가진 클라이언트는 이렇게 주입한다.

- 브라우저 뷰어 — `page` 를 그대로 연다. 뷰어가 `?token=` 을 읽어 `Host 2` 로 보낸다. 페이지와 샤드가 다른 주소면 `?ws=` 를 붙인다.
- 엔진의 에이전트 앱 — `--token` 이 자격이다. `--account` 는 기록의 이름일 뿐이다.

```bash
npm run agent -- --url ws://localhost:3100 --account me --token "<token>" --brain llm
```

### ④ 그 뒤

- `Link 2` 의 delta 는 직전 창 위에 엔진 `web/host/link/link.ts` 의 `restore()` 규칙으로 복원한다. 다른 클라이언트의 체크리스트는 엔진 `web/ONLINE.md` §2.8.
- 닫힘 코드는 사용자에게 글로 보인다.

| 코드 | 뜻 |
|---|---|
| 4000 | 같은 계정이 다른 곳에서 붙었다 — 나중 접속이 이긴다 |
| 4002 | 거절 — 토큰이 틀렸거나 만료, 또는 그 세계에 줄 빈 묶음이 없다 |
| 1001 | 샤드가 내려갔다(쉼 · 운영자 · 서비스 종료) — ② 부터 다시 |

- 끊긴 뒤 다시 붙을 때 토큰이 만료되었으면 저장한 subject 로 ① 부터 다시.

## 4. 알아둘 것

- **토큰 수명** — 사람의 토큰은 `service.config.json` 의 `tokenTtl`(21600 초 = 6 시간). 짧게 두는 것은 페이지 URL(`?token=`)이 브라우저 기록에 남기 때문이다.
- **토큰은 계정 그 자체다.** 같은 계정으로 두 번째 접속이 오면 먼저 것이 4000 으로 끊긴다. 브라우저로 노는 계정의 토큰으로 봇을 붙이면 브라우저가 밀려난다.
- **한 세계에 사람은 하나다.** 다른 계정의 토큰으로 남의 샤드에 붙으면 서명이 맞아도 빈 묶음이 없어 4002 다. 봇과 사람이 한 세계에 드는 길은 아직 없다([피드백 2](../design/00-feedback/feedback.md)).
- **게스트 subject 는 사실상 비밀번호다.** 아는 사람이 그 계정이 된다. 외부에 널리 열기 전에 진짜 신원 제공자가 필요하다([피드백 1](../design/00-feedback/feedback.md)).

## 5. 운영

키는 길고 무작위로 만들고 서비스 프로세스의 환경변수로만 둔다. 설정 파일 · 저장소 · 클라이언트에 두지 않는다.

```bash
export HOST_AUTH_KEY="$(openssl rand -base64 32)"
```

공개 주소로 열면 `/enter` 가 `https://…` · `wss://…` 주소를 답한다.

```bash
SERVICE_PUBLIC_HOST=play.example.com SERVICE_SECURE=1 npm start
```

샤드의 포트 범위(`fleet.ports`, 기본 3100 – 3199)가 밖에서 닿아야 하고 TLS 는 플랫폼이 종단한다.
키를 바꾸면 이미 낸 토큰은 전부 무효가 된다. 서비스를 다시 띄우면 새 샤드는 새 키로 뜬다(도는 샤드는 옛 키 — 내렸다 띄운다).

### 서비스 없이 토큰을 직접 만들 때

키를 가진 신뢰하는 서버 쪽 도구 · 시험에서만. 같은 키로 띄운 엔진 어디에나 통한다(그 세계에 그 계정에 줄 빈 묶음이 있어야 열린다).

```bash
node -e 'const c=require("crypto");const id="tester",exp=Math.floor(Date.now()/1000)+3600,b=`hkt1.${id}.${exp}`;console.log(`${b}.${c.createHmac("sha256",process.env.HOST_AUTH_KEY).update(b).digest("base64url")}`)'
```

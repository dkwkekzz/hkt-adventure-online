# 서명 키와 토큰 — 설정 · 발급 · 주입

서비스와 엔진은 **키 하나**(`HOST_AUTH_KEY`)를 같이 든다. 서비스는 그 키로 토큰을 서명해 내고, 엔진(호스트)의 Gate 는 같은 키로 토큰을 검증한다.
클라이언트는 키를 들지 않는다 — 서비스에서 토큰을 받아 엔진에 붙을 때 내밀 뿐이다.

설계의 근거는 [흐름 2 로그인](../design/01-flows/02-login.md) · [흐름 8 캐릭터](../design/01-flows/08-character.md) · [흐름 3 입장](../design/01-flows/03-enter.md) · [account 책임](../design/02-roles/account.md), 엔진 쪽 사실은 엔진의 `web/ONLINE.md` §1.2(와이어 포맷) · §1.3(자격)이다.

## 1. 키 하나가 쓰이는 자리

서비스를 띄울 때 환경변수로 준다. 엔진에 따로 줄 필요는 없다 — 서비스가 세계(샤드)를 띄울 때 넘긴다.

```bash
HOST_AUTH_KEY=change-me npm start
```

| 어디 | 하는 일 | 코드 |
|---|---|---|
| 서비스의 Signer | 로그인한 사람에게 계정의 토큰을, 캐릭터를 고르면 캐릭터의 토큰을 서명해 낸다. `/characters` · `/enter` · 게이트웨이에서 토큰을 푼다. 호스트에는 접속마다 새로 낸 캐릭터의 토큰을 준다 | `src/account/signer.ts` |
| 엔진(호스트) 프로세스 | 서비스가 세계를 띄울 때 환경변수 `HOST_AUTH_KEY` 로 넘긴다. 엔진의 Gate 가 이것으로 접속의 토큰을 검증한다 | `src/fleet/spawner.ts` → 엔진 `web/host/gate.ts` |
| NPC 에이전트 | 키를 받지 않는다. 서비스가 NPC 계정(`service.config.json` 의 `fleet.npc.account`)의 토큰을 `agentTtl`(300 초)로 내어 `--token` 으로 준다. 에이전트를 다시 띄울 때마다 새로 낸다 | `src/fleet/shard.ts` 의 spawnAgent |

키가 없으면 서비스는 시작하지 않는다(흐름 1 — 토큰 없는 서비스는 외부에 열지 않는다).
엔진을 서비스 없이 `npm run dev` 로만 띄우고 키를 주지 않으면 예전처럼 이름 글이 그대로 계정이다(개발 · 테스트 · play).
엔진은 머리글에 어느 쪽인지 찍는다 — `자격: 서명된 토큰(HOST_AUTH_KEY)` 또는 `자격: 이름 글(더미)`.

## 2. 토큰의 모양

```text
hkt1.<Account.id>.<만료 epoch 초>.<sig>
sig = base64url( HMAC-SHA256(key, "hkt1.<Account.id>.<만료>") )
```

- id 는 공백 · `.` 없이 64 자 안. 머리 글자가 어느 토큰인지 말한다 — `a` 와 16 진 12 자는 **계정의 토큰**(`a9bd25feaf7f9` — Api 에만), `p` 와 16 진 12 자는 **캐릭터의 토큰**(`p0c1d…` — 입장 · 게이트웨이 · 호스트). 엔진에게는 캐릭터가 계정이다(`host.Account.id` = Character.id).
- 엔진의 Gate 는 접속의 첫 글에서 머리(`hkt1`) · 모양 · 서명 · 만료를 보고, 하나라도 틀리면 `Link 1 reject` 뒤 close **4002**.
- 검증은 **접속할 때 한 번**이다. 열린 연결은 만료가 지나도 끊기지 않는다.
- 토큰 안의 id 는 누구나 읽을 수 있다(비밀이 아니다). 비밀은 키다.

## 3. 새 클라이언트 — 받고 주입하기

Unreal · 다른 웹 클라이언트 · 봇 모두 같은 다섯 단계다.

### ① 로그인 — 토큰 받기

```bash
curl -s -X POST http://localhost:8000/login -H 'content-type: application/json' -d '{"provider":"guest"}'
```

답: `{"token":"hkt1.a….….…","subject":"…"}` — 계정의 토큰. 차단된 계정이면 `{"why":"차단된 계정이다"}`(400).

- `subject` 는 **클라이언트가 저장한다.** 같은 subject 로 다시 로그인하면 같은 계정 · 같은 세계다. 브라우저의 게스트 페이지는 localStorage 의 `hkt.guest` 에 둔다.
- 제공자는 지금 `guest` 하나. subject 는 8 ~ 64 자의 영문 · 숫자 · `_` · `-`.

```bash
curl -s -X POST http://localhost:8000/login -H 'content-type: application/json' -d '{"provider":"guest","subject":"<저장해 둔 subject>"}'
```

### ①' 캐릭터 — 고르고 캐릭터의 토큰 받기

```bash
curl -s -X POST http://localhost:8000/characters -H 'content-type: application/json' -d '{"token":"<①의 token>"}'                    # {"characters":[{"id":"p…","name":"…"}]}
curl -s -X POST http://localhost:8000/create -H 'content-type: application/json' -d '{"token":"<①의 token>","name":"이름"}'       # {"character":{"id":"p…","name":"이름"}}
curl -s -X POST http://localhost:8000/choose -H 'content-type: application/json' -d '{"token":"<①의 token>","character":"p…"}'  # {"token":"hkt1.p….….…"}
curl -s -X POST http://localhost:8000/delete -H 'content-type: application/json' -d '{"token":"<①의 token>","character":"p…"}'  # {"deleted":"p…"}
```

- 계정마다 `characterLimit`(4) 까지. 이름은 1 ~ 24 자, 그 계정 안에서 겹치지 않는다.
- 캐릭터의 토큰 수명은 `characterTtl`(3600 초) — 계정의 토큰보다 짧다.
- 놀고 있는 캐릭터(세션이 있다)는 지우지 못한다 — 접속을 끊고 유예(`session.graceMs`)가 지난 뒤.

### ② 입장 — 세계의 주소 받기

```bash
curl -s -X POST http://localhost:8000/enter -H 'content-type: application/json' -d '{"token":"<①'"'"'의 캐릭터의 token>"}'
```

답: `{"page":"http://<서비스>/play?token=…&ws=…","gate":"ws://<publicHost>:8002"}` — page 는 서비스가 주는 뷰어 페이지, gate 는 게이트웨이의 주소(모두 같다). 세계(호스트)의 주소는 오지 않는다 — 클라이언트는 게이트웨이 하나로 붙고, 게이트웨이가 호스트와 잇는다.

- 세계가 내려가 있으면 여기서 띄운다. 처음은 몇 초 걸린다.
- 존의 인스턴스가 다 찼고(`zones[].capacity`) 더 띄울 곳도 없으면(`fleet.node.slots`) `{"wait":N}`(200) — 대기열의 순번. 잠시 뒤 같은 것을 다시 묻는다. 슬롯이 나면 다음 물음이 주소를 받는다. `session.queueForgetMs` 동안 묻지 않으면 줄에서 빠진다.
- 한 계정은 한때에 캐릭터 하나 — 다른 캐릭터로 들어가면 앞 캐릭터의 접속은 4000 으로 닫힌다.
- 입장의 세션은 `session.pendingMs` 안에 게이트웨이에 붙지 않으면 지워진다.
- 실패는 `{"why":"…"}` — 토큰이 틀렸거나 만료 · 캐릭터의 토큰이 아니다 · 차단 · 닫힌 존이면 400, 세계를 띄우지 못했거나 게이트웨이가 없으면 503.

### ③ 주입 — WebSocket 의 첫 글로 토큰을 보낸다

`gate` 로 열고 **첫 글**로 `Host 2` 에 토큰을 담는다. 글은 전부 JSON 텍스트 프레임이다. 게이트웨이는 첫 글의 토큰만 읽어 누구인지 알고, 호스트에는 그때 새로 낸 토큰을 보낸다 — 나머지 글은 그대로 넘긴다.

```js
const ws = new WebSocket(enter.gate);
ws.onopen = () => ws.send(JSON.stringify({ step: 'Host 2', credential: chosen.token })); // 캐릭터의 토큰
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  // {step:'Link 1', open:{bodies, brains, cycles}}   맡은 body 번호들 — 고르지 않는다
  // {step:'Link 1', reject:{why}}                   뒤이어 close 4002
  // {step:'Link 2', body, delta}                    박자마다 body 마다 차분(첫 창은 통째, null 은 무대 뒤)
};
// 선택: ws.send(JSON.stringify({ step: 'Link 3', input: { body, actionId, targets: [] } }))
```

엔진이 이미 가진 클라이언트는 이렇게 주입한다.

- 브라우저 뷰어 — `page` 를 그대로 연다. 뷰어가 `?ws=` 의 게이트웨이에 붙어 `?token=`(캐릭터의 토큰)을 `Host 2` 로 보낸다(페이지는 서비스의 주소, 게이트웨이는 다른 포트). `Link 1 open` 의 bodies 가 그 캐릭터의 묶음이다 — 처음 온 캐릭터면 엔진이 틀에서 하나 낳는다.
- **입장(②) 없이 게이트웨이에 붙으면 4002** — 세션이 없다(`{step:'Link 1', reject:{why:'세션이 없다 — 먼저 입장'}}`). 세계가 쉬어 내려갔으면 `인스턴스가 떠 있지 않다 — 다시 입장`. 계정의 토큰도 4002.
- 끊긴 뒤 `session.graceMs` 안에 다시 붙으면 같은 세션으로 이어진다(입장을 다시 하지 않아도 된다).
- 엔진의 에이전트 앱 — `--url` 은 게이트웨이, `--token` 이 자격(캐릭터의 토큰 — ②를 먼저)이다. `--account` 는 기록의 이름일 뿐이다.

```bash
npm run agent -- --url ws://localhost:8002 --account me --token "<token>" --brain llm
```

### ④ 그 뒤

- `Link 2` 의 delta 는 직전 창 위에 엔진 `web/host/link/link.ts` 의 `restore()` 규칙으로 복원한다. 다른 클라이언트의 체크리스트는 엔진 `web/ONLINE.md` §2.8.
- 닫힘 코드는 사용자에게 글로 보인다.

| 코드 | 뜻 |
|---|---|
| 4000 | 같은 캐릭터가 다른 곳에서 붙었거나 같은 계정의 다른 캐릭터가 들어왔다 — 나중이 이긴다 |
| 4001 | 첫 글이 `Host 2` 가 아니거나 한계(`gateway.helloMs`) 안에 오지 않았다 |
| 4002 | 거절 — 토큰이 틀렸거나 만료 · 캐릭터의 토큰이 아니다, 입장하지 않았다(세션이 없다), 또는 그 세계에 줄 빈 묶음이 없다 |
| 1001 | 세계가 내려갔다(쉼 · 운영자 · 서비스 종료) — 게이트웨이가 `gateway.rerouteMs` 를 기다린 뒤 닫는다. ② 부터 다시 |

- 끊긴 뒤 다시 붙을 때 캐릭터의 토큰이 만료되었으면 ①' 부터, 계정의 토큰도 만료되었으면 저장한 subject 로 ① 부터 다시.

## 4. 알아둘 것

- **토큰 수명** — 계정의 토큰은 `service.config.json` 의 `tokenTtl`(21600 초 = 6 시간), 캐릭터의 토큰은 `characterTtl`(3600 초). 캐릭터의 것을 짧게 두는 것은 페이지 URL(`?token=`)이 브라우저 기록에 남기 때문이다.
- **캐릭터의 토큰은 캐릭터 그 자체다.** 같은 캐릭터로 두 번째 접속이 오면 먼저 것이 4000 으로 끊긴다. 한 계정은 한때에 캐릭터 하나다 — 봇을 사람과 같이 놀리려면 다른 계정의 캐릭터로.
- **한 세계에 사람 여럿.** 캐릭터마다 자기 묶음을 받는다. 봇(에이전트 앱)도 자기 캐릭터의 토큰으로 붙으면 자기 묶음을 받아 사람과 같은 세계에 든다. 끊은 캐릭터의 묶음은 세계에서 빠져 기다리다 다시 오면 그 자리에 선다.
- **게스트 subject 는 사실상 비밀번호다.** 아는 사람이 그 계정이 된다. 외부에 널리 열기 전에 진짜 신원 제공자가 필요하다([피드백 1](../design/00-feedback/feedback.md)).

## 5. 운영

키는 길고 무작위로 만들고 서비스 프로세스의 환경변수로만 둔다. 설정 파일 · 저장소 · 클라이언트에 두지 않는다.

```bash
export HOST_AUTH_KEY="$(openssl rand -base64 32)"
```

공개 주소로 열면 `/enter` 가 `https://…` · `wss://…` 주소를 답한다. 서비스 앞에 프록시가 서서 페이지의 주소가 `https://<호스트>:<PORT>/play` 와 다르면 `SERVICE_PAGE_URL` 로, 게이트웨이의 주소가 `wss://<호스트>:<GATE_PORT>` 와 다르면 `SERVICE_GATE_URL` 로 준다.

```bash
SERVICE_PUBLIC_HOST=play.example.com SERVICE_SECURE=1 npm start
```

밖에서 닿아야 하는 것은 Api(`PORT`, 기본 8000)와 게이트웨이(`GATE_PORT`, 기본 8002) 둘이다. 세계의 포트(`fleet.ports`)는 게이트웨이만 닿으면 된다 — 내부망. TLS 는 플랫폼이 종단한다.
키를 바꾸면 이미 낸 토큰은 전부 무효가 된다. 서비스를 다시 띄우면 세계는 새 키로 뜬다(도는 세계는 옛 키 — 내렸다 띄운다).

### 서비스 없이 토큰을 직접 만들 때

키를 가진 신뢰하는 서버 쪽 도구 · 시험에서만. 같은 키로 띄운 엔진 어디에나 통한다(그 세계에 그 계정에 줄 빈 묶음이 있어야 열린다).

```bash
node -e 'const c=require("crypto");const id="tester",exp=Math.floor(Date.now()/1000)+3600,b=`hkt1.${id}.${exp}`;console.log(`${b}.${c.createHmac("sha256",process.env.HOST_AUTH_KEY).update(b).digest("base64url")}`)'
```

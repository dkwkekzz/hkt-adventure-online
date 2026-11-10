# hkt-adventure-online

[hkt-adventure-proto](https://github.com/dkwkekzz/hkt-adventure-proto) 의 엔진을 프로세스로 띄워 사람에게 여는 서비스.
로그인(게스트)하면 모두가 같은 세계(엔진의 호스트 하나 + NPC 에이전트 하나 + Store 자리 하나)에 붙고, 계정마다 자기 요정 파티 하나를 맡는다. 브라우저는 서명된 토큰으로 세계에 바로 붙는다.
접속을 끊은 파티는 세계에서 빠져 기다리고, 다시 오면 그 자리에 선다. 사람이 아무도 없이 한동안 쉬면 세계는 저장하고 내려가고, 다시 오면 이어간다. 입장의 한계는 성능(capacity)뿐이다.

```bash
npm install
```

```bash
npm run engine
```

```bash
HOST_AUTH_KEY=change-me npm start
```

http://localhost:8000/ 을 열고 「들어가기」. 설계는 [design/README.md](design/README.md), 진행은 [plan/README.md](plan/README.md), 규약은 [CLAUDE.md](CLAUDE.md). 키와 토큰 — 새 클라이언트가 토큰을 받아 붙는 법은 [notes/auth-token.md](notes/auth-token.md).

# hkt-adventure-online

[hkt-adventure-proto](https://github.com/dkwkekzz/hkt-adventure-proto) 의 엔진을 프로세스로 띄워 사람에게 여는 서비스.
로그인(게스트)하면 계정마다 세계(샤드 — 엔진의 호스트 하나 + NPC 에이전트 하나 + Store 자리 하나)가 하나씩 서고, 브라우저는 그 샤드의 뷰어에 서명된 토큰으로 바로 붙는다.
사람이 떠나 한동안 쉬면 샤드는 저장하고 내려가고, 다시 오면 같은 세계에서 이어간다.

```bash
npm install
```

```bash
npm run engine
```

```bash
HOST_AUTH_KEY=change-me npm start
```

http://localhost:8000/ 을 열고 「들어가기」. 설계는 [design/README.md](design/README.md), 진행은 [plan/README.md](plan/README.md), 규약은 [CLAUDE.md](CLAUDE.md).

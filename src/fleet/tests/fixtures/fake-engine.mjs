// 가짜 엔진 — 함대의 테스트가 엔진 체크아웃 대신 띄운다. tsx 의 자리에 서서 dev · agent 의 말(엔진 web/ONLINE.md §1)만 흉내 낸다.
//   dev:   argv 를 <store>/argv.json 에, 머리글(host … · 새 세계 | 저장된 세계에서 이어간다 — now N), stdin 의 Console 글(status · grant · stop …)
//          접속은 http GET /join?account=이름 을 열어 둔 동안 — status 의 접속 칸에 든다. stop · SIGINT 면 <store>/snapshot.json 에 now 를 쓰고 멈춤 — … · exit 0
//          데이터셋 이름에 refuse 가 있으면 데이터셋 거부 — exit 2. silent 가 있으면 머리글을 찍지 않는다
//   agent: --url 의 포트로 /join?account=<--account> 를 열고, 닫히면 exit 0
import { createServer, get } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const [entry, ...argv] = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
};

if (entry === 'apps/agent/main.ts') {
  const url = new URL(flag('--url').replace(/^ws/, 'http'));
  const account = flag('--account');
  const req = get({ host: url.hostname, port: url.port, path: `/join?account=${account}&token=${flag('--token')}` }, (res) => {
    console.log(`agent ${flag('--url')} · account ${account} · bodies 1 · brain fsm`);
    res.on('data', () => {});
    res.on('close', () => process.exit(0));
  });
  req.on('error', () => process.exit(1));
  setInterval(() => console.log('창 하나'), 50); // 두뇌가 창마다 찍는 줄
} else {
  const dataset = argv[0];
  const port = Number(flag('--port'));
  const store = flag('--store');
  mkdirSync(store, { recursive: true });
  writeFileSync(join(store, 'argv.json'), JSON.stringify({ argv, key: process.env.HOST_AUTH_KEY ?? null, port: process.env.PORT ?? null }));
  if (dataset.includes('refuse')) {
    console.error(`[dev] 데이터셋 거부 — ${dataset}`);
    process.exit(2);
  }
  const snap = join(store, 'snapshot.json');
  let now = existsSync(snap) ? JSON.parse(readFileSync(snap, 'utf8')).now : 0;
  let beats = 0;
  const links = new Map(); // account → res
  const grants = [];
  const g = flag('--grant');
  if (g !== null) grants.push(g);
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/join') return void res.end('page');
    const account = u.searchParams.get('account');
    links.get(account)?.end();
    res.writeHead(200);
    res.write('open\n');
    links.set(account, res);
    req.on('close', () => links.get(account) === res && links.delete(account));
  });
  const tick = setInterval(() => {
    beats++;
    now++;
  }, 20);
  const status = () => `beats ${beats} · now ${now} · 돈다 · 접속 ${[...links.keys()].map((a) => `${a}(b1, b2)`).join(' ') || '-'} · 명부 ${grants.join(' ') || '(비었다)'}`;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(tick);
    writeFileSync(snap, JSON.stringify({ now }));
    for (const r of links.values()) r.end();
    server.close();
    console.log(`\n멈춤 — beats ${beats} · now ${now} · 저장 ${store}`);
    process.exit(0);
  };
  server.listen(port, () => {
    if (dataset.includes('silent')) return;
    console.log(`host ${dataset} · ws://localhost:${port} · beat 200ms · store ${store} · saveEvery 10`);
    console.log(now > 0 ? `저장된 세계에서 이어간다 — now ${now}` : '새 세계');
    console.log(status());
    if (g !== null) console.log(`grant — ${g}`);
    console.log(`뷰어: http://localhost:${port}/`);
  });
  createInterface({ input: process.stdin }).on('line', (line) => {
    const [name, ...rest] = line.trim().split(/\s+/);
    if (name === 'status') console.log(status());
    else if (name === 'stop') stop();
    else if (name === 'grant') console.log(rest.length < 2 ? 'grant <account> <body 번호 또는 이름>' : `grant — body ${rest[1]} 는 ${rest[0]} 의 것`);
    else if (name === 'save') console.log('save — 다음 창 끝에 저장한다');
    else if (name === 'mute') {} // 답하지 않는다 — 한계 시험
    else console.log(`모르는 명령 ${name} — pause · resume · save · step · stop · grant · revoke · status`);
  });
  process.on('SIGINT', stop);
}

// 프로세스 넷이 갈렸을 때 — api · gateway · control × 2 · node × 2 를 한 시험 프로세스에 role 마다 Service 로 세우고 내부망의 글(rpc.ts)로 잇는다. 가짜 엔진 위에서.
// NodeRpc(흐름 1 의 11 · 5 의 7 · 3 의 B · 9 의 4) · SessionRpc(흐름 3 · 9 · 5 의 8) · 흐름 7 의 1 · 2(노드를 내리면 사람이 옮겨진다) · 흐름 13(활성이 내려가면 대기가 잡는다).

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Signer } from '../../../account';
import { fakeEngine, freeRange, portRange, until } from '../../../node/tests/fake';
import type { ServiceConfig } from '../config';
import { Service } from '../service';

let services: Service[] = [];
afterEach(async () => {
  // 노드부터 — 컨트롤 플레인이 남아 있어야 노드의 closing 이 흐른다
  for (const role of ['api', 'gateway', 'node', 'control'] as const) await Promise.all(services.filter((s) => s.role === role).map((s) => s.stop()));
  services = [];
}, 30_000);

type J = Record<string, any>;

/** 한 서비스의 role 하나 — 스토리지(디렉터리)는 모두가 같은 것. */
function config(root: string, engineDir: string, role: ServiceConfig['role'], rpc: ServiceConfig['rpc'], over: Partial<ServiceConfig['fleet']> = {}): ServiceConfig {
  return {
    gateway: { port: 0, helloMs: 2000, rerouteMs: 3000, pongMs: 5000, maxBytes: 65536, maxRate: 100, ipLimit: 32 },
    session: { pendingMs: 60_000, graceMs: 60_000, gateLimitMs: 120_000, queueForgetMs: 60_000 },
    zones: [{ name: 'main', dataset: 'dataset/world.json', capacity: 8, spare: 0 }],
    pageUrl: 'http://play.test/play',
    gateUrl: '',
    storage: { root, mongodbUri: null, bucket: null, leaseMs: 3000, characterHistory: 2 },
    apiPort: 0,
    monitorPort: 0,
    traceKeep: 400,
    build: 'test',
    tokenTtl: 3600,
    characterTtl: 600,
    characterLimit: 3,
    agentTtl: 60,
    keymap: 'dataset/keymaps',
    scheme: 'over',
    fleet: {
      engineDir,
      party: 'lead-1',
      viewerOut: join(root, 'viewer', 'viewer.js'),
      beat: 200,
      sparse: 10,
      npc: { account: 'npc', bodies: ['b1'] },
      ports: portRange(),
      hostName: 'localhost',
      node: { name: 'node-1', slots: 4 },
      spool: join(root, 'spool'),
      clockMs: 200,
      idleLimit: 1000,
      startLimitMs: 5000,
      stopLimitMs: 2000,
      commandLimitMs: 1000,
      restartLimit: 2,
      backupEvery: 0,
      backupKeep: 3,
      reportLimitMs: 3000,
      closingMs: 4000,
      ...over,
    },
    role,
    rpc,
    leader: { ttlMs: 1500, settleMs: 1500 },
    operators: ['console'],
    accountIdleMs: 3600_000,
  };
}

/** 넷을 띄운다 — 컨트롤 플레인 둘(먼저 뜬 것이 활성) · 노드 둘 · 게이트웨이 · API 서버. */
async function cluster() {
  const root = mkdtempSync(join(tmpdir(), 'split-'));
  const engine = fakeEngine();
  const [p0] = await freeRange();
  const rpc = (over: Partial<ServiceConfig['rpc']>): ServiceConfig['rpc'] => ({ host: 'localhost', controlPort: p0, nodePort: 0, gatewayPort: p0 + 4, limitMs: 3000, ...over });
  const start = async (c: ServiceConfig): Promise<Service> => {
    const s = await Service.start(c, 'k', process.env['SPLIT_LOG'] === undefined ? () => {} : (l) => console.log(`[${c.role} ${c.fleet.node.name}] ${l}`), 'operator-test-key');
    services.push(s);
    return s;
  };
  const control1 = await start(config(root, engine, 'control', rpc({ controlPort: p0 })));
  const control2 = await start(config(root, engine, 'control', rpc({ controlPort: p0 + 1 })));
  const node1 = await start(config(root, engine, 'node', rpc({ nodePort: p0 + 2 }), { node: { name: 'node-1', slots: 4 }, spool: join(root, 'spool-1') }));
  const node2 = await start(config(root, engine, 'node', rpc({ nodePort: p0 + 3 }), { node: { name: 'node-2', slots: 4 }, spool: join(root, 'spool-2') }));
  const gateway = await start(config(root, engine, 'gateway', rpc({})));
  const api = await start(config(root, engine, 'api', rpc({})));
  const base = `http://localhost:${api.port}`;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(base + path, { method: 'POST', body: JSON.stringify(body) });
    return { code: r.status, body: (await r.json()) as J };
  };
  /** 사람 하나 — 로그인 · 캐릭터 · 입장(활성이 서기 전이면 잠시 뒤 다시) · 게이트웨이에 붙는다 */
  const player = async (name: string) => {
    const account = (await post('/login', { provider: 'guest' })).body['token'] as string;
    const character = (await post('/create', { token: account, name })).body['character'] as { id: string };
    const token = (await post('/choose', { token: account, character: character.id })).body['token'] as string;
    let entered: J = {};
    await until(async () => {
      entered = (await post('/enter', { token })).body;
      return typeof entered['gate'] === 'string';
    }, 15_000);
    const ws = new WebSocket(entered['gate'] as string);
    const seen: J[] = [];
    let closed: number | null = null;
    ws.addEventListener('message', (m) => void seen.push(JSON.parse(String(m.data)) as J));
    ws.addEventListener('close', (e) => (closed = e.code));
    ws.addEventListener('open', () => ws.send(JSON.stringify({ step: 'Host 2', credential: token })));
    await until(() => seen.some((x) => x['step'] === 'Link 1' && x['open'] !== undefined), 10_000);
    return { id: character.id, ws, seen, opens: () => seen.filter((x) => x['step'] === 'Link 1' && x['open'] !== undefined).length, closed: () => closed };
  };
  const active = (): Service => [control1, control2].find((c) => c.elector?.role === 'active') ?? control1;
  return { control1, control2, node1, node2, gateway, api, post, player, active };
}

describe('프로세스 넷 — 내부망의 글로', () => {
  it('노드 둘이 컨트롤 플레인 하나에 알린다. 노드 하나를 내리면 그 사람은 다른 노드의 인스턴스로 옮겨진다 — 접속은 끊기지 않는다(흐름 7 의 1 · 2 ⇒ 흐름 10)', async () => {
    const { control1, control2, node1, node2, player, active } = await cluster();
    await until(() => control1.elector!.role === 'active', 10_000);
    expect(control2.elector!.role).toBe('standby');
    await until(() => active().fleet!.nodes.list().length === 2, 10_000);
    expect(active().fleet!.nodes.list().map((n) => n.name).sort()).toEqual(['node-1', 'node-2']);
    // 운영자의 명령 — 활성의 내부 주소에 OPERATOR_KEY 로 서명한 토큰(o<이름>)으로(흐름 6). 대기는 받지 않는다
    const op = async (port: number, token: string, line: string) => (await fetch(`http://localhost:${port}/operator`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: line })).text();
    const good = new Signer('operator-test-key', 3600).issue('oconsole');
    expect(await op(control1.config.rpc.controlPort, good, 'nodes')).toMatch(/node-1 · .*\n.*node-2/);
    expect(await op(control2.config.rpc.controlPort, good, 'nodes')).toMatch(/^대기의 컨트롤 플레인이다/);
    expect(await op(control1.config.rpc.controlPort, new Signer('k', 3600).issue('oconsole'), 'nodes')).toMatch(/^거절 — 운영자의 토큰이 아니다/); // 사람의 키로 낸 것
    expect(await op(control1.config.rpc.controlPort, new Signer('operator-test-key', 3600).issue('onobody'), 'nodes')).toMatch(/^거절/); // operators 에 없는 이름

    const a = await player('하나');
    const fleet = active().fleet!;
    const first = fleet.registry.all().find((i) => i.state === 'ready')!;
    const [here, there] = first.node === 'node-1' ? [node1, node2] : [node2, node1];
    expect(here.node!.runner.get(first.name)?.state).toBe('ready');
    expect(active().session!.playing(a.id)).toBe(true);

    await here.stop(); // 흐름 7 — 노드는 알리고(1) 컨트롤 플레인이 사람을 옮긴다(2). 다 옮겨지면 남은 것을 내린다
    services = services.filter((s) => s !== here);
    await until(() => a.opens() >= 2, 15_000); // 게이트웨이가 새 호스트에 다시 이었다 — 클라이언트는 Link 1 을 한 번 더 받는다
    expect(a.closed()).toBeNull();
    const moved = fleet.registry.all().find((i) => i.state === 'ready' && i.node !== first.node)!;
    expect(there.node!.runner.get(moved.name)?.state).toBe('ready');
    await until(() => fleet.registry.get(first.name)?.state === 'stopped', 5000); // 노드의 exited(흐름 7 의 6)는 글 — 조금 뒤에 닿는다
    expect(active().monitor.recent.some((t) => t.flow === 7 && t.step === 2)).toBe(true); // Mover.move — 노드의 closing 을 받아
    a.ws.close(1000);
  }, 60_000);

  it('활성 컨트롤 플레인이 내려가면 대기가 자리를 잡고 보고에서 세션을 다시 세운다 — 사람의 접속은 끊기지 않고, 새 입장은 새 활성이 받는다(흐름 13)', async () => {
    const { control1, control2, player } = await cluster();
    await until(() => control1.elector!.role === 'active', 10_000);
    const a = await player('하나');
    await control1.stop(); // 흐름 7 의 9 — 자리를 놓는다
    services = services.filter((s) => s !== control1);
    await until(() => control2.elector!.role === 'active', 10_000);
    expect(control2.elector!.term).toBeGreaterThan(1);
    await until(() => control2.session!.playing(a.id), 10_000); // 노드의 보고에서 다시 섰다(흐름 13 의 5)
    expect(control2.monitor.recent.some((t) => t.flow === 13 && t.step === 5)).toBe(true);
    const b = await player('둘'); // 새 활성이 받는다
    expect(control2.session!.playing(b.id)).toBe(true);
    expect(a.closed()).toBeNull();
    expect(a.opens()).toBe(1); // 옮기지 않았다 — 같은 호스트에 그대로
    a.ws.close(1000);
    b.ws.close(1000);
  }, 60_000);
});

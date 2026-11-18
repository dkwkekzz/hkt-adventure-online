// Probe.read · Scheduler.place · Runner.start · Runner.exited · Runner.reap · Recoverer.recover · Loader.load · unload · save · recover · Backuper.backup · upload
// · Scaler.balance · Nodes.register · heartbeat · dead · NodeReporter.report · Operator.command
// (흐름 1 의 7 ~ 11 · 3 의 B · 4 · 5 · 6 · 7 의 1 ~ 6 · 9 의 5 ~ 7 · 10 의 5 ~ 7 · 12 · 13 의 3 · 6) — 가짜 엔진 위에서.
// 컨트롤 플레인의 반(Fleet)과 노드의 반(NodeAgent)을 같은 프로세스에 함수로 잇는다(개발의 main 과 같다). 세션 모듈의 기능은 가짜 함수.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from '../../storage';
import type { ControlSocket, NodeSocket } from '../../protocol/node';
import type { TraceInput } from '../../protocol/observe';
import type { StorageSocket } from '../../protocol/storage';
import { Fleet, NodeAgent, bundleViewer } from '..';
import type { FleetConfig, FleetHooks, FleetZone } from '..';
import { Probe } from '../probe';
import { fakeEngine, join_, portRange, until } from './fake';

const NPC = { account: 'npc', bodies: ['b1', 'b2'] };
let closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.map((c) => c()));
  closers = [];
});

const store = (root = mkdtempSync(join(tmpdir(), 'st-'))) => openStorage({ root, mongodbUri: null, bucket: null, leaseMs: 5000, characterHistory: 3 });
const ZONES: FleetZone[] = [
  { name: 'main', dataset: 'dataset/world.json', capacity: 2, spare: 0 },
  { name: 'meadow', dataset: 'dataset/meadow.json', capacity: 2, spare: 0, npc: ['m1'] },
];

/** 노드 하나를 세운다 — 컨트롤 플레인(ControlSocket)에 함수로 잇는다. */
async function nodeOn(control: ControlSocket, storage: StorageSocket, config: FleetConfig, name: string, traces: TraceInput[], log: string[], spool = config.spool, start = true) {
  const node = new NodeAgent(
    {
      engineDir: config.engineDir,
      party: config.party,
      beat: config.beat,
      sparse: config.sparse,
      npcAccount: config.npc.account,
      ports: name === 'node-1' ? config.ports : portRange(),
      node: { name, slots: config.node.slots, host: 'localhost', address: name },
      spool,
      clockMs: config.clockMs,
      startLimitMs: config.startLimitMs,
      stopLimitMs: config.stopLimitMs,
      commandLimitMs: config.commandLimitMs,
      restartLimit: config.restartLimit,
      backupEvery: config.backupEvery,
      backupKeep: config.backupKeep,
      closingMs: config.closingMs,
    },
    'b1',
    storage,
    'the-key',
    (a) => `tok-${a}`,
    control,
    (l) => log.push(l),
    (t) => traces.push(t),
  );
  closers.push(() => node.close('end', false));
  if (start) await node.start('boot');
  return node;
}

async function up(over: Partial<FleetConfig> = {}, given?: StorageSocket, zones: FleetZone[] = ZONES, nodes = 1) {
  const storage = given ?? (await store());
  const log: string[] = [];
  const traces: TraceInput[] = [];
  const count = new Map<string, number>();
  const moved: string[] = [];
  const drained: string[] = [];
  const departed: string[] = [];
  const reconciled: string[] = [];
  const kicked: string[] = [];
  const root = mkdtempSync(join(tmpdir(), 'fleet-'));
  const config: FleetConfig = {
    engineDir: fakeEngine(),
    party: 'lead-1',
    viewerOut: join(root, 'viewer', 'viewer.js'),
    beat: 200,
    sparse: 10,
    npc: NPC,
    ports: portRange(),
    hostName: 'localhost',
    node: { name: 'node-1', slots: 3 },
    spool: join(root, 'spool'),
    clockMs: 60_000,
    idleLimit: 2,
    startLimitMs: 5000,
    stopLimitMs: 2000,
    commandLimitMs: 1000,
    restartLimit: 2,
    backupEvery: 0,
    backupKeep: 3,
    reportLimitMs: 60_000,
    closingMs: 2000,
    ...over,
  };
  const hooks: FleetHooks = {
    count: (i) => count.get(i) ?? 0,
    move: async (i, r) => void moved.push(`${i} ${r}`),
    drain: async (i) => (drained.push(i), 0),
    handoff: (i, c, to) => void departed.push(`${i} ${c} ${to}`),
    reconcile: (n, instances) => void reconciled.push(`${n} ${instances.map((i) => `${i.name}:${i.loaded.join(',')}`).join(' ')}`),
    tick: async () => {},
    sweep: async () => 0,
    verify: (t) => (t === 'op-token' ? 'tester' : null),
    closeZone: async (z) => void kicked.push(`close ${z}`),
    openZone: async (z) => void kicked.push(`open ${z}`),
    kick: (c) => (kicked.push(`kick ${c}`), c === 'p1'),
    ban: async (a, until) => void kicked.push(`ban ${a} ${until}`),
    unban: async (a) => void kicked.push(`unban ${a}`),
    playing: (c) => c === 'p1',
  };
  const agents = new Map<string, NodeAgent>();
  const fleet = await Fleet.open(config, zones, storage, hooks, (address) => agents.get(address) as NodeSocket, (l) => log.push(l), (t) => traces.push(t));
  closers.push(async () => fleet.close());
  for (let k = 1; k <= nodes; k++) agents.set(`node-${k}`, await nodeOn(fleet, storage, config, `node-${k}`, traces, log, k === 1 ? config.spool : join(root, `spool-${k}`)));
  await fleet.settle('boot'); // 흐름 13 의 6 — 활성
  const node = agents.get('node-1')!;
  return { fleet, node, agents, log, storage, config, traces, count, moved, drained, departed, reconciled, kicked, root };
}
const server = (n: NodeAgent, name = 'main-1') => n.runner.get(name)!;
const steps = (traces: TraceInput[], run: string) => traces.filter((t) => t.run === run).map((t) => `${t.flow}.${t.step}`);

describe('Probe.read · answers', () => {
  it('머리글 · status(사람 칸) · 멈춤 · 답', () => {
    expect(Probe.read('host dataset/x.json · ws://localhost:3000 · beat 200ms').kind).toBe('listening');
    expect(Probe.read('명령: pause · resume · save · step · stop · grant <account> <body> · revoke <body> · status  (body 는 번호 또는 이름)').kind).toBe('ready');
    const r = Probe.read('beats 3 · now 9 · 돈다 · 접속 npc(wolf-1, wolf-2) p1(fairy-1, fairy-2) · 명부 wolf-1→npc');
    expect(r).toMatchObject({ kind: 'status', status: { beats: 3, now: 9, paused: false }, accounts: ['npc', 'p1'] });
    expect(Probe.read('beats 0 · now 0 · 멈춤 · 접속 - · 명부 (비었다)')).toMatchObject({ kind: 'status', accounts: [] });
    // body 의 이름이 있으면 `이름(번호)` — 괄호가 겹친다. 낳은 묶음은 이름이 없어 번호뿐
    const nested = 'beats 9 · now 9 · 돈다 · 접속 npc(wolf-pack-1(11537), human-mother(11530)) pa1b2(fairy-1(11515), fairy-2(11516)) pc3d4(11546, 11547) · 명부 11515→pa1b2';
    expect(Probe.read(nested)).toMatchObject({ kind: 'status', accounts: ['npc', 'pa1b2', 'pc3d4'] });
    expect(Probe.read('멈춤 — beats 1 · now 2').kind).toBe('halt');
    expect(Probe.answers('grant', 'grant — body a 는 b 의 것')).toBe(true);
    expect(Probe.answers('grant', 'beats 1 · now 1 · 돈다 · 접속 - · 명부 x')).toBe(false);
    expect(Probe.answers('nope', '모르는 명령 nope — …')).toBe(true);
  });

  it('엔진의 면(plan 06) — status 의 지연 · 떠남 줄 · backup 끝 · 실패 · 건넴의 답', () => {
    expect(Probe.read('beats 3 · now 9 · 돈다 · 접속 - · 명부 (비었다) · 지연 37')).toMatchObject({ kind: 'status', status: { lag: 37 } });
    expect(Probe.read('beats 3 · now 9 · 돈다 · 접속 - · 명부 (비었다)')).toMatchObject({ kind: 'status', status: { lag: 0 } }); // 옛 호스트
    expect(Probe.read('떠남 — pa1b2 → meadow@들머리')).toEqual({ kind: 'handoff', account: 'pa1b2', to: 'meadow@들머리' });
    expect(Probe.read('떠남 — - → meadow')).toEqual({ kind: 'handoff', account: null, to: 'meadow' });
    expect(Probe.read('backup 끝 — /tmp/b 1 · now 120')).toEqual({ kind: 'backed', dir: '/tmp/b 1', now: 120, error: null });
    expect(Probe.read('backup 실패 — /tmp/b · EACCES')).toEqual({ kind: 'backed', dir: '/tmp/b', now: null, error: 'EACCES' });
    expect(Probe.answers('backup', 'backup — 다음 창 끝에 /tmp/b 에 베낀다')).toBe(true);
    expect(Probe.answers('backup', 'backup <dir>')).toBe(true);
    expect(Probe.answers('backup', 'backup 끝 — /tmp/b · now 3')).toBe(false); // 끝 줄은 답이 아니다
    expect(Probe.answers('load', 'load — pa1 의 묶음 fairy-1(3), 41')).toBe(true);
    expect(Probe.answers('unload', 'unload 거절 — 맡은 묶음이 없다')).toBe(true);
    expect(Probe.answers('keep', 'keep — 2 묶음')).toBe(true);
  });
});

describe('Scheduler.place · Runner.start — 흐름 3 의 B', () => {
  it('존에 인스턴스 `<존>-<번호>` 를 띄운다 — 줄(세대)을 적고, 노드가 건넴 자리를 든 호스트를 키와 띄우고, NPC 묶음을 grant 하고 에이전트를 붙인다. 슬롯이 차면 띄울 곳이 없다', async () => {
    const { fleet, node, storage, config, traces } = await up();
    expect(fleet.ready('main')).toEqual([]);
    expect(await fleet.launch('main', 'b1', 'r1')).toBe(true);
    const s = server(node);
    expect(s.state).toBe('ready');
    expect(fleet.ready('main')).toEqual([{ name: 'main-1', build: 'b1' }]);
    expect(fleet.address('main-1')).toBe(`ws://localhost:${s.port}`); // 노드의 host — 게이트웨이가 잇는다
    expect(steps(traces, 'r1')).toEqual(['3.10', '3.11', '3.13', '3.14', '3.15', '3.16', '3.17', '3.17', '3.18', '3.12', '3.19']);
    expect(await storage.database.get('instances', 'main-1')).toMatchObject({ zone: 'main', node: 'node-1', port: s.port, epoch: 1, build: 'b1', state: 'ready', draining: false, restarts: 0 });
    const seen = JSON.parse(readFileSync(join(s.store!, 'argv.json'), 'utf8'));
    expect(seen.key).toBe('the-key');
    expect(seen.port).toBeNull(); // 서비스의 PORT 는 새지 않는다
    expect(seen.argv).toEqual(['dataset/world.json', '--port', String(s.port), '--store', s.store, '--beat', '200', '--sparse', '10', '--party', 'lead-1', '--handoff', join(config.spool, 'main-1')]);
    expect(await node.console.command('main-1', 'status')).toMatch(/^beats \d+ · now \d+ · 돈다 · 접속 .* · 명부 b1→npc b2→npc · 지연 0$/); // NPC 묶음은 주소를 답하기 전에 묶였다

    // 한 존에 인스턴스 여럿 — 다음은 main-2, 다른 존은 그 존의 데이터셋 · NPC 묶음으로
    expect(await fleet.launch('main', 'b1')).toBe(true);
    expect(await fleet.launch('meadow', 'b1')).toBe(true);
    expect(fleet.ready('main').map((i) => i.name)).toEqual(['main-1', 'main-2']);
    expect(await fleet.command('meadow-1', 'status', 'r')).toMatch(/명부 m1→npc/);
    expect(await fleet.launch('main', 'b1')).toBe(false); // slots 3 이 찼다
    expect(await fleet.launch('main', 'b2')).toBe(false); // 그 빌드의 노드가 없다
    expect(await fleet.launch('elsewhere', 'b1')).toBe(false); // 모르는 존
  });

  it('노드 둘 — 가장 빈 노드에 띄운다. cordon 한 노드에는 띄우지 않는다', async () => {
    const { fleet, agents } = await up({}, undefined, ZONES, 2);
    expect(fleet.nodes.list().map((n) => n.name)).toEqual(['node-1', 'node-2']);
    await fleet.launch('main', 'b1');
    await fleet.launch('main', 'b1');
    expect(fleet.registry.all().map((i) => `${i.name}@${i.node}`)).toEqual(['main-1@node-1', 'main-2@node-2']);
    expect(agents.get('node-2')!.runner.get('main-2')?.state).toBe('ready');
    await fleet.nodes.cordon('node-1');
    await fleet.launch('meadow', 'b1');
    expect(fleet.registry.get('meadow-1')?.node).toBe('node-2');
  });

  it('한꺼번에 띄워도 한 존에 하나씩 — 뜨는 가운데 온 것은 그것을 기다린다', async () => {
    const { fleet, log } = await up();
    expect(await Promise.all([fleet.launch('main', 'b1'), fleet.launch('main', 'b1'), fleet.launch('main', 'b1')])).toEqual([true, true, true]);
    expect(log.filter((l) => l.includes('호스트를 띄운다'))).toHaveLength(1);
  });

  it('포트가 없으면 · 데이터셋 거부(exit 2) · NPC 묶음 거부면 failed — 거부는 셈을 한계 너머로, 그 존은 운영자가 볼 때까지 띄우지 않는다', async () => {
    const p = portRange()[0];
    const none = await up({ ports: [p, p - 1] }); // 빈 범위
    await expect(none.fleet.launch('main', 'b1')).rejects.toThrow(/빈 포트/);
    expect(none.fleet.registry.get('main-1')).toMatchObject({ state: 'failed', restarts: 1 });

    const bad = await up({}, undefined, [{ name: 'main', dataset: 'dataset/refuse.json', capacity: 2, spare: 0 }]);
    await expect(bad.fleet.launch('main', 'b1')).rejects.toThrow(/exit 2/);
    expect(bad.fleet.registry.get('main-1')).toMatchObject({ state: 'failed', restarts: 3 });
    expect(await bad.fleet.launch('main', 'b1')).toBe(false); // 다시 띄우지 않는다
    expect(bad.log.filter((l) => l.includes('호스트를 띄운다'))).toHaveLength(1);

    const nogrant = await up({}, undefined, [{ name: 'main', dataset: 'dataset/nogrant.json', capacity: 2, spare: 0 }]);
    await expect(nogrant.fleet.launch('main', 'b1')).rejects.toThrow(/NPC 묶음을 묶지 못했다 — grant npc b1 → 모르는 명령/);
    expect(server(nogrant.node).host).toBeNull();

    const silent = await up({ startLimitMs: 300 }, undefined, [{ name: 'main', dataset: 'dataset/silent.json', capacity: 2, spare: 0 }]);
    await expect(silent.fleet.launch('main', 'b1')).rejects.toThrow(/머리글이 300ms/);
    expect(silent.fleet.registry.get('main-1')).toMatchObject({ state: 'failed', restarts: 1 });
    expect(silent.node.ports.used.size).toBe(0); // 포트를 돌려줬다
  });

  it('starting 에 stop 을 받으면 띄움은 그만두고 stopped(셈 없음)', async () => {
    const { fleet, node } = await up();
    const entering = fleet.launch('main', 'b1');
    const refused = expect(entering).rejects.toThrow(/뜨는 가운데 내렸다/);
    await until(() => node.runner.get('main-1')?.host != null);
    await fleet.stop('main-1');
    await refused;
    expect(fleet.registry.get('main-1')).toMatchObject({ state: 'stopped', restarts: 0 });
  });
});

describe('bundleViewer · NodeAgent.start — 흐름 1 의 2 · 7 ~ 11', () => {
  it('뷰어를 한 번 묶는다. 엔트리가 없으면 시작 거부', async () => {
    const { config, traces } = await up();
    await bundleViewer(config.engineDir, config.viewerOut, (t) => traces.push(t), 'r', () => {});
    expect(readFileSync(config.viewerOut, 'utf8')).toContain('fake viewer');
    expect(existsSync(`${config.viewerOut}.map`)).toBe(true);
    await expect(bundleViewer(fakeEngine({ viewer: false }), config.viewerOut, () => {}, 'r', () => {})).rejects.toThrow(/뷰어를 묶지 못했다 — exit 1 — .*Could not resolve/);
  });

  it('노드의 시작 — 엔진이 있는가 · 지난 실행이 남긴 프로세스를 끝낸다(reap) · 남은 캐릭터 파일을 저장한다(recover) · 컨트롤 플레인에 알린다', async () => {
    const { fleet, node, storage, config, traces, log } = await up();
    expect(steps(traces, 'boot').filter((s) => s.startsWith('1.'))).toEqual(['1.7', '1.8', '1.9', '1.10', '1.11']);
    expect(fleet.nodes.get('node-1')).toMatchObject({ address: 'node-1', host: 'localhost', build: 'b1', slots: 3 });
    await fleet.launch('main', 'b1');
    const pids = [server(node).host!.pid];
    // 노드가 통째로 죽은 셈 — 같은 spool 로 새 노드가 뜬다. 지난 프로세스를 끝내고, 남은 캐릭터 파일(저장하지 못한 것)을 저장한다
    mkdirSync(join(config.spool, 'main-1'), { recursive: true });
    writeFileSync(join(config.spool, 'main-1', 'p9.json'), '{"value":7}');
    const again = await nodeOn(fleet, storage, config, 'node-1', traces, log, config.spool);
    expect(traces.filter((t) => t.run === 'boot' && t.flow === 1 && t.step === 8).at(-1)).toMatchObject({ counts: { reaped: 2 } }); // 호스트와 에이전트
    await until(() => pids.every((p) => !existsSync(`/proc/${p}`)));
    expect(traces.filter((t) => t.flow === 1 && t.step === 9).at(-1)).toMatchObject({ end: 'ok', counts: { saved: 1, dropped: 0 } });
    const out = join(mkdtempSync(join(tmpdir(), 'v-')), 'v.json');
    expect(await storage.characters.read('p9', out)).toBe(true);
    expect(readFileSync(out, 'utf8')).toBe('{"value":7}');
    expect(again.runner.servers.size).toBe(0);
  });
});

describe('Runner.exited · Recoverer.recover — 흐름 4 · 12', () => {
  it('에이전트가 끝나면 다시 띄운다. 호스트가 죽으면 노드가 알리고 — 줄을 failed 로 · lease 를 끊고 · 사람을 다시 배정하게 하고 · 같은 이름으로 다시 띄운다', async () => {
    const { fleet, node, storage, moved, traces } = await up();
    await fleet.launch('main', 'b1');
    const s = server(node);
    const first = s.agent!;
    first.kill('SIGKILL');
    await until(() => s.agent !== null && s.agent !== first, 3000);
    expect(s.agentRestarts).toBe(1);

    expect(await fleet.load('main-1', 'p1', null, 'r')).toBeNull();
    s.host!.kill('SIGKILL');
    await until(() => traces.some((t) => t.flow === 12 && t.step === 6), 15000); // 다시 띄운 끝까지
    expect(moved).toHaveLength(1);
    const run = moved[0]!.split(' ')[1]!;
    expect(steps(traces, run)).toEqual(['4.4', '4.6', '4.5', '12.1', '12.2', '12.3', '3.10', '3.11', '3.13', '3.14', '3.15', '3.16', '3.17', '3.17', '3.18', '3.12', '3.19', '12.6']);
    expect(traces.find((t) => t.run === run && t.step === 2 && t.flow === 12)).toMatchObject({ state: 'failed', counts: { restarts: 1 } });
    expect(fleet.registry.get('main-1')).toMatchObject({ state: 'ready', epoch: 2, restarts: 0 });
    expect(await storage.leases.acquire('p1', 'x@1')).not.toBeNull(); // 죽은 세대의 lease 는 끊겼다
    expect(node.loader.of('main-1')).toEqual([]);
  });

  it('셈이 한계를 넘으면 failed 로 둔다', async () => {
    const { fleet, node, traces } = await up({ restartLimit: 0 });
    await fleet.launch('main', 'b1');
    server(node).host!.kill('SIGKILL');
    await until(() => traces.some((t) => t.flow === 12 && t.step === 6));
    expect(traces.find((t) => t.flow === 12 && t.step === 6)).toMatchObject({ end: 'refused', state: 'failed' });
    expect(fleet.registry.get('main-1')).toMatchObject({ state: 'failed', restarts: 1 });
  });
});

describe('Nodes.heartbeat · Nodes.dead · settle — 보고와 표 (흐름 5 의 7 · 9 · 10 · 13 의 6)', () => {
  it('보고에 잇달아 없는 인스턴스는 죽은 것이고, 표에 없는 인스턴스는 내리게 한다. 로드된 캐릭터는 세션 모듈이 맞춘다', async () => {
    const { fleet, node, moved, reconciled, traces } = await up();
    await fleet.launch('main', 'b1');
    await fleet.load('main-1', 'p1', null, 'r');
    await node.tick();
    expect(reconciled.at(-1)).toBe('node-1 main-1:p1');
    expect(traces.filter((t) => t.flow === 5).map((t) => t.step)).toEqual(expect.arrayContaining([1, 2, 4, 7]));
    // 표에서 지운 셈 — 노드는 아직 돈다. 다음 보고가 그것을 내리게 한다
    const row = fleet.registry.get('main-1')!;
    await fleet.registry.remove('main-1');
    await node.tick();
    await until(() => node.runner.get('main-1')?.state === 'stopped');
    await fleet.registry.put({ ...row, state: 'ready' }); // 표에는 도는데 노드에는 없다 — 두 번이면 죽은 것
    await node.tick();
    expect(moved).toEqual([]);
    await node.tick();
    await until(() => moved.length === 1);
  });

  it('보고가 끊긴 노드의 인스턴스는 다른 노드에 다시 선다. 컨트롤 플레인이 바뀌어도 알리지 않은 노드의 인스턴스는 죽은 것이다', async () => {
    const { fleet, agents, storage, config } = await up({ reportLimitMs: 300 }, undefined, ZONES, 2);
    await fleet.launch('main', 'b1');
    expect(fleet.registry.get('main-1')?.node).toBe('node-1');
    agents.get('node-2')!.clock.run(() => agents.get('node-2')!.tick()); // node-2 만 알린다 — node-1 은 끊긴 셈
    await agents.get('node-2')!.tick();
    await new Promise((r) => setTimeout(r, 400));
    await agents.get('node-2')!.tick();
    await fleet.tick(); // 5 의 10 ⇒ 흐름 12 — node-1 을 잊고 main-1 을 다시 띄운다(살아 있는 node-2 에)
    await until(() => fleet.registry.get('main-1')?.state === 'ready' && fleet.registry.get('main-1')?.node === 'node-2', 15000);
    expect(fleet.registry.get('main-1')?.epoch).toBe(2);
    agents.get('node-2')!.clock.stop();

    // 새 컨트롤 플레인 — 표를 다시 읽고(13 의 3), 알리지 않은 노드의 인스턴스는 죽은 것이다(13 의 6 ⇒ 흐름 12)
    const traces: TraceInput[] = [];
    const moved: string[] = [];
    const other = await Fleet.open(config, ZONES, storage, { ...fleet.hooks, move: async (i) => void moved.push(i) }, () => ({}) as NodeSocket, () => {}, (t) => traces.push(t));
    closers.push(async () => other.close());
    expect(traces.filter((t) => t.flow === 13 && t.step === 3).map((t) => t.unit)).toEqual(['main-1']);
    expect(other.settled()).toBe(false); // node-2 가 아직 알리지 않았다
    await other.settle('s');
    expect(moved).toEqual(['main-1']);
  });

  it('내리던 인스턴스(stopping)의 노드가 끊기면 사람은 옮기되 다시 띄우지 않는다 — 줄은 stopped(흐름 12 의 6)', async () => {
    const { fleet } = await up({}, undefined, ZONES, 2);
    await fleet.launch('main', 'b1');
    const i = fleet.registry.get('main-1')!;
    i.state = 'stopping'; // 비우는 가운데 노드가 사라졌다
    expect(await fleet.forgetNode('node-1', 'f')).toBe(1);
    expect(fleet.registry.get('main-1')).toMatchObject({ state: 'stopped', restarts: 0 });
    expect(fleet.registry.all().filter((x) => x.state === 'ready')).toEqual([]);
  });

  it('노드가 내려간다(흐름 7 의 1) — 컨트롤 플레인이 그 노드의 사람을 옮기게 하고(2), 비거나 한계가 지나면 노드가 값을 내리고 호스트를 내리고 Store 를 올린다(3 ~ 6)', async () => {
    const { fleet, node, drained, traces } = await up({ closingMs: 300 });
    await fleet.launch('main', 'b1');
    await fleet.load('main-1', 'p1', null, 'r');
    await node.close('c');
    await until(() => traces.some((t) => t.run === 'c' && t.flow === 7 && t.step === 6));
    expect(drained).toContain('main-1');
    expect(fleet.registry.get('main-1')).toMatchObject({ state: 'stopped', draining: false });
    expect(steps(traces, 'c').filter((s) => s.startsWith('7.'))).toEqual(['7.1', '7.2', '7.3', '7.4', '7.5', '7.6']);
  });
});

describe('Loader.load · unload · save — 흐름 9 의 5 ~ 7 · 10 의 5 ~ 7 · 5 의 2', () => {
  it('lease 를 받아 값을 건넴 자리에 내려 받고 로드시킨다. 놀고 · 저장하고 · 내려 저장한 값이 다른 인스턴스에 그대로 오른다', async () => {
    const { fleet, node, storage, traces } = await up();
    await fleet.launch('main', 'b1');
    await fleet.launch('main', 'b1');
    expect(await fleet.load('main-1', 'p1', null, 'r1')).toBeNull();
    expect(steps(traces, 'r1')).toEqual(['9.5', '9.6', '9.7']);
    expect(traces.find((t) => t.run === 'r1' && t.step === 6)).toMatchObject({ counts: { found: 0 } }); // 처음 — 엔진이 틀에서 낳는다
    expect(await fleet.load('main-1', 'p1', null, 'r1')).toBeNull(); // 이미 올라 있다
    expect(await fleet.load('main-2', 'p1', null, 'r2')).toMatch(/다른 인스턴스가 들고 있다/); // 값은 한때에 한 인스턴스만
    expect(node.loader.of('main-1')).toEqual(['p1']);

    // 저장(흐름 5 의 2) — keep 한 값을 쓰고 lease 를 늦춘다. 같은 값은 다시 쓰지 않는다
    node.runner.get('main-1')!.host!.write('play p1');
    await new Promise((r) => setTimeout(r, 50));
    await node.loader.save('main-1', 's1');
    expect(traces.find((t) => t.run === 's1')).toMatchObject({ flow: 5, step: 2, end: 'ok', counts: { loaded: 1, saved: 1, lost: 0 } });
    await node.loader.save('main-1', 's2');
    expect(traces.find((t) => t.run === 's2')).toMatchObject({ counts: { saved: 0 } });

    // 내린다 — 호스트가 파일을 쓰고, 저장하고, lease 를 푼다
    expect(await fleet.unload('main-1', 'p1', 'u1')).toBeNull();
    expect(steps(traces, 'u1')).toEqual(['10.5', '10.6', '10.7']);
    expect(node.loader.of('main-1')).toEqual([]);
    expect(await fleet.unload('main-1', 'p1', 'u2')).toBeNull(); // 올라 있지 않다 — 할 일 없음
    expect(await fleet.load('main-2', 'p1', '들머리', 'r3')).toBeNull();
    expect(await fleet.command('main-2', 'status', 'r')).toMatch(/묶음 p1=1@들머리/); // 노는 동안의 값과 갈 자리
    expect(await storage.characters.versions('p1')).toHaveLength(1);
  });

  it('lease 를 잃으면(다른 곳이 잡았다) save 가 그 묶음을 호스트에서 내리고 값은 버린다', async () => {
    const { fleet, node, storage, traces } = await up();
    await fleet.launch('main', 'b1');
    await fleet.load('main-1', 'p1', null, 'r');
    await storage.leases.expire('main-1@1'); // 흐름 12 가 끊은 셈
    expect(await storage.leases.acquire('p1', 'main-2@1')).not.toBeNull();
    await node.loader.save('main-1', 's1');
    expect(traces.find((t) => t.run === 's1')).toMatchObject({ counts: { lost: 1 } });
    expect(node.loader.of('main-1')).toEqual([]);
    expect(await fleet.command('main-1', 'status', 'r')).not.toMatch(/묶음 p1/);
  });
});

describe('NodeAgent.tick · Fleet.tick — 흐름 5 의 A · C 의 12', () => {
  it('status(사람 수 · 지연) · 저장 · 백업 · 알림. 사람(세션) 없이 한계를 넘으면 내린다 — 남은 값을 내려 저장하고 Store 를 올리고 줄을 stopped 로. 다시 띄우면 이어간다', { timeout: 60_000 }, async () => {
    const { fleet, node, storage, count, traces, config } = await up({ backupEvery: 1 });
    await fleet.launch('main', 'b1');
    const s = server(node);
    count.set('main-1', 1);
    const leave = await join_(s.port!, 'p1');
    await fleet.load('main-1', 'p1', null, 'r');
    traces.length = 0;
    await node.tick();
    expect(traces.filter((t) => t.flow === 5 && t.step <= 4).map((t) => `${t.flow}.${t.step}.${t.end}`)).toEqual(['5.1.ok', '5.2.ok', '5.3.ok', '5.4.ok']);
    expect(traces.find((t) => t.flow === 5 && t.step === 1)).toMatchObject({ unit: 'main-1', counts: { players: 1, loaded: 1, idle: 0, lag: 0 } });
    expect(await storage.snapshots.list('main-1')).toHaveLength(1); // 도는 호스트의 사본(엔진의 backup)
    leave();
    count.set('main-1', 0);
    await fleet.unload('main-1', 'p1', 'r');
    for (let i = 0; i < 100 && (await node.console.command('main-1', 'status'))?.includes('접속 p1') === true; i++) await new Promise((r) => setTimeout(r, 20)); // 끊김이 닿았다
    await node.tick();
    await node.tick(); // idle 2
    traces.length = 0;
    await fleet.tick(); // idleLimit 2
    const run = traces.find((t) => t.flow === 5 && t.step === 12)!.run;
    await until(() => traces.some((t) => t.run === run && t.flow === 7 && t.step === 6), 15000);
    expect(steps(traces, run).filter((x) => !x.startsWith('5.'))).toEqual(['7.4', '4.4', '4.6', '4.5', '7.5', '7.6']);
    expect(await storage.snapshots.list('main-1')).toHaveLength(3); // 백업 둘 + 내린 뒤 올린 것
    expect(existsSync(join(s.store!, 'snapshot.json'))).toBe(true);
    await fleet.launch('main', 'b1');
    expect(server(node).resumed).toBe(true); // 같은 이름 · Store 를 잇는다
    expect(fleet.registry.get('main-1')!.epoch).toBe(2);
    expect(config.backupEvery).toBe(1);
  });

  it('예비 용량 — 빈 슬롯의 합이 spare 보다 작으면 하나 띄운다. 비우는 가운데이고 다 비운 인스턴스는 내린다', { timeout: 60_000 }, async () => {
    const { fleet, count } = await up({}, undefined, [{ name: 'main', dataset: 'dataset/world.json', capacity: 2, spare: 3 }]);
    /** 그것이 될 때까지 박자를 돌린다 — 앞의 띄움이 막 끝나는 사이의 박자는 그것을 받고, 다음 박자가 다시 한다 */
    const ticks = async (cond: () => boolean): Promise<void> => {
      for (let i = 0; i < 100 && !cond(); i++) {
        await fleet.tick();
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(cond()).toBe(true);
    };
    const state = (name: string) => fleet.registry.get(name)?.state;
    await ticks(() => state('main-1') === 'ready' && state('main-2') === 'ready'); // 0 < 3 · 2 < 3
    await fleet.tick();
    await new Promise((r) => setTimeout(r, 200));
    await fleet.tick();
    expect(fleet.registry.get('main-3')).toBeNull(); // 4 ≥ 3
    count.set('main-1', 2);
    await ticks(() => state('main-3') === 'ready'); // 2 < 3
    await fleet.registry.drain('main-2', true);
    await ticks(() => state('main-2') === 'stopped'); // 다 비웠다 — 내린다
  });
});

describe('Operator.command — 흐름 6', () => {
  it('운영자의 토큰이 아니면 거절. nodes · instances · start · drain · undrain · stop · remove · host · backup · restore · purge · cordon · uncordon · forget · close · open · kick · ban · unban · versions · rollback', async () => {
    const { fleet, storage, drained, kicked, traces } = await up();
    traces.length = 0;
    const op = (line: string) => fleet.operator.command('op-token', line);
    expect(await fleet.operator.command('nope', 'instances')).toMatch(/^거절 — 운영자의 토큰이 아니다/);
    expect(traces.map((t) => `${t.flow}.${t.step}.${t.end}`)).toEqual(['6.1.ok', '6.2.refused', '6.5.wait']);
    expect(await op('nodes')).toMatch(/^node-1 · node-1 · b1 · slots 3 · 쓰는 0 · 마지막 보고 \d+초 전$/);
    expect(await op('instances')).toBe('인스턴스 없음');
    expect(await op('start nowhere')).toBe('모르는 존 — nowhere');
    expect(await op('start main')).toMatch(/^main-1 · ready · node-1 · port \d+ · 세대 1 · 세션 0/);
    expect(await op('host main-1 grant npc b3')).toBe('grant — body b3 는 npc 의 것');
    expect(await op('host main-1 mute')).toMatch(/답 없음/);
    expect(await op('host main-1 stop')).toMatch(/stop main-1 로/);
    expect(await op('drain main-1')).toMatch(/^main-1 · ready\(비우는 가운데\)[\s\S]*옮겼다 — 0$/);
    expect(drained).toEqual(['main-1']);
    expect(fleet.ready('main')).toEqual([]); // 새 세션을 받지 않는다
    expect(await op('undrain main-1')).toMatch(/^main-1 · ready ·/);
    expect(await op('backup main-1')).toMatch(/내린 뒤에/);
    expect(await op('stop main-1')).toMatch(/^main-1 · stopped/);
    const made = (await op('backup main-1')).replace('백업했다 — ', '');
    expect(made).toMatch(/^\d{8}T\d{9}Z(-\d+)?$/);
    expect(await op(`restore main-1 ${made}`)).toBe(`되돌렸다 — ${made}`);
    expect(await op('purge main-1')).toBe('Store 와 백업을 지웠다 — main-1');
    expect(await op('remove main-1')).toBe('지웠다 — main-1');
    expect(await op('cordon node-1')).toBe('새로 띄우지 않는다 — node-1');
    expect(await op('nodes')).toMatch(/cordoned/);
    expect(await op('start main')).toBe('띄울 곳이 없다 — 노드의 slots 가 찼다');
    expect(await op('uncordon node-1')).toBe('다시 띄운다 — node-1');
    expect(await op('close main')).toMatch(/^닫았다 — main/);
    expect(await op('open main')).toBe('열었다 — main');
    expect(await op('kick p1')).toMatch(/^닫았다 — p1/);
    expect(await op('kick p2')).toBe('세션이 없다 — p2');
    expect(await op('ban a1 2099-01-01T00:00:00Z')).toMatch(/^차단했다 — a1 · 2099/);
    expect(await op('unban a1')).toBe('풀었다 — a1');
    expect(kicked).toEqual(['close main', 'open main', 'kick p1', 'kick p2', `ban a1 ${Date.parse('2099-01-01T00:00:00Z')}`, 'unban a1']);
    expect(await op('versions p2')).toBe('지난 값 없음');
    expect(await op('rollback p1 1')).toMatch(/^놀고 있다/);
    expect(await op('rollback p2 1')).toMatch(/^되돌리지 못했다/);
    expect(await op('forget node-1')).toBe('잊었다 — node-1 · 수습한 인스턴스 0');
    expect(fleet.nodes.list()).toEqual([]);
    expect(await op('what')).toMatch(/^모르는 명령 what/);
    const audit = (await storage.database.all('audit')).map(([, v]) => v as { line: string; operator: string });
    expect(audit.map((a) => a.line)).toContain(`restore main-1 ${made}`); // 흐름 6 의 3 — 명령마다 표 audit 에 한 줄, 누가
    expect(new Set(audit.map((a) => a.operator))).toEqual(new Set(['tester']));
    expect(audit.map((a) => a.line)).not.toContain('what');
  });
});

describe('Runner.line — 노드가 본 것 (흐름 4 의 3)', () => {
  it('사람 수 · 지연이 바뀐 status · 떠남 줄 · backup 끝은 4 의 1 ~ 3. 떠남은 컨트롤 플레인에 알린다(NPC 는 아니다). 흔적에 사람을 싣지 않는다', async () => {
    const { fleet, node, traces, departed, log } = await up();
    await fleet.launch('main', 'b1');
    const s = server(node);
    const leave = await join_(s.port!, 'p1');
    await node.console.command('main-1', 'status');
    await until(() => traces.some((t) => t.flow === 4 && t.step === 3 && t.counts?.['players'] === 1));
    leave();
    s.host!.write('lag 42'); // 시험의 손 — 가짜 엔진의 지연
    await new Promise((r) => setTimeout(r, 50));
    expect(await node.console.command('main-1', 'status')).toMatch(/ · 지연 42$/);
    expect(s.lag).toBe(42);
    expect(traces.find((t) => t.flow === 4 && t.step === 3 && t.counts?.['lag'] === 42)).toMatchObject({ unit: 'main-1', counts: { players: 0, lag: 42 } });

    s.host!.write('depart p1 meadow@들머리');
    s.host!.write('depart npc meadow');
    await until(() => departed.length === 1 && s.departed?.account === 'npc');
    expect(departed).toEqual(['main-1 p1 meadow@들머리']);
    expect(log.some((l) => l.includes('떠남 — p1 → meadow@들머리'))).toBe(true);

    const dir = join(mkdtempSync(join(tmpdir(), 'bk-')), 'b1');
    const waited = node.runner.backed('main-1', dir, 2000);
    expect(await node.console.command('main-1', `backup ${dir}`)).toBe(`backup — 다음 창 끝에 ${dir} 에 베낀다`);
    expect(await waited).toMatchObject({ error: null });
    expect(existsSync(join(dir, 'snapshot.json'))).toBe(true);
    expect(traces.filter((t) => t.flow === 4 && t.step === 3).at(-1)).toMatchObject({ end: 'ok', counts: { backup: s.backed!.now! } });
    expect(traces.some((t) => t.account !== undefined || t.person !== undefined)).toBe(false);
  });
});

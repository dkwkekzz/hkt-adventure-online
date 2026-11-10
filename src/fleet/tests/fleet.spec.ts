// Fleet.enter · Shard.start · Probe.read · Shard.exited · Fleet.tick · Shard.stop · Operator.command (흐름 3 · 4 · 5 · 6) — 가짜 엔진 위에서.
// 세계는 하나 — 사람은 모두 같은 세계에 붙는다. 입장의 한계는 capacity(성능)뿐이다.

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openVault } from '../../storage';
import type { VaultSocket } from '../../protocol/vault';
import { Fleet } from '..';
import type { FleetConfig } from '..';
import { Probe } from '../probe';
import { fakeEngine, join_, portRange, until } from './fake';

const NPC = { account: 'npc', bodies: ['b1', 'b2'] };
let fleets: Fleet[] = [];
afterEach(async () => {
  await Promise.all(fleets.map((f) => f.stopAll()));
  fleets = [];
});

function up(over: Partial<FleetConfig> = {}, vault: VaultSocket = openVault(mkdtempSync(join(tmpdir(), 'st-')))) {
  const log: string[] = [];
  const config: FleetConfig = {
    engineDir: fakeEngine(),
    world: 'main',
    dataset: 'dataset/world.json',
    party: 'lead-1',
    capacity: 8,
    viewerOut: join(mkdtempSync(join(tmpdir(), 'viewer-')), 'viewer.js'),
    pageUrl: 'http://example.test:8000/play',
    beat: 200,
    sparse: 10,
    npc: NPC,
    ports: portRange(),
    publicHost: 'example.test',
    secure: false,
    clockMs: 60_000,
    idleLimit: 2,
    startLimitMs: 5000,
    stopLimitMs: 2000,
    commandLimitMs: 1000,
    restartLimit: 2,
    backupEvery: 1,
    ...over,
  };
  const fleet = new Fleet(config, vault, 'the-key', (a) => `tok-${a}`, (l) => log.push(l));
  fleets.push(fleet);
  return { fleet, log, vault, config };
}
const world = (f: Fleet) => f.shardOf('main')!;

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
});

describe('Fleet.enter — 흐름 3', () => {
  it('세계의 줄을 내고 호스트를 인자(--party) · 키와 함께 띄우고, NPC 묶음을 grant 하고, NPC 에이전트를 토큰으로 붙여 주소를 답한다', async () => {
    const { fleet, vault, config } = up();
    const addr = await fleet.enter('p1', 'hkt1.p1.9.sig');
    const shard = world(fleet);
    const port = config.ports[0];
    expect(shard.state).toBe('ready');
    const ws = `ws://example.test:${port}`;
    expect(addr).toEqual({ page: `http://example.test:8000/play?token=hkt1.p1.9.sig&ws=${encodeURIComponent(ws)}`, ws });
    expect(vault.ledger.load('assignment')).toEqual({ rows: { main: { dataset: 'dataset/world.json', storeDir: shard.row.storeDir, port } } });
    expect(shard.row.storeDir.endsWith(join('shards', 'main', 'world'))).toBe(true);
    const seen = JSON.parse(readFileSync(join(shard.row.storeDir, 'argv.json'), 'utf8'));
    expect(seen.key).toBe('the-key');
    expect(seen.port).toBeNull(); // 서비스의 PORT 는 새지 않는다
    expect(seen.argv).toEqual(['dataset/world.json', '--port', String(port), '--store', shard.row.storeDir, '--beat', '200', '--sparse', '10', '--party', 'lead-1']);
    expect(await shard.command('status')).toMatch(/^beats \d+ · now \d+ · 돈다 · 접속 .* · 명부 b1→npc b2→npc$/); // NPC 묶음은 주소를 답하기 전에 묶였다
    let text = '';
    for (let i = 0; i < 50 && !text.includes('접속 npc('); i++) {
      await new Promise((r) => setTimeout(r, 50)); // NPC 에이전트가 붙는다
      text = (await shard.command('status')) ?? '';
    }
    expect(text).toMatch(/접속 npc\(/);
    expect(shard.players).toBe(0); // NPC 는 사람이 아니다
  });

  it('사람은 모두 같은 세계에 — 호스트는 한 번만 뜨고 주소의 소켓이 같다', async () => {
    const { fleet, log } = up();
    const [a, b, c] = await Promise.all([fleet.enter('p1', 't1'), fleet.enter('p2', 't2'), fleet.enter('p3', 't3')]);
    expect(log.filter((l) => l.includes('호스트를 띄운다'))).toHaveLength(1);
    expect(new Set([a!.ws, b!.ws, c!.ws]).size).toBe(1);
    expect(fleet.shards.size).toBe(1);
  });

  it('입장의 한계는 capacity 뿐 — 찼으면 거절, 이미 붙은 계정의 다시 입장은 받는다, 하나가 떠나면 다시 받는다', async () => {
    const { fleet } = up({ capacity: 2 });
    await fleet.enter('p1', 't');
    const port = world(fleet).row.port!;
    const leave1 = await join_(port, 'p1');
    const leave2 = await join_(port, 'p2');
    await expect(fleet.enter('p3', 't')).rejects.toThrow(/세계가 가득 찼다 — 사람 2 \/ 2/);
    await expect(fleet.enter('p1', 't')).resolves.toBeTruthy(); // 붙은 사람의 다시 입장(새로고침)
    leave2();
    await until(() => false, 100).catch(() => {});
    await expect(fleet.enter('p3', 't')).resolves.toBeTruthy();
    leave1();
  });

  it('포트가 다 차면 거절', async () => {
    const p = portRange()[0];
    const { fleet } = up({ ports: [p, p - 1] }); // 빈 범위
    await expect(fleet.enter('p1', 't')).rejects.toThrow(/빈 포트/);
  });

  it('데이터셋 거부(exit 2) — failed, 다시 띄우지 않는다. 머리글이 오지 않으면 한계로 failed', async () => {
    const { fleet, log } = up({ dataset: 'dataset/refuse.json' });
    await expect(fleet.enter('p1', 't')).rejects.toThrow(/exit 2/);
    expect(world(fleet).state).toBe('failed');
    await expect(fleet.enter('p2', 't')).rejects.toThrow(/샤드가 멈췄다/);
    expect(log.filter((l) => l.includes('호스트를 띄운다'))).toHaveLength(1);

    const silent = up({ dataset: 'dataset/silent.json', startLimitMs: 300 });
    await expect(silent.fleet.enter('p1', 't')).rejects.toThrow(/머리글이 300ms/);
    expect(world(silent.fleet).restarts).toBe(1);
  });

  it('NPC 묶음을 grant 하지 못하면 failed — 다시 띄우지 않는다', async () => {
    const { fleet } = up({ dataset: 'dataset/nogrant.json' });
    await expect(fleet.enter('p1', 't')).rejects.toThrow(/NPC 묶음을 묶지 못했다 — grant npc b1 → 모르는 명령/);
    expect(world(fleet).state).toBe('failed');
    expect(world(fleet).host).toBeNull();
    await expect(fleet.enter('p1', 't')).rejects.toThrow(/샤드가 멈췄다/);
  });
});

describe('Fleet.start — 흐름 1 의 6 · 7', () => {
  it('뷰어를 한 번 묶는다. 엔트리가 없으면 시작 거부', async () => {
    const { fleet, config } = up();
    await fleet.start();
    fleet.clock.stop();
    expect(readFileSync(config.viewerOut, 'utf8')).toContain('fake viewer');
    expect(existsSync(`${config.viewerOut}.map`)).toBe(true);
    const bad = up({ engineDir: fakeEngine({ viewer: false }) });
    await expect(bad.fleet.start()).rejects.toThrow(/뷰어를 묶지 못했다 — exit 1 — .*Could not resolve/);
  });
});

describe('Shard.stop — 뜨는 가운데', () => {
  it('starting 에 stop 을 받으면 입장은 거절되고 세계는 stopped(셈 없음)', async () => {
    const { fleet } = up();
    const entering = fleet.enter('p1', 't');
    await until(() => fleet.shardOf('main')?.host != null);
    await fleet.stopAll();
    await expect(entering).rejects.toThrow(/뜨는 가운데 내렸다/);
    expect(world(fleet).state).toBe('stopped');
    expect(world(fleet).restarts).toBe(0);
  });
});

describe('Shard.exited — 흐름 4', () => {
  it('에이전트가 끝나면 다시 띄운다. 호스트가 신호로 끝나면 failed 와 셈, 다음 입장이 다시 띄운다', async () => {
    const { fleet } = up();
    await fleet.enter('p1', 't');
    const shard = world(fleet);
    const first = shard.agent!;
    first.kill('SIGKILL');
    await until(() => shard.agent !== null && shard.agent !== first, 3000);
    expect(shard.agentRestarts).toBe(1);

    shard.host!.kill('SIGKILL');
    await until(() => shard.state === 'failed');
    expect(shard.restarts).toBe(1);
    await until(() => shard.agent === null);
    await fleet.enter('p1', 't');
    expect(shard.state).toBe('ready');
  });
});

describe('Fleet.tick — 흐름 5', () => {
  it('사람이 붙어 있으면 쉬지 않는다. 사람 없이 한계를 넘으면 내리고(저장), 다음 박자에 베낀다. 다시 오면 이어간다', async () => {
    const { fleet, vault } = up({ backupEvery: 1 });
    await fleet.enter('p1', 't');
    const shard = world(fleet);
    const leave = await join_(shard.row.port!, 'p1');
    await fleet.tick();
    await fleet.tick();
    await fleet.tick();
    expect(shard.players).toBe(1);
    expect(shard.idle).toBe(0);
    expect(shard.state).toBe('ready');
    leave();
    await until(() => false, 100).catch(() => {});
    await fleet.tick();
    await fleet.tick();
    await until(() => shard.state === 'stopped');
    expect(existsSync(join(shard.row.storeDir, 'snapshot.json'))).toBe(true);
    expect(vault.list(shard.row.storeDir)).toHaveLength(0);
    await fleet.tick(); // 내려간 dirty 세계를 베낀다
    expect(vault.list(shard.row.storeDir)).toHaveLength(1);
    expect(shard.dirty).toBe(false);
    await fleet.tick();
    expect(vault.list(shard.row.storeDir)).toHaveLength(1); // 돈 적이 없으면 다시 베끼지 않는다

    await fleet.enter('p1', 't');
    expect(shard.resumed).toBe(true);
  });
});

describe('Operator.command — 흐름 6', () => {
  it('shards · status · host · stop · backup · restore · revoke-port · 모르는 글', async () => {
    const { fleet } = up({ backupEvery: 0 });
    const op = fleet.operator;
    expect(await op.command('shards')).toBe('샤드 없음');
    await fleet.enter('p1', 't');
    expect(await op.command('shards')).toMatch(/^main · ready · port \d+/);
    expect(await op.command('host main grant npc b3')).toBe('grant — body b3 는 npc 의 것');
    expect(await op.command('host main status')).toMatch(/^beats \d+/);
    expect(await op.command('host main nope')).toMatch(/^모르는 명령 nope/);
    expect(await op.command('host main mute')).toMatch(/답 없음/);
    expect(await op.command('host main stop')).toMatch(/stop main 로/);
    expect(await op.command('backup main')).toMatch(/내린 뒤에/);
    expect(await op.command('stop main')).toMatch(/^main · stopped/);
    const made = (await op.command('backup main')).replace('베꼈다 — ', '');
    expect(await op.command('status main')).toContain(made);
    expect(await op.command(`restore main ${made}`)).toBe(`되돌렸다 — ${made}`);
    expect(await op.command('restore main nope')).toMatch(/실패 — 사본이 없다/);
    const port = world(fleet).row.port;
    expect(await op.command('revoke-port main')).toMatch(/비웠다/);
    expect(world(fleet).row.port).toBeNull();
    await fleet.enter('p1', 't');
    expect(world(fleet).row.port).toBe(port); // 비운 포트를 다시 받는다 — 범위의 첫 빈 것
    expect(await op.command('status nowhere')).toBe('세계가 없다 — nowhere');
    expect(await op.command('what')).toMatch(/^모르는 명령 what/);
  });

  it('세계의 자리 표는 함대를 다시 세워도 남는다 — 세계는 stopped 로, 범위 밖 포트는 비운다', async () => {
    const vault = openVault(mkdtempSync(join(tmpdir(), 'st-')));
    const a = up({}, vault);
    await a.fleet.enter('p1', 't');
    await a.fleet.stopAll();
    const b = up({ ports: a.config.ports }, vault);
    expect(world(b.fleet).state).toBe('stopped');
    expect(b.fleet.ports.used.has(a.config.ports[0])).toBe(true);
    const c = up({}, vault); // 다른 범위
    expect(world(c.fleet).row.port).toBeNull();
  });
});

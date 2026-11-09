// Fleet.enter · Shard.start · Probe.read · Shard.exited · Fleet.tick · Shard.stop · Operator.command (흐름 3 · 4 · 5 · 6) — 가짜 엔진 위에서.

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
    dataset: 'dataset/world.json',
    keymap: 'dataset/keymap.json',
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

describe('Probe.read · answers', () => {
  it('머리글 · status(사람 칸) · 멈춤 · 답', () => {
    expect(Probe.read('host dataset/x.json · ws://localhost:3000 · beat 200ms').kind).toBe('listening');
    expect(Probe.read('뷰어: http://localhost:3000/  (?account=이름 으로 자격을 바꾼다)').kind).toBe('ready');
    const r = Probe.read('beats 3 · now 9 · 돈다 · 접속 npc(wolf-1, wolf-2) p1(fairy-1, fairy-2) · 명부 wolf-1→npc');
    expect(r).toMatchObject({ kind: 'status', status: { beats: 3, now: 9, paused: false }, accounts: ['npc', 'p1'] });
    expect(Probe.read('beats 0 · now 0 · 멈춤 · 접속 - · 명부 (비었다)')).toMatchObject({ kind: 'status', accounts: [] });
    expect(Probe.read('멈춤 — beats 1 · now 2').kind).toBe('halt');
    expect(Probe.answers('grant', 'grant — body a 는 b 의 것')).toBe(true);
    expect(Probe.answers('grant', 'beats 1 · now 1 · 돈다 · 접속 - · 명부 x')).toBe(false);
    expect(Probe.answers('nope', '모르는 명령 nope — …')).toBe(true);
  });
});

describe('Fleet.enter — 흐름 3', () => {
  it('줄을 내고 호스트를 인자 · 키와 함께 띄우고 NPC 에이전트를 토큰으로 붙여 주소를 답한다', async () => {
    const { fleet, vault, config } = up();
    const addr = await fleet.enter('p1', 'hkt1.p1.9.sig');
    const shard = fleet.shardOf('p1')!;
    const port = config.ports[0];
    expect(shard.state).toBe('ready');
    expect(addr).toEqual({ page: `http://example.test:${port}/?token=hkt1.p1.9.sig`, ws: `ws://example.test:${port}` });
    expect(vault.ledger.load('assignment')).toEqual({ rows: { p1: { dataset: 'dataset/world.json', storeDir: shard.row.storeDir, port } } });
    const seen = JSON.parse(readFileSync(join(shard.row.storeDir, 'argv.json'), 'utf8'));
    expect(seen.key).toBe('the-key');
    expect(seen.port).toBeNull(); // 서비스의 PORT 는 새지 않는다
    expect(seen.argv).toEqual(['dataset/world.json', '--port', String(port), '--store', shard.row.storeDir, '--beat', '200', '--sparse', '10', '--keymap', 'dataset/keymap.json', '--grant', 'npc=b1,b2']);
    expect(await shard.command('status')).toMatch(/^beats \d+ · now \d+ · 돈다 · 접속 /);
    let text = '';
    await until(() => text.includes('접속 npc('), 3000).catch(() => {});
    for (let i = 0; i < 50 && !text.includes('접속 npc('); i++) text = (await shard.command('status')) ?? ''; // NPC 에이전트가 붙는다
    expect(text).toMatch(/접속 npc\(/);
    expect(shard.players).toBe(0); // NPC 는 사람이 아니다
  });

  it('겹친 입장은 한 번만 띄우고, 계정마다 다른 포트 · 다른 자리', async () => {
    const { fleet, log } = up();
    await Promise.all([fleet.enter('p1', 't'), fleet.enter('p1', 't'), fleet.enter('p2', 't')]);
    expect(log.filter((l) => l.startsWith('p1 fleet 호스트를 띄운다'))).toHaveLength(1);
    const [a, b] = [fleet.shardOf('p1')!, fleet.shardOf('p2')!];
    expect(a.row.port).not.toBe(b.row.port);
    expect(a.row.storeDir).not.toBe(b.row.storeDir);
  });

  it('포트가 다 차면 거절', async () => {
    const p = portRange()[0];
    const { fleet } = up({ ports: [p, p - 1] }); // 빈 범위
    await expect(fleet.enter('p1', 't')).rejects.toThrow(/빈 포트/);
  });

  it('데이터셋 거부(exit 2) — failed, 다시 띄우지 않는다. 머리글이 오지 않으면 한계로 failed', async () => {
    const { fleet, log } = up({ dataset: 'dataset/refuse.json' });
    await expect(fleet.enter('p1', 't')).rejects.toThrow(/exit 2/);
    expect(fleet.shardOf('p1')!.state).toBe('failed');
    await expect(fleet.enter('p1', 't')).rejects.toThrow(/샤드가 멈췄다/);
    expect(log.filter((l) => l.includes('호스트를 띄운다'))).toHaveLength(1);

    const silent = up({ dataset: 'dataset/silent.json', startLimitMs: 300 });
    await expect(silent.fleet.enter('p1', 't')).rejects.toThrow(/머리글이 300ms/);
    expect(silent.fleet.shardOf('p1')!.restarts).toBe(1);
  });
});

describe('Shard.stop — 뜨는 가운데', () => {
  it('starting 에 stop 을 받으면 입장은 거절되고 샤드는 stopped(셈 없음)', async () => {
    const { fleet } = up();
    const entering = fleet.enter('p1', 't');
    await until(() => fleet.shardOf('p1')?.host != null);
    await fleet.stopAll();
    await expect(entering).rejects.toThrow(/뜨는 가운데 내렸다/);
    expect(fleet.shardOf('p1')!.state).toBe('stopped');
    expect(fleet.shardOf('p1')!.restarts).toBe(0);
  });
});

describe('Shard.exited — 흐름 4', () => {
  it('에이전트가 끝나면 다시 띄운다. 호스트가 신호로 끝나면 failed 와 셈, 다음 입장이 다시 띄운다', async () => {
    const { fleet } = up();
    await fleet.enter('p1', 't');
    const shard = fleet.shardOf('p1')!;
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
    const shard = fleet.shardOf('p1')!;
    const leave = await join_(shard.row.port!, 'p1');
    await fleet.tick();
    await fleet.tick();
    await fleet.tick();
    expect(shard.players).toBe(1);
    expect(shard.idle).toBe(0);
    expect(shard.state).toBe('ready');
    leave();
    await until(() => !(shard.lastStatus?.text ?? '').includes('p1('), 100).catch(() => {});
    await fleet.tick();
    await fleet.tick();
    await until(() => shard.state === 'stopped');
    expect(existsSync(join(shard.row.storeDir, 'snapshot.json'))).toBe(true);
    expect(vault.list(shard.row.storeDir)).toHaveLength(0);
    await fleet.tick(); // 내려간 dirty 샤드를 베낀다
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
    expect(await op.command('shards')).toMatch(/^p1 · ready · port \d+/);
    expect(await op.command('host p1 grant npc b3')).toBe('grant — body b3 는 npc 의 것');
    expect(await op.command('host p1 status')).toMatch(/^beats \d+/);
    expect(await op.command('host p1 nope')).toMatch(/^모르는 명령 nope/);
    expect(await op.command('host p1 mute')).toMatch(/답 없음/);
    expect(await op.command('host p1 stop')).toMatch(/stop p1 로/);
    expect(await op.command('backup p1')).toMatch(/내린 뒤에/);
    expect(await op.command('stop p1')).toMatch(/^p1 · stopped/);
    const made = (await op.command('backup p1')).replace('베꼈다 — ', '');
    expect(await op.command('status p1')).toContain(made);
    expect(await op.command(`restore p1 ${made}`)).toBe(`되돌렸다 — ${made}`);
    expect(await op.command('restore p1 nope')).toMatch(/실패 — 사본이 없다/);
    const port = fleet.shardOf('p1')!.row.port;
    expect(await op.command('revoke-port p1')).toMatch(/비웠다/);
    expect(fleet.shardOf('p1')!.row.port).toBeNull();
    await fleet.enter('p1', 't');
    expect(fleet.shardOf('p1')!.row.port).toBe(port); // 비운 포트를 다시 받는다 — 범위의 첫 빈 것
    expect(await op.command('status nobody')).toBe('샤드가 없다 — nobody');
    expect(await op.command('what')).toMatch(/^모르는 명령 what/);
  });

  it('배정 표는 함대를 다시 세워도 남는다 — 샤드는 stopped 로, 범위 밖 포트는 비운다', async () => {
    const vault = openVault(mkdtempSync(join(tmpdir(), 'st-')));
    const a = up({}, vault);
    await a.fleet.enter('p1', 't');
    await a.fleet.stopAll();
    const b = up({ ports: a.config.ports }, vault);
    expect(b.fleet.shardOf('p1')!.state).toBe('stopped');
    expect(b.fleet.ports.used.has(a.config.ports[0])).toBe(true);
    const c = up({}, vault); // 다른 범위
    expect(c.fleet.shardOf('p1')!.row.port).toBeNull();
  });
});

// Probe.read · NodeAgent.start(Runner.reap · Loader.recover) · Spawner.bundle · Loader.load · unload · save · Runner.line
// (흐름 1 의 2 · 7 ~ 11 · 4 의 1 ~ 3 · 5 의 2 · 9 의 5 ~ 7 · 10 의 5 ~ 7) — 가짜 엔진 위에서. 컨트롤 플레인은 플릿 모듈의 시험의 세움(harness)으로.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Spawner } from '..';
import { Probe } from '../probe';
import { ZONES, closeAll, nodeOn, onClose, server, steps, store, up } from '../../fleet/tests/harness';
import { fakeEngine, join_, portRange, until } from './fake';
import type { TraceInput } from '../../protocol/observe';

afterEach(closeAll);

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


describe('Spawner.bundle · NodeAgent.start — 흐름 1 의 2 · 7 ~ 11', () => {
  it('뷰어를 한 번 묶는다. 엔트리가 없으면 시작 거부', async () => {
    const { config } = await up();
    expect(await Spawner.bundle(config.engineDir, config.viewerOut).exited).toBe(0);
    expect(readFileSync(config.viewerOut, 'utf8')).toContain('fake viewer');
    expect(existsSync(`${config.viewerOut}.map`)).toBe(true);
    const bad = Spawner.bundle(fakeEngine({ viewer: false }), config.viewerOut);
    const said: string[] = [];
    bad.onLine((_s, line) => said.push(line));
    expect(await bad.exited).toBe(1);
    expect(said.join('\n')).toMatch(/Could not resolve/);
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

describe('Runner.status — 흐름 5 의 1', () => {
  it('status 의 답이 잇달아 셋 없으면 멈춘 것이라 호스트를 끝낸다(⇒ 흐름 4 → 12). 사람도 로드도 없으면 쉰 셈을 올린다', async () => {
    const { fleet, node, moved } = await up();
    await fleet.launch('main', 'b1');
    const s = server(node);
    expect(node.runner.status('main-1', true, 0)).toBe(false);
    expect(s.idle).toBe(1);
    expect(node.runner.status('main-1', true, 1)).toBe(false);
    expect(s.idle).toBe(0); // 로드된 캐릭터가 있다
    node.runner.status('main-1', false, 0);
    node.runner.status('main-1', false, 0);
    expect(s.silent).toBe(2);
    expect(node.runner.status('main-1', false, 0)).toBe(true);
    await until(() => moved.length === 1); // 호스트가 끝났다 ⇒ 흐름 12(사람을 다시 배정하게 한다)
    await until(() => fleet.registry.get('main-1')?.epoch === 2 && fleet.registry.get('main-1')?.state === 'ready', 10_000); // 같은 이름으로 다시 섰다
  });
});

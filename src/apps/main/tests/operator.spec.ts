// Operator.command(흐름 6) — 앱의 Operator 가 명령마다 그 개념(Nodes · Registry · Scheduler · Recoverer · NodeRpc · SnapshotStore · CharacterStore)을 부른다.
// 플릿 · 노드는 플릿의 시험의 세움(harness — 가짜 엔진 위), 세션 · 계정의 기능은 가짜 함수.

import { afterEach, describe, expect, it } from 'vitest';
import { closeAll, up } from '../../../fleet/tests/harness';
import { Operator } from '../operator';

afterEach(closeAll);

describe('Operator.command — 흐름 6', () => {
  it('운영자의 토큰이 아니면 거절. nodes · instances · start · drain · undrain · stop · remove · host · backup · restore · purge · cordon · uncordon · forget · close · open · kick · ban · unban · versions · rollback', async () => {
    const { fleet, storage, drained, traces } = await up();
    traces.length = 0;
    const kicked: string[] = [];
    const operator = new Operator({
      verify: (t) => (t === 'op-token' ? 'tester' : null),
      db: storage.database,
      fleet,
      snapshots: storage.snapshots,
      values: storage.characters,
      session: {
        closeZone: async (z) => void kicked.push(`close ${z}`),
        openZone: async (z) => void kicked.push(`open ${z}`),
        kick: (c) => (kicked.push(`kick ${c}`), c === 'p1'),
        count: (i) => fleet.hooks.count(i),
        drain: (i, r) => fleet.hooks.drain(i, r),
        playing: (c) => c === 'p1',
      },
      ban: async (a, until) => void kicked.push(`ban ${a} ${until}`),
      unban: async (a) => void kicked.push(`unban ${a}`),
      trace: (t) => void traces.push(t),
    });
    const op = (line: string) => operator.command('op-token', line);
    expect(await operator.command('nope', 'instances')).toMatch(/^거절 — 운영자의 토큰이 아니다/);
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


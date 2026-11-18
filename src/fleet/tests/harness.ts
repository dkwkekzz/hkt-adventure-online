// 플릿 · 노드 모듈의 시험의 세움 — 컨트롤 플레인(Fleet)과 노드(NodeAgent)를 같은 프로세스에 함수로 잇는다(개발의 main 과 같다). 세션 모듈의 기능은 가짜 함수.
// 노드는 노드 모듈의 index(밖에 내보낸 것)로 세운다. 엔진은 가짜(node/tests/fake).

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../../storage';
import { NodeAgent } from '../../node';
import { fakeEngine, portRange } from '../../node/tests/fake';
import type { ControlSocket, NodeSocket } from '../../protocol/node';
import type { TraceInput } from '../../protocol/observe';
import type { StorageSocket } from '../../protocol/storage';
import { Fleet } from '..';
import type { FleetConfig, FleetHooks, FleetZone } from '..';

/** service.config.json 의 fleet 과 같은 꼴 — 컨트롤 플레인의 것과 노드의 것 */
export type TestConfig = FleetConfig & {
  readonly engineDir: string;
  readonly party: string;
  readonly viewerOut: string;
  readonly beat: number;
  readonly sparse: number;
  readonly ports: readonly [number, number];
  readonly hostName: string;
  readonly node: { readonly name: string; readonly slots: number };
  readonly spool: string;
  readonly startLimitMs: number;
  readonly commandLimitMs: number;
  readonly backupEvery: number;
  readonly backupKeep: number;
  readonly closingMs: number;
};

export const NPC = { account: 'npc', bodies: ['b1', 'b2'] };
let closers: (() => Promise<void>)[] = [];
/** 세운 것을 다 내린다 — spec 의 afterEach 에서 */
export async function closeAll(): Promise<void> {
  await Promise.all(closers.map((c) => c()));
  closers = [];
}
/** 시험이 세운 것을 같이 내리게 한다 */
export const onClose = (c: () => Promise<void>): void => void closers.push(c);

export const store = (root = mkdtempSync(join(tmpdir(), 'st-'))) => openStorage({ root, mongodbUri: null, bucket: null, leaseMs: 5000, characterHistory: 3 });
export const ZONES: FleetZone[] = [
  { name: 'main', dataset: 'dataset/world.json', capacity: 2, spare: 0 },
  { name: 'meadow', dataset: 'dataset/meadow.json', capacity: 2, spare: 0, npc: ['m1'] },
];

/** 노드 하나를 세운다 — 컨트롤 플레인(ControlSocket)에 함수로 잇는다. */
export async function nodeOn(control: ControlSocket, storage: StorageSocket, config: TestConfig, name: string, traces: TraceInput[], log: string[], spool = config.spool, start = true) {
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

export async function up(over: Partial<TestConfig> = {}, given?: StorageSocket, zones: FleetZone[] = ZONES, nodes = 1) {
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
  const config: TestConfig = {
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
export const server = (n: NodeAgent, name = 'main-1') => n.runner.get(name)!;
export const steps = (traces: TraceInput[], run: string) => traces.filter((t) => t.run === run).map((t) => `${t.flow}.${t.step}`);


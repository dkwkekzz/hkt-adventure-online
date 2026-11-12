// Fleet — 세계 하나와 그 프로세스 (design/02-roles/fleet.md 의 Fleet). enter 는 흐름 3, tick 은 흐름 5, stopAll 은 흐름 7 의 2.
// 사람은 모두 같은 세계에 붙는다 — 계정마다 사람의 묶음 하나는 엔진이 세운다(--party). 입장의 한계는 성능(capacity)뿐이다.
// 저장장치에는 Vault 소켓으로만, 토큰은 앱이 준 issue 로만 닿는다. 게임 명사를 모른다 — 데이터셋 · 틀 · NPC 묶음은 설정 값.

import type { Address } from '../protocol/api';
import type { TraceFn } from '../protocol/observe';
import type { VaultSocket } from '../protocol/vault';
import { Assignment } from './assignment';
import { Clock } from './clock';
import { Operator } from './operator';
import { Ports } from './ports';
import { Shard, freshRun } from './shard';
import type { ShardContext } from './shard';
import { Spawner } from './spawner';

export interface FleetConfig {
  readonly engineDir: string;
  /** 세계의 이름 — Store 자리 · 기록 · 운영자의 글이 이것으로 부른다. */
  readonly world: string;
  readonly dataset: string;
  /** 사람의 묶음의 틀 — 엔진의 --party(body 이름). */
  readonly party: string;
  /** 동시에 세계에 붙는 사람의 상한 — 성능으로 잰 값(엔진의 bench). 그 밖의 입장 제한은 없다. */
  readonly capacity: number;
  /** 뷰어의 묶음이 놓일 자리(viewer.js) — Fleet.start 가 한 번 묶는다. Static 이 준다. */
  readonly viewerOut: string;
  /** 뷰어 페이지의 주소(`…/play`) — 입장의 답이 든다. */
  readonly pageUrl: string;
  readonly beat: number;
  readonly sparse: number;
  readonly npc: { readonly account: string; readonly bodies: readonly string[] };
  readonly ports: readonly [number, number];
  readonly publicHost: string;
  readonly secure: boolean;
  readonly clockMs: number;
  /** 사람의 접속 없이 이만큼 박자가 지나면 세계를 내린다. */
  readonly idleLimit: number;
  readonly startLimitMs: number;
  readonly stopLimitMs: number;
  readonly commandLimitMs: number;
  readonly restartLimit: number;
  /** 이만큼 박자마다 내려간 세계의 자리를 베낀다. 0 이면 베끼지 않는다. */
  readonly backupEvery: number;
}

export class Fleet {
  // 데이터 — fleet.md 의 Fleet 줄 그대로
  readonly shards = new Map<string, Shard>(); // 세계의 이름 → Shard. 지금은 하나(config.world)
  readonly assignment: Assignment;
  readonly ports: Ports;
  readonly clock: Clock;
  readonly operator: Operator;
  readonly vault: VaultSocket;
  readonly config: FleetConfig;
  ticks = 0;
  private readonly ctx: ShardContext;
  private readonly log: (line: string) => void;
  /** 흔적을 남긴다 — 앱이 준 Monitor.trace(흐름 14). Shard · Operator 도 이것으로. */
  readonly trace: TraceFn;

  /**
   * 흐름 1 의 1 · 7 — 엔진 체크아웃이 없으면 시작 거부(Spawner.missing), 배정 표의 줄마다 Shard 를 stopped 로. 프로세스는 띄우지 않는다.
   * trace 는 앱이 준 Monitor.trace, run 은 흐름 1 의 것.
   */
  constructor(
    config: FleetConfig,
    vault: VaultSocket,
    key: string,
    issue: (account: string) => string,
    log: (line: string) => void = (l) => console.log(l),
    trace: TraceFn = () => {},
    run: string = freshRun(),
  ) {
    const missing = Spawner.missing(config.engineDir);
    trace({ flow: 1, step: 7, run, unit: '-', end: missing === null ? 'ok' : 'refused' });
    if (missing !== null) throw new Error(missing);
    this.trace = trace;
    this.config = config;
    this.vault = vault;
    this.assignment = new Assignment(vault.ledger);
    this.ports = new Ports(config.ports);
    this.clock = new Clock(config.clockMs);
    this.operator = new Operator(this);
    this.log = log;
    this.ctx = {
      engineDir: config.engineDir,
      beat: config.beat,
      sparse: config.sparse,
      npc: config.npc,
      party: config.party,
      publicHost: config.publicHost,
      secure: config.secure,
      pageUrl: config.pageUrl,
      startLimitMs: config.startLimitMs,
      stopLimitMs: config.stopLimitMs,
      commandLimitMs: config.commandLimitMs,
      restartLimit: config.restartLimit,
      key,
      issue,
      log,
      trace,
    };
    let lost = false;
    for (const [name, row] of this.assignment.all()) {
      if (row.port !== null && !this.ports.mark(row.port)) {
        row.port = null; // 범위 밖 — 다음 입장이 새로 받는다(흐름 1 규칙)
        lost = true;
      }
      this.shards.set(name, new Shard(name, row, this.ctx));
      trace({ flow: 1, step: 1, run, unit: name, end: 'ok', state: 'stopped', counts: { players: 0 } }); // 표의 줄마다 stopped 로 선다
    }
    if (lost) this.assignment.save();
  }

  /** start — 흐름 1 의 6 · 7. 뷰어를 한 번 묶고(Spawner.bundle) 박자를 돌린다. 묶지 못하면 시작 거부. */
  async start(run: string = freshRun()): Promise<void> {
    const job = Spawner.bundle(this.config.engineDir, this.config.viewerOut);
    const errors: string[] = [];
    job.onLine((_s, line) => errors.push(line));
    const code = await job.exited;
    this.trace({ flow: 1, step: 2, run, unit: '-', end: code === 0 ? 'ok' : 'failed', counts: { exit: code } });
    if (code !== 0) throw new Error(`뷰어를 묶지 못했다 — exit ${code}${errors.length === 0 ? '' : ` — ${errors.slice(-3).join(' / ')}`}`);
    this.log(`fleet 뷰어를 묶었다 — ${this.config.viewerOut}`);
    this.clock.run(() => this.tick());
  }

  /**
   * enter — 흐름 3 의 2 ~ 9. 세계의 줄을 찾거나 내고 Shard 를 띄워 주소를 답한다. 사람이 상한(capacity)에 찼으면 거절 — 그 밖의 거절은 없다.
   * account 는 기록의 이름 — 어느 묶음을 맡는가는 엔진의 Roster 가 토큰의 Account.id 로 정한다. token 은 주소의 ?token= 이 든다. run 은 Api 의 흐름 3 의 것.
   */
  async enter(account: string, token: string, run: string = freshRun()): Promise<Address> {
    const name = this.config.world;
    const take = async (): Promise<number> => {
      const port = await this.ports.take();
      this.trace({ flow: 3, step: 14, run, unit: name, end: port === null ? 'failed' : 'ok', account }); // Ports.take
      if (port === null) throw new Error('빈 포트가 없다');
      return port;
    };
    let row = this.assignment.get(name);
    if (row === null) {
      const port = await take();
      row = { dataset: this.config.dataset, storeDir: this.vault.dirOf(name, this.config.dataset), port };
      this.assignment.put(name, row);
    } else if (row.port === null) {
      row.port = await take();
      this.assignment.put(name, row);
    }
    let shard = this.shards.get(name);
    if (shard === undefined) {
      shard = new Shard(name, row, this.ctx);
      this.shards.set(name, shard);
    }
    if (shard.state === 'ready') {
      await shard.command('status'); // 사람 수를 지금 것으로
      const full = shard.players >= this.config.capacity && !shard.linked.includes(account);
      this.trace({ flow: 3, step: 6, run, unit: name, end: full ? 'refused' : 'ok', counts: { players: shard.players, capacity: this.config.capacity }, account }); // Placer.pick 의 일 — 슬롯이 비었는가
      if (full) throw new Error(`세계가 가득 찼다 — 사람 ${shard.players} / ${this.config.capacity}`);
    }
    await shard.start(run);
    shard.idle = 0;
    return shard.address(token);
  }

  shardOf(name: string): Shard | null {
    return this.shards.get(name) ?? null;
  }

  /** tick — 흐름 5. status 를 묻고, 사람 없이 쉰 세계를 내리고, 베낌 때면 내려간 dirty 세계를 베낀다. */
  async tick(): Promise<void> {
    this.ticks++;
    const run = freshRun();
    const ready = [...this.shards.values()].filter((s) => s.state === 'ready');
    const answers = await Promise.all(ready.map((s) => s.command('status')));
    ready.forEach((s, i) => this.trace({ flow: 5, step: 1, run, unit: s.name, end: answers[i] === null ? 'failed' : 'ok', counts: { players: s.players, idle: s.idle } })); // Console.command 의 일 — status
    for (const s of ready) {
      if (s.state !== 'ready') continue;
      s.idle = s.players === 0 ? s.idle + 1 : 0;
      if (s.idle >= this.config.idleLimit) {
        this.ctx.log(`${s.name} fleet 사람 없이 ${s.idle} 박자 — 내린다`);
        this.trace({ flow: 5, step: 12, run, unit: s.name, end: 'ok', counts: { idle: s.idle } }); // Scaler.balance 의 일 — 쉬는 세계를 내린다(⇒ 흐름 7 의 4)
        void s.stop(run);
      }
    }
    if (this.config.backupEvery > 0 && this.ticks % this.config.backupEvery === 0) {
      for (const s of this.shards.values()) {
        if (s.state === 'stopped' && s.dirty) {
          this.backup(s);
          this.trace({ flow: 5, step: 3, run, unit: s.name, end: 'ok' }); // Backuper.backup 의 일
        }
      }
    }
  }

  /** 내려간 세계의 자리를 베낀다 — 흐름 5 의 3 · 흐름 6 의 4(backup). 흔적은 부른 자리가 남긴다. */
  backup(shard: Shard): string {
    const name = this.vault.copy(shard.row.storeDir);
    shard.dirty = false;
    this.ctx.log(`${shard.name} fleet 베꼈다 — ${name}`);
    return name;
  }

  /** stopAll — 흐름 7 의 4. 살아 있는 세계를 전부 내린다. run 은 Service.stop 의 것. */
  async stopAll(run: string = freshRun()): Promise<void> {
    await Promise.all([...this.shards.values()].map((s) => s.stop(run)));
  }
}

// Fleet — 계정마다 샤드 하나 (design/02-roles/fleet.md 의 Fleet). enter 는 흐름 3, tick 은 흐름 5, stopAll 은 흐름 7 의 2.
// 저장장치에는 Vault 소켓으로만, 토큰은 앱이 준 issue 로만 닿는다. 게임 명사를 모른다 — 데이터셋 · NPC 묶음은 설정 값.

import type { Address } from '../protocol/api';
import type { VaultSocket } from '../protocol/vault';
import { Assignment } from './assignment';
import { Clock } from './clock';
import { Operator } from './operator';
import { Ports } from './ports';
import { Shard } from './shard';
import { Spawner } from './spawner';
import type { ShardContext } from './shard';

export interface FleetConfig {
  readonly engineDir: string;
  readonly dataset: string;
  readonly keymap: string | null;
  readonly beat: number;
  readonly sparse: number;
  readonly npc: { readonly account: string; readonly bodies: readonly string[] };
  readonly ports: readonly [number, number];
  readonly publicHost: string;
  readonly secure: boolean;
  readonly clockMs: number;
  /** 사람의 접속 없이 이만큼 박자가 지나면 내린다. */
  readonly idleLimit: number;
  readonly startLimitMs: number;
  readonly stopLimitMs: number;
  readonly commandLimitMs: number;
  readonly restartLimit: number;
  /** 이만큼 박자마다 내려간 샤드의 자리를 베낀다. 0 이면 베끼지 않는다. */
  readonly backupEvery: number;
}

export class Fleet {
  // 데이터 — fleet.md 의 Fleet 줄 그대로
  readonly shards = new Map<string, Shard>();
  readonly assignment: Assignment;
  readonly ports: Ports;
  readonly clock: Clock;
  readonly operator: Operator;
  readonly vault: VaultSocket;
  readonly config: FleetConfig;
  ticks = 0;
  private readonly ctx: ShardContext;
  private starting: Promise<unknown> = Promise.resolve();

  /** 흐름 1 의 4 · 5 — 배정 표의 줄마다 Shard 를 stopped 로. 프로세스는 띄우지 않는다. */
  constructor(config: FleetConfig, vault: VaultSocket, key: string, issue: (account: string) => string, log: (line: string) => void = (l) => console.log(l)) {
    const missing = Spawner.missing(config.engineDir);
    if (missing !== null) throw new Error(missing);
    this.config = config;
    this.vault = vault;
    this.assignment = new Assignment(vault.ledger);
    this.ports = new Ports(config.ports);
    this.clock = new Clock(config.clockMs);
    this.operator = new Operator(this);
    this.ctx = {
      engineDir: config.engineDir,
      keymap: config.keymap,
      beat: config.beat,
      sparse: config.sparse,
      npc: config.npc,
      publicHost: config.publicHost,
      secure: config.secure,
      startLimitMs: config.startLimitMs,
      stopLimitMs: config.stopLimitMs,
      commandLimitMs: config.commandLimitMs,
      restartLimit: config.restartLimit,
      key,
      issue,
      serial: <T>(job: () => Promise<T>): Promise<T> => {
        const next = this.starting.then(job, job);
        this.starting = next.catch(() => {});
        return next;
      },
      log,
    };
    let lost = false;
    for (const [account, row] of this.assignment.all()) {
      if (row.port !== null && !this.ports.mark(row.port)) {
        row.port = null; // 범위 밖 — 다음 입장이 새로 받는다(흐름 1 규칙)
        lost = true;
      }
      this.shards.set(account, new Shard(account, row, this.ctx));
    }
    if (lost) this.assignment.save();
  }

  /** enter — 흐름 3 의 2 ~ 8. 줄을 찾거나 내고 Shard 를 띄워 주소를 답한다. token 은 주소의 ?token= 이 든다. */
  async enter(account: string, token: string): Promise<Address> {
    let row = this.assignment.get(account);
    if (row === null) {
      const port = await this.ports.take();
      if (port === null) throw new Error('빈 포트가 없다');
      row = { dataset: this.config.dataset, storeDir: this.vault.dirOf(account, this.config.dataset), port };
      this.assignment.put(account, row);
    } else if (row.port === null) {
      const port = await this.ports.take();
      if (port === null) throw new Error('빈 포트가 없다');
      row.port = port;
      this.assignment.put(account, row);
    }
    let shard = this.shards.get(account);
    if (shard === undefined) {
      shard = new Shard(account, row, this.ctx);
      this.shards.set(account, shard);
    }
    await shard.start();
    return shard.address(token);
  }

  shardOf(account: string): Shard | null {
    return this.shards.get(account) ?? null;
  }

  /** tick — 흐름 5. status 를 묻고, 사람 없이 쉰 샤드를 내리고, 베낌 때면 내려간 dirty 샤드를 베낀다. */
  async tick(): Promise<void> {
    this.ticks++;
    const ready = [...this.shards.values()].filter((s) => s.state === 'ready');
    await Promise.all(ready.map((s) => s.command('status')));
    for (const s of ready) {
      if (s.state !== 'ready') continue;
      s.idle = s.players === 0 ? s.idle + 1 : 0;
      if (s.idle >= this.config.idleLimit) {
        this.ctx.log(`${s.account} fleet 사람 없이 ${s.idle} 박자 — 내린다`);
        void s.stop();
      }
    }
    if (this.config.backupEvery > 0 && this.ticks % this.config.backupEvery === 0) {
      for (const s of this.shards.values()) {
        if (s.state === 'stopped' && s.dirty) this.backup(s);
      }
    }
  }

  /** 내려간 샤드의 자리를 베낀다 — 흐름 5 의 4 · 흐름 6 의 5. */
  backup(shard: Shard): string {
    const name = this.vault.copy(shard.row.storeDir);
    shard.dirty = false;
    this.ctx.log(`${shard.account} fleet 베꼈다 — ${name}`);
    return name;
  }

  /** stopAll — 흐름 7 의 2. 살아 있는 샤드를 전부 내린다. */
  async stopAll(): Promise<void> {
    await Promise.all([...this.shards.values()].map((s) => s.stop()));
  }
}

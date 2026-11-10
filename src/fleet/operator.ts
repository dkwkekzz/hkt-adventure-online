// Operator — 운영자의 글 한 줄 → 답 글 한 줄 (design/02-roles/fleet.md 의 Operator, 흐름 6).

import { OPERATOR_USAGE } from '../protocol/operator';
import type { Fleet } from './fleet';
import type { Shard } from './shard';

const head = (s: Shard): string => {
  const status = s.lastStatus === null ? '-' : `beats ${s.lastStatus.beats} · now ${s.lastStatus.now}`;
  return `${s.name} · ${s.state} · port ${s.row.port ?? '-'} · ${status} · 사람 ${s.players}${s.why === null ? '' : ` · ${s.why}`}`;
};

export class Operator {
  // 데이터 — fleet(참조)
  readonly fleet: Fleet;

  constructor(fleet: Fleet) {
    this.fleet = fleet;
  }

  /** command — 흐름 6. 글 한 줄 → 답 글 한 줄. */
  async command(line: string): Promise<string> {
    const [name = '', world, ...rest] = line.trim().split(/\s+/).filter((t) => t !== '');
    if (name === '') return '';
    if (name === 'help') return OPERATOR_USAGE;
    if (name === 'shards') {
      const all = [...this.fleet.shards.values()];
      return all.length === 0 ? '샤드 없음' : all.map(head).join('\n');
    }
    if (!['status', 'start', 'stop', 'host', 'backup', 'restore', 'revoke-port'].includes(name)) return `모르는 명령 ${name} — ${OPERATOR_USAGE}`;
    if (world === undefined) return `${name} <world> — ${OPERATOR_USAGE}`;
    const shard = this.fleet.shardOf(world);
    if (shard === null) return `세계가 없다 — ${world}`;
    const down = shard.state === 'stopped' || shard.state === 'failed';

    try {
      switch (name) {
        case 'status':
          return [head(shard), shard.lastStatus?.text ?? '(status 없음)', `사본 ${this.fleet.vault.list(shard.row.storeDir).join(' ') || '없음'}`].join('\n');
        case 'start':
          shard.restarts = 0;
          await shard.start();
          return head(shard);
        case 'stop':
          await shard.stop();
          return head(shard);
        case 'host': {
          const text = rest.join(' ');
          if (text === '') return 'host <world> <Console 글>';
          if (text.split(/\s+/)[0] === 'stop') return `stop 은 stop ${world} 로`;
          return (await shard.command(text)) ?? '(답 없음 — 호스트가 내려가 있거나 한계 안에 답이 없다)';
        }
        case 'backup':
          if (!down) return `내린 뒤에 베낀다 — stop ${world}`;
          return `베꼈다 — ${this.fleet.backup(shard)}`;
        case 'restore': {
          const backup = rest[0];
          if (backup === undefined) return 'restore <world> <사본>';
          if (!down) return `내린 뒤에 되돌린다 — stop ${world}`;
          this.fleet.vault.restore(shard.row.storeDir, backup);
          shard.restarts = 0;
          shard.why = null;
          shard.state = 'stopped';
          return `되돌렸다 — ${backup}`;
        }
        case 'revoke-port': {
          if (!down) return `내린 뒤에 비운다 — stop ${world}`;
          if (shard.row.port !== null) this.fleet.ports.free(shard.row.port);
          shard.row.port = null;
          this.fleet.assignment.put(world, shard.row);
          return `포트를 비웠다 — 다음 입장이 새로 받는다`;
        }
      }
    } catch (e) {
      return `실패 — ${(e as Error).message}`;
    }
    return '';
  }
}

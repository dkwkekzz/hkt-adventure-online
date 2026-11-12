// Operator — 운영자의 글 한 줄 → 답 글 한 줄 (design/02-roles/fleet.md 의 Operator, 흐름 6).
// 흔적은 1(글을 받았다) · 3(표 audit 에 적었다 — Database.put) · 4(명령을 맡은 개념의 일 — backup · restore 는 SnapshotStore 를 부른 자리에서) · 5(답).
// start · stop 은 같은 run 으로 흐름 3 의 B · 흐름 7 의 4 를 잇는다. 운영자의 이름은 토큰(흐름 6 의 2 — plan 08) 전이라 stdin 이다.

import { OPERATOR_COMMANDS, OPERATOR_USAGE } from '../protocol/operator';
import type { TraceEnd } from '../protocol/observe';
import type { Fleet } from './fleet';
import { freshRun } from './shard';
import type { Shard } from './shard';

const head = (s: Shard): string => {
  const status = s.lastStatus === null ? '-' : `beats ${s.lastStatus.beats} · now ${s.lastStatus.now}`;
  return `${s.name} · ${s.state} · port ${s.row.port ?? '-'} · ${status} · 사람 ${s.players}${s.why === null ? '' : ` · ${s.why}`}`;
};

/** 세계 하나에 거는 명령 — shards · help 밖. */
const ON_WORLD: readonly string[] = OPERATOR_COMMANDS.filter((c) => c !== 'shards' && c !== 'help');

interface Answer {
  readonly end: TraceEnd;
  readonly text: string;
  /** 4 의 흔적을 이미 남겼다 — 부른 자리에서. */
  readonly traced?: boolean;
}

/** 운영자의 이름 — 토큰(흐름 6 의 2)이 서기 전에는 stdin 하나. */
const OPERATOR = 'stdin';

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
    const run = freshRun();
    const trace = this.fleet.trace;
    const unit = world ?? '-';
    trace({ flow: 6, step: 1, run, unit, end: (OPERATOR_COMMANDS as readonly string[]).includes(name) ? 'ok' : 'refused' });
    if (name === 'help' || !(OPERATOR_COMMANDS as readonly string[]).includes(name)) {
      trace({ flow: 6, step: 5, run, unit, end: 'wait' });
      return name === 'help' ? OPERATOR_USAGE : `모르는 명령 ${name} — ${OPERATOR_USAGE}`;
    }
    const at = Date.now();
    try {
      await this.fleet.storage.database.put('audit', `${new Date(at).toISOString()} ${run}`, { at, operator: OPERATOR, line: line.trim() });
      trace({ flow: 6, step: 3, run, unit, end: 'ok' });
    } catch (e) {
      trace({ flow: 6, step: 3, run, unit, end: 'failed' });
      trace({ flow: 6, step: 5, run, unit, end: 'wait' });
      return `실패 — 기록하지 못했다(하지 않는다) — ${(e as Error).message}`;
    }
    const answer = await this.act(name, world, rest, run);
    const shard = world === undefined ? null : this.fleet.shardOf(world);
    if (answer.traced !== true) trace({ flow: 6, step: 4, run, unit, end: answer.end, ...(shard === null ? {} : { state: shard.state }) });
    trace({ flow: 6, step: 5, run, unit, end: 'wait' });
    return answer.text;
  }

  /** 명령 하나를 맡은 개념에 넘긴다 — 흐름 6 의 4. */
  private async act(name: string, world: string | undefined, rest: string[], run: string): Promise<Answer> {
    const ok = (text: string): Answer => ({ end: 'ok', text });
    const no = (text: string): Answer => ({ end: 'refused', text });
    if (name === 'shards') {
      const all = [...this.fleet.shards.values()];
      return ok(all.length === 0 ? '샤드 없음' : all.map(head).join('\n'));
    }
    if (!ON_WORLD.includes(name)) return no(`모르는 명령 ${name} — ${OPERATOR_USAGE}`);
    if (world === undefined) return no(`${name} <world> — ${OPERATOR_USAGE}`);
    const shard = this.fleet.shardOf(world);
    if (shard === null) return no(`세계가 없다 — ${world}`);
    const down = shard.state === 'stopped' || shard.state === 'failed';

    try {
      switch (name) {
        case 'status':
          return ok([head(shard), shard.lastStatus?.text ?? '(status 없음)', `백업 ${(await this.fleet.storage.snapshots.list(world)).join(' ') || '없음'}`].join('\n'));
        case 'start':
          shard.restarts = 0;
          await shard.start(run);
          return ok(head(shard));
        case 'stop':
          await shard.stop(run);
          return ok(head(shard));
        case 'host': {
          const text = rest.join(' ');
          if (text === '') return no('host <world> <Console 글>');
          if (text.split(/\s+/)[0] === 'stop') return no(`stop 은 stop ${world} 로`);
          const answer = await shard.command(text);
          return answer === null ? { end: 'failed', text: '(답 없음 — 호스트가 내려가 있거나 한계 안에 답이 없다)' } : ok(answer);
        }
        case 'backup': {
          if (!down) return no(`내린 뒤에 백업한다 — stop ${world}`);
          const trace = (end: TraceEnd): void => this.fleet.trace({ flow: 6, step: 4, run, unit: world, end, state: shard.state });
          try {
            const made = await this.fleet.storage.snapshots.copy(world); // SnapshotStore.copy
            shard.dirty = false;
            trace('ok');
            return { end: 'ok', text: `백업했다 — ${made}`, traced: true };
          } catch (e) {
            trace('failed');
            return { end: 'failed', text: `실패 — ${(e as Error).message}`, traced: true };
          }
        }
        case 'restore': {
          const backup = rest[0];
          if (backup === undefined) return no('restore <world> <백업>');
          if (!down) return no(`내린 뒤에 되돌린다 — stop ${world}`);
          const trace = (end: TraceEnd): void => this.fleet.trace({ flow: 6, step: 4, run, unit: world, end, state: shard.state });
          try {
            await this.fleet.storage.snapshots.restore(world, backup); // SnapshotStore.restore — 다음 띄움의 pull 이 내려 받는다
          } catch (e) {
            trace('failed');
            return { end: 'failed', text: `실패 — ${(e as Error).message}`, traced: true };
          }
          shard.restarts = 0;
          shard.why = null;
          shard.state = 'stopped';
          trace('ok');
          return { end: 'ok', text: `되돌렸다 — ${backup}`, traced: true };
        }
        case 'revoke-port': {
          if (!down) return no(`내린 뒤에 비운다 — stop ${world}`);
          if (shard.row.port !== null) this.fleet.ports.free(shard.row.port);
          shard.row.port = null;
          await this.fleet.assignment.put(world, shard.row);
          return ok(`포트를 비웠다 — 다음 입장이 새로 받는다`);
        }
      }
    } catch (e) {
      return { end: 'failed', text: `실패 — ${(e as Error).message}` };
    }
    return no('');
  }
}

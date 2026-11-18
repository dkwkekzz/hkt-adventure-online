// Operator — 운영자의 글 한 줄 → 답 글 한 줄 (design/README.md 의 Operator, 흐름 6).
// 흔적은 1(글을 받았다) · 3(표 audit 에 적었다 — Database.put) · 4(명령을 맡은 개념의 일) · 5(답).
// start · stop · drain 은 같은 run 으로 흐름 3 의 B · 흐름 7 의 3 ~ 6 · 흐름 10 을 잇는다. 운영자의 이름은 토큰(흐름 6 의 2 — plan 08) 전이라 stdin 이다.
// 지금은 플릿의 명령만 — 노드 · 세션 · 계정 · 캐릭터의 명령은 plan 08.

import { OPERATOR_COMMANDS, OPERATOR_USAGE } from '../protocol/operator';
import type { TraceEnd } from '../protocol/observe';
import type { Fleet } from './fleet';
import type { Instance } from './instance';
import { freshRun } from './runner';

/** 인스턴스 한 줄 — 이름 · state · 노드 · 포트 · 세대 · 사람(세션) 수 · 지연 · 비우는 가운데 · 까닭. */
const head = (fleet: Fleet, i: Instance): string => {
  const server = fleet.runner.get(i.name);
  const status = server?.lastStatus == null || i.state !== 'ready' ? '' : ` · beats ${server.lastStatus.beats} · now ${server.lastStatus.now} · 지연 ${server.lag}`;
  const why = server?.why == null || i.state === 'ready' ? '' : ` · ${server.why}`;
  return `${i.name} · ${i.state}${i.draining ? '(비우는 가운데)' : ''} · ${i.node} · port ${i.port ?? '-'} · 세대 ${i.epoch} · 사람 ${server?.players ?? 0} · 세션 ${fleet.hooks.count(i.name)} · 로드 ${fleet.loader.of(i.name).length}${status}${i.restarts > 0 ? ` · 죽은 셈 ${i.restarts}` : ''}${why}`;
};

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
    const i = world === undefined ? null : this.fleet.registry.get(world);
    if (answer.traced !== true) trace({ flow: 6, step: 4, run, unit, end: answer.end, ...(i === null ? {} : { state: i.state }) });
    trace({ flow: 6, step: 5, run, unit, end: 'wait' });
    return answer.text;
  }

  /** 명령 하나를 맡은 개념에 넘긴다 — 흐름 6 의 4. */
  private async act(name: string, target: string | undefined, rest: string[], run: string): Promise<Answer> {
    const ok = (text: string): Answer => ({ end: 'ok', text });
    const no = (text: string): Answer => ({ end: 'refused', text });
    const fleet = this.fleet;
    if (name === 'instances') {
      const all = fleet.registry.all().filter((i) => target === undefined || i.zone === target);
      return ok(all.length === 0 ? '인스턴스 없음' : all.map((i) => head(fleet, i)).join('\n'));
    }
    if (target === undefined) return no(`${name} <${name === 'start' ? 'zone' : 'instance'}> — ${OPERATOR_USAGE}`);
    if (name === 'start') {
      if (fleet.zoneOf(target) === null) return no(`모르는 존 — ${target}`);
      for (const i of fleet.registry.all()) {
        if (i.zone !== target || i.state !== 'failed') continue;
        i.restarts = 0; // 운영자가 보았다 — 셈을 비우고 다시 띄운다
        await fleet.registry.put(i);
      }
      try {
        const up = await fleet.launch(target, fleet.build, run); // Scheduler.place ⇒ 흐름 3 의 B
        return up ? ok(fleet.registry.all().filter((i) => i.zone === target).map((i) => head(fleet, i)).join('\n')) : no('띄울 곳이 없다 — 노드의 slots 가 찼다');
      } catch (e) {
        return { end: 'failed', text: `실패 — ${(e as Error).message}` };
      }
    }
    const i = fleet.registry.get(target);
    if (i === null) return no(`인스턴스가 없다 — ${target}`);
    const down = i.state === 'stopped' || i.state === 'failed';
    const traced = (end: TraceEnd, text: string): Answer => {
      fleet.trace({ flow: 6, step: 4, run, unit: target, end, state: fleet.registry.get(target)?.state ?? i.state });
      return { end, text, traced: true };
    };
    try {
      switch (name) {
        case 'drain':
        case 'undrain': {
          await fleet.registry.drain(target, name === 'drain'); // Registry.drain
          if (name === 'undrain') return ok(head(fleet, i));
          const moved = await fleet.hooks.drain(target, run); // 남은 사람은 같은 존의 다른 인스턴스로 ⇒ 흐름 10. 비면 흐름 5 의 12 가 내린다
          return ok(`${head(fleet, i)}\n옮겼다 — ${moved}`);
        }
        case 'stop':
          if (down) return no(`이미 내려가 있다 — ${i.state}`);
          await fleet.stop(target, run); // Runner.stop ⇒ 흐름 7 의 3 ~ 6
          return ok(head(fleet, fleet.registry.get(target) ?? i));
        case 'remove':
          if (!down) return no(`내린 뒤에 지운다 — stop ${target}`);
          await fleet.registry.remove(target); // Registry.remove — Store 와 백업은 남는다(purge)
          return ok(`지웠다 — ${target}`);
        case 'host': {
          const text = rest.join(' ');
          if (text === '') return no('host <instance> <Console 글>');
          if (text.split(/\s+/)[0] === 'stop') return no(`stop 은 stop ${target} 로`);
          const answer = await fleet.console.command(target, text); // Console.command
          return answer === null ? { end: 'failed', text: '(답 없음 — 호스트가 내려가 있거나 한계 안에 답이 없다)' } : ok(answer);
        }
        case 'backup':
          if (!down) return no(`내린 뒤에 백업한다 — stop ${target} (도는 인스턴스는 흐름 5 의 3 이 백업한다)`);
          return traced('ok', `백업했다 — ${await fleet.storage.snapshots.copy(target)}`); // SnapshotStore.copy
        case 'restore': {
          const backup = rest[0];
          if (backup === undefined) return no('restore <instance> <백업>');
          if (!down) return no(`내린 뒤에 되돌린다 — stop ${target}`);
          await fleet.storage.snapshots.restore(target, backup); // SnapshotStore.restore — 다음 띄움의 pull 이 내려 받는다
          i.restarts = 0;
          i.state = 'stopped';
          await fleet.registry.put(i);
          return traced('ok', `되돌렸다 — ${backup}`);
        }
        case 'purge':
          if (!down) return no(`내린 뒤에 지운다 — stop ${target}`);
          await fleet.storage.snapshots.purge(target); // SnapshotStore.purge
          return traced('ok', `Store 와 백업을 지웠다 — ${target}`);
      }
    } catch (e) {
      return { end: 'failed', text: `실패 — ${(e as Error).message}` };
    }
    return no(`모르는 명령 ${name} — ${OPERATOR_USAGE}`);
  }
}

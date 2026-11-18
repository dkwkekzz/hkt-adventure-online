// Operator — 운영자의 글 한 줄 → 답 글 한 줄 (design/README.md 의 Operator, 흐름 6).
// 흔적은 1(글을 받았다) · 2(운영자의 토큰 — Signer.verify) · 3(표 audit 에 적었다 — Database.put) · 4(명령을 맡은 개념의 일) · 5(답).
// 세션 · 계정의 개념(ZoneMap · Router · Banlist)과 토큰의 검증은 앱이 준 함수(OperatorHooks). start · stop · drain · forget 은 같은 run 으로 흐름 3 의 B · 7 · 10 · 12 를 잇는다.

import { OPERATOR_COMMANDS, OPERATOR_USAGE } from '../protocol/operator';
import type { TraceEnd } from '../protocol/observe';
import type { Fleet } from './fleet';
import type { Instance } from './instance';
import { freshRun } from './runner';

/** 앱이 주는 것 — 운영자의 토큰과 세션 · 계정의 개념. */
export interface OperatorHooks {
  /** Signer.verify(OPERATOR_KEY) — 운영자의 토큰 → 운영자의 이름. 틀리거나 설정의 operators 에 없으면 null */
  verify(token: string): string | null;
  /** ZoneMap.close · open */
  closeZone(zone: string): Promise<void>;
  openZone(zone: string): Promise<void>;
  /** Router.kick — 그 캐릭터의 접속을 닫고(4000) 세션을 지운다. 세션이 없으면 false */
  kick(character: string, run: string): boolean;
  /** Banlist.ban · unban — 차단하면 그 계정의 세션도 내보낸다 */
  ban(account: string, until: number, run: string): Promise<void>;
  unban(account: string): Promise<void>;
  /** 그 캐릭터의 세션이 있는가 — rollback 은 세션이 없을 때만 */
  playing(character: string): boolean;
}

/** 인스턴스 한 줄 — 이름 · state · 노드 · 포트 · 세대 · 사람(세션) 수 · 지연 · 비우는 가운데 · 죽은 셈. */
const head = (fleet: Fleet, i: Instance): string => {
  const r = fleet.seen.get(i.name);
  const live = i.state === 'ready' && r !== undefined ? ` · 사람 ${r.players} · 로드 ${r.loaded.length} · 지연 ${r.lag}` : '';
  return `${i.name} · ${i.state}${i.draining ? '(비우는 가운데)' : ''} · ${i.node} · port ${i.port ?? '-'} · 세대 ${i.epoch} · 세션 ${fleet.hooks.count(i.name)}${live}${i.restarts > 0 ? ` · 죽은 셈 ${i.restarts}` : ''}`;
};

interface Answer {
  readonly end: TraceEnd;
  readonly text: string;
}

/** 존 · 인스턴스 · 노드 · 캐릭터 · 계정 가운데 무엇을 인자로 받는가. */
const TARGET: Readonly<Record<string, string>> = {
  start: 'zone',
  close: 'zone',
  open: 'zone',
  drain: 'instance',
  undrain: 'instance',
  stop: 'instance',
  remove: 'instance',
  host: 'instance',
  backup: 'instance',
  restore: 'instance',
  purge: 'instance',
  cordon: 'node',
  uncordon: 'node',
  forget: 'node',
  kick: 'character',
  versions: 'character',
  rollback: 'character',
  ban: 'account',
  unban: 'account',
};

export class Operator {
  // 데이터 — fleet(참조) · hooks(앱이 준 것 — verify · 세션 · 계정)
  readonly fleet: Fleet;
  private readonly hooks: OperatorHooks;

  constructor(fleet: Fleet, hooks: OperatorHooks) {
    this.fleet = fleet;
    this.hooks = hooks;
  }

  /** command — 흐름 6. 운영자의 토큰과 글 한 줄 → 답 글 한 줄. */
  async command(token: string, line: string): Promise<string> {
    const [name = '', target, ...rest] = line.trim().split(/\s+/).filter((t) => t !== '');
    if (name === '') return '';
    const run = freshRun();
    const trace = this.fleet.trace;
    const unit = target ?? '-';
    const known = (OPERATOR_COMMANDS as readonly string[]).includes(name);
    trace({ flow: 6, step: 1, run, unit, end: known ? 'ok' : 'refused' }); // Operator.command
    const operator = this.hooks.verify(token);
    trace({ flow: 6, step: 2, run, unit, end: operator === null ? 'refused' : 'ok' }); // Signer.verify
    if (operator === null) {
      trace({ flow: 6, step: 5, run, unit, end: 'wait' });
      return '거절 — 운영자의 토큰이 아니다(OPERATOR_KEY 로 서명한 운영자의 것)';
    }
    if (name === 'help' || !known) {
      trace({ flow: 6, step: 5, run, unit, end: 'wait' });
      return name === 'help' ? OPERATOR_USAGE : `모르는 명령 ${name} — ${OPERATOR_USAGE}`;
    }
    const at = Date.now();
    try {
      await this.fleet.storage.database.put('audit', `${new Date(at).toISOString()} ${run}`, { at, operator, line: line.trim() });
      trace({ flow: 6, step: 3, run, unit, end: 'ok' }); // Database.put
    } catch (e) {
      trace({ flow: 6, step: 3, run, unit, end: 'failed' });
      trace({ flow: 6, step: 5, run, unit, end: 'wait' });
      return `실패 — 기록하지 못했다(하지 않는다) — ${(e as Error).message}`;
    }
    let answer: Answer;
    try {
      answer = await this.act(name, target, rest, run);
    } catch (e) {
      answer = { end: 'failed', text: `실패 — ${(e as Error).message}` };
    }
    const i = target === undefined ? null : this.fleet.registry.get(target);
    trace({ flow: 6, step: 4, run, unit, end: answer.end, ...(i === null ? {} : { state: i.state }) }); // 명령을 맡은 개념의 일
    trace({ flow: 6, step: 5, run, unit, end: 'wait' }); // Operator.command — 답
    return answer.text;
  }

  /** 명령 하나를 맡은 개념에 넘긴다 — 흐름 6 의 4. */
  private async act(name: string, target: string | undefined, rest: string[], run: string): Promise<Answer> {
    const ok = (text: string): Answer => ({ end: 'ok', text });
    const no = (text: string): Answer => ({ end: 'refused', text });
    const fleet = this.fleet;
    if (name === 'nodes') {
      const all = fleet.nodes.list();
      const now = Date.now();
      return ok(all.length === 0 ? '노드 없음' : all.map((n) => `${n.name} · ${n.address} · ${n.build} · slots ${n.slots} · 쓰는 ${fleet.scheduler.used(n.name)} · 마지막 보고 ${Math.round((now - n.seen) / 1000)}초 전${n.cordoned ? ' · cordoned' : ''}${n.closing ? ' · 내려가는 가운데' : ''}`).join('\n'));
    }
    if (name === 'instances') {
      const all = fleet.registry.all().filter((i) => target === undefined || i.zone === target);
      return ok(all.length === 0 ? '인스턴스 없음' : all.map((i) => head(fleet, i)).join('\n'));
    }
    if (target === undefined) return no(`${name} <${TARGET[name] ?? '?'}> — ${OPERATOR_USAGE}`);
    switch (TARGET[name]) {
      case 'zone': {
        if (fleet.zoneOf(target) === null) return no(`모르는 존 — ${target}`);
        if (name === 'close') {
          await this.hooks.closeZone(target); // ZoneMap.close
          return ok(`닫았다 — ${target}(새 입장을 받지 않는다)`);
        }
        if (name === 'open') {
          await this.hooks.openZone(target); // ZoneMap.open
          return ok(`열었다 — ${target}`);
        }
        for (const i of fleet.registry.all()) {
          if (i.zone !== target || i.state !== 'failed') continue;
          i.restarts = 0; // 운영자가 보았다 — 셈을 비우고 다시 띄운다
          await fleet.registry.put(i);
        }
        const build = fleet.nodes.live()[0]?.build;
        if (build === undefined) return no('살아 있는 노드가 없다');
        const up = await fleet.launch(target, build, run); // Scheduler.place ⇒ 흐름 3 의 B
        return up ? ok(fleet.registry.all().filter((i) => i.zone === target).map((i) => head(fleet, i)).join('\n')) : no('띄울 곳이 없다 — 노드의 slots 가 찼다');
      }
      case 'node': {
        if (name === 'forget') {
          const n = await fleet.forgetNode(target, run); // Recoverer.recover × 인스턴스 ⇒ 흐름 12
          return ok(`잊었다 — ${target} · 수습한 인스턴스 ${n}`);
        }
        if (fleet.nodes.get(target) === null && name === 'uncordon') return no(`모르는 노드 — ${target}`);
        if (name === 'cordon') await fleet.nodes.cordon(target); // Nodes.cordon
        else await fleet.nodes.uncordon(target); // Nodes.uncordon
        return ok(`${name === 'cordon' ? '새로 띄우지 않는다' : '다시 띄운다'} — ${target}`);
      }
      case 'character': {
        if (name === 'kick') return this.hooks.kick(target, run) ? ok(`닫았다 — ${target}(값은 노드의 보고를 맞추며 내린다)`) : no(`세션이 없다 — ${target}`); // Router.kick
        if (name === 'versions') {
          const vs = await fleet.storage.characters.versions(target); // CharacterStore.versions
          return ok(vs.length === 0 ? '지난 값 없음' : vs.map((t) => `${t} · ${new Date(t).toISOString()}`).join('\n'));
        }
        const when = Number(rest[0]);
        if (!Number.isFinite(when)) return no('rollback <character> <때 — versions 의 수>');
        if (this.hooks.playing(target)) return no(`놀고 있다 — 세션이 없을 때 되돌린다(kick ${target})`);
        return (await fleet.storage.characters.rollback(target, when)) ? ok(`되돌렸다 — ${target} · ${new Date(when).toISOString()}`) : no('되돌리지 못했다 — 그때가 없거나 값을 누가 들고 있다'); // CharacterStore.rollback
      }
      case 'account': {
        if (name === 'unban') {
          await this.hooks.unban(target); // Banlist.unban
          return ok(`풀었다 — ${target}`);
        }
        const until = rest[0] === undefined ? Number.MAX_SAFE_INTEGER : Date.parse(rest[0]);
        if (!Number.isFinite(until)) return no('ban <account> [<until — ISO 때>]');
        await this.hooks.ban(target, until, run); // Banlist.ban — 그 계정의 세션도 내보낸다
        return ok(`차단했다 — ${target}${rest[0] === undefined ? '' : ` · ${new Date(until).toISOString()} 까지`}`);
      }
    }
    // 인스턴스
    const i = fleet.registry.get(target);
    if (i === null) return no(`인스턴스가 없다 — ${target}`);
    const down = i.state === 'stopped' || i.state === 'failed';
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
        const answer = await fleet.command(target, text, run); // Console.command(NodeRpc command)
        return answer === null ? { end: 'failed', text: '(답 없음 — 호스트가 내려가 있거나 한계 안에 답이 없다)' } : ok(answer);
      }
      case 'backup':
        if (!down) return no(`내린 뒤에 백업한다 — stop ${target} (도는 인스턴스는 흐름 5 의 3 이 백업한다)`);
        return ok(`백업했다 — ${await fleet.storage.snapshots.copy(target)}`); // SnapshotStore.copy
      case 'restore': {
        const backup = rest[0];
        if (backup === undefined) return no('restore <instance> <백업>');
        if (!down) return no(`내린 뒤에 되돌린다 — stop ${target}`);
        await fleet.storage.snapshots.restore(target, backup); // SnapshotStore.restore — 다음 띄움의 pull 이 내려 받는다
        i.restarts = 0;
        i.state = 'stopped';
        await fleet.registry.put(i);
        return ok(`되돌렸다 — ${backup}`);
      }
      case 'purge':
        if (!down) return no(`내린 뒤에 지운다 — stop ${target}`);
        await fleet.storage.snapshots.purge(target); // SnapshotStore.purge
        return ok(`Store 와 백업을 지웠다 — ${target}`);
    }
    return no(`모르는 명령 ${name} — ${OPERATOR_USAGE}`);
  }
}

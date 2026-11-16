// 세션 session (design/02-roles/session.md). 밖에 내보내는 것은 openSession 하나 — 그것이 낸 소켓이 SessionRpc 의 받는 쪽이다.
// 다른 모듈의 기능(계정의 owner · banned · remove, 플릿의 ready · launch · address, Signer.issue, 게이트웨이의 kick)은 앱이 준 함수로만 닿는다.
// 흐름의 단계마다 흔적을 남긴다 — 사람은 account(가명이 된다) · name · session 으로. 게이트웨이 · 노드는 계정을 모르므로 같은 run 의 이 단계들이 그 사람에게 잇는다.
// 간격(흐름 5 의 C 가운데 세션의 단계 — Gates.dead · Sessions.expired · Queue.next)은 여기서 돈다: Clock 은 플릿의 개념이라 모듈 경계 안에 같은 간격을 든다.

import { randomBytes } from 'node:crypto';
import type { TraceEnd, TraceInput } from '../protocol/observe';
import type { Attached, Entered, SessionOptions, SessionSocket, Unattached, Waiting } from '../protocol/session';
import { Admission } from './admission';
import { Gates } from './gates';
import { Placer } from './placer';
import { Queue } from './queue';
import { Router } from './router';
import type { Session } from './session';
import { Sessions } from './sessions';
import type { Zone } from './zone';
import { ZoneMap } from './zone-map';

const fresh = (): string => randomBytes(4).toString('hex');

/** 한 캐릭터의 enter · forget 은 한 번에 하나 — 그 사이에 다른 것이 끼지 않는다(흐름 8 의 「실패하면」). */
class Turns {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const next = (this.tails.get(key) ?? Promise.resolve()).then(work, work);
    const tail = next.catch(() => {});
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

/** 스토리지 · 플릿에 닿지 않았다 — 잠시 뒤 다시. */
const busy = (why: string): Unattached => ({ why, busy: true });

/** Service.start(흐름 1 의 1) — 개념들을 세우고 간격을 돌린다. 표 `zones` 를 읽는다 — 닿지 않으면 던진다. */
export async function openSession(o: SessionOptions): Promise<SessionSocket> {
  const now = o.now ?? Date.now;
  const c = o.config;
  const zoneMap = await ZoneMap.open(o.zones, o.database, o.entry);
  const sessions = new Sessions(c.pendingMs, c.graceMs, now);
  const router = new Router(o.kick);
  const admission = new Admission(o.owner, o.banned, sessions, router);
  const placer = new Placer(sessions, o.ready);
  const gates = new Gates(c.gateLimitMs, now);
  const queues = new Map<string, Queue>([...zoneMap.zones.keys()].map((z) => [z, new Queue(z, now)]));
  const turns = new Turns();

  /** 사람의 흔적 — 그 세션의 계정 · 이름 · 세션을 싣는다. */
  const mark = (flow: number, step: number, run: string, end: TraceEnd, s: { readonly account?: string; readonly name?: string; readonly id?: string } | null, extra: Partial<TraceInput> = {}): void =>
    o.trace({
      flow,
      step,
      run,
      unit: '-',
      end,
      ...(s?.account === undefined ? {} : { account: s.account }),
      ...(s?.name === undefined || s.name === '' ? {} : { name: s.name }),
      ...(s?.id === undefined ? {} : { session: s.id }),
      ...extra,
    });

  const queued = (character: string): { queue: Queue; at: number } | null => {
    for (const q of queues.values()) {
      const at = q.position(character);
      if (at !== null) return { queue: q, at };
    }
    return null;
  };

  /** 흐름 3 의 8 — 살아 있는 게이트웨이 하나. 없으면 잡은 세션을 놓고 잠시 뒤 다시. */
  const gateFor = (s: Session, run: string, held: boolean): Entered | Unattached => {
    const gate = gates.pick();
    mark(3, 8, run, gate === null ? 'failed' : 'ok', s, { unit: s.instance }); // 단위는 그 사람의 인스턴스 — 사람 보기가 인스턴스마다 묶는다
    if (gate === null) {
      if (held) sessions.drop(s.character);
      return busy('게이트웨이가 없다 — 잠시 뒤 다시');
    }
    return { gate: gate.address };
  };

  /** 줄에서 세션을 잡는다 — 흐름 5 의 14 · 11 의 6(흐름 3 의 7). 한 계정에 세션 하나 — 이미 든 계정의 사람은 줄에서 빼기만 한다. */
  const fill = (zone: Zone, run: string, flow: number, step: number): void => {
    const q = queues.get(zone.name)!;
    for (const build of q.builds()) {
      for (;;) {
        const at = placer.pick(zone, build);
        if (at === null) break;
        const w = q.next(build);
        if (w === null) break;
        if (sessions.held(w.account).length > 0 || sessions.get(w.character) !== null) continue;
        const s = sessions.hold(w.character, w.account, w.name, at.instance, build);
        mark(flow, step, run, 'ok', s, { unit: at.instance, person: 'pending', counts: { sessions: at.count + 1, capacity: zone.capacity, waiting: q.waiting.length } });
      }
    }
  };

  /** 흐름 11 의 4 ~ 6 — 세션을 지우고, 마지막 존을 적고, 난 슬롯에 줄의 사람을 세운다. 3(Loader.unload)은 plan 07 이 세운다. */
  const leave = async (s: Session, run: string): Promise<void> => {
    sessions.drop(s.character);
    mark(11, 4, run, 'ok', s, { unit: s.instance, person: 'gone', counts: { sessions: sessions.count(s.instance) } });
    const zone = zoneMap.zoneOfInstance(s.instance);
    if (zone === null) return;
    try {
      await zoneMap.remember(s.character, zone.name);
      mark(11, 5, run, 'ok', s, { unit: zone.name });
    } catch (e) {
      mark(11, 5, run, 'failed', s, { unit: zone.name });
      o.log(`session 마지막 존을 적지 못했다 — ${(e as Error).message}`);
    }
    fill(zone, run, 11, 6);
  };

  /** 흐름 5 의 C 가운데 세션의 단계 — 끊긴 게이트웨이(11) · 만료(13) · 줄(14). 8(Gates.seen)은 보고가 올 때. */
  const tick = async (): Promise<void> => {
    const run = fresh();
    for (const gate of gates.dead()) {
      const on = [...sessions.rows.values()].filter((s) => s.gate === gate && s.state === 'active');
      o.trace({ flow: 5, step: 11, run, unit: '-', end: 'ok', counts: { sessions: on.length } }); // 단위는 `-` — 게이트웨이는 인스턴스가 아니다(게이트웨이 모듈과 같다)
      for (const s of on) if (sessions.suspend(s.character, gate) !== null) mark(11, 2, run, 'wait', s, { unit: s.instance, person: 'grace' }); // ⇒ 흐름 11 의 2
    }
    const expired = sessions.expired();
    for (const s of expired) {
      if (s.state === 'pending') {
        sessions.drop(s.character);
        mark(5, 13, run, 'ok', s, { unit: s.instance, person: 'gone', counts: { sessions: sessions.count(s.instance) } }); // 접속하지 않았다 — state 칸은 단위(인스턴스)의 것이라 세션의 state 는 싣지 않는다
      } else {
        mark(5, 13, run, 'ok', s, { unit: s.instance }); // 유예가 지났다 ⇒ 흐름 11 의 3
        await leave(s, run);
      }
    }
    const before = now() - c.queueForgetMs;
    for (const zone of zoneMap.zones.values()) {
      const q = queues.get(zone.name)!;
      for (const w of q.stale(before)) mark(5, 14, run, 'ok', w, { unit: zone.name, person: 'gone', counts: { waiting: q.waiting.length } }); // 오래 묻지 않았다
      fill(zone, run, 5, 14);
    }
  };
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void tick()
      .catch((e: unknown) => o.log(`session 간격 실패 — ${(e as Error).message}`))
      .finally(() => (ticking = false));
  }, o.clockMs);
  timer.unref();

  /** 흐름 3 의 3 ~ 8 · 20 — Api.enter 가 SessionRpc enter 로. */
  const enter = async (character: string, build: string, run: string): Promise<Entered | Waiting | Unattached> => {
    let who: Awaited<ReturnType<Admission['check']>>;
    try {
      who = await admission.check(character, run);
    } catch (e) {
      mark(3, 3, run, 'failed', null);
      return busy(`스토리지에 닿지 않는다 — ${(e as Error).message}`);
    }
    if ('why' in who) {
      mark(3, 3, run, 'refused', who); // 차단이면 그 사람의 줄에 — 계정 · 이름을 안다
      return { why: who.why };
    }
    mark(3, 3, run, 'ok', who, { counts: { evicted: who.evicted.length } });
    for (const s of who.evicted) mark(3, 3, run, 'ok', s, { unit: s.instance }); // 같은 계정의 다른 캐릭터 — 세션을 지우고 그 접속을 닫게 했다(4000)
    for (const q of queues.values()) for (const w of [...q.waiting]) if (w.account === who.account && w.character !== character) q.drop(w.character);

    const held = sessions.get(character);
    const line = held === null ? queued(character) : null;
    mark(3, 4, run, 'ok', held ?? who, line === null ? {} : { counts: { wait: line.at } });
    if (held !== null) return gateFor(held, run, false);
    if (line !== null) return { wait: line.at }; // ⇒ 21

    let zone: Zone;
    try {
      const z = await zoneMap.zoneOf(character);
      if ('shut' in z) {
        mark(3, 5, run, 'refused', who, { unit: z.shut.name });
        return { why: `존이 닫혔다 — ${z.shut.name}` };
      }
      zone = z.zone;
    } catch (e) {
      mark(3, 5, run, 'failed', who);
      return busy(`스토리지에 닿지 않는다 — ${(e as Error).message}`);
    }
    mark(3, 5, run, 'ok', who, { unit: zone.name });

    let at = placer.pick(zone, build);
    const picked = (): void => mark(3, 6, run, at === null ? 'refused' : 'ok', who, at === null ? { unit: zone.name } : { unit: at.instance, counts: { sessions: at.count, capacity: zone.capacity } }); // 없으면 수를 싣지 않는다 — 인스턴스의 수를 낡게 고치지 않게
    picked();
    if (at === null) {
      // ⇒ B — 띄우고 다시 고른다. 띄울 곳도 없으면 C
      let launched: boolean;
      try {
        launched = await o.launch(zone.name, build, run);
      } catch (e) {
        o.log(`${character} session 띄우지 못했다 — ${(e as Error).message}`);
        return busy((e as Error).message);
      }
      if (launched) {
        at = placer.pick(zone, build);
        picked();
      }
    }
    if (at === null) {
      const q = queues.get(zone.name)!;
      const n = q.push(character, who.account, who.name, build);
      mark(3, 20, run, 'wait', who, { unit: zone.name, person: 'queued', counts: { wait: n } });
      return { wait: n };
    }
    const s = sessions.hold(character, who.account, who.name, at.instance, build);
    mark(3, 7, run, 'ok', s, { unit: at.instance, person: 'pending', counts: { sessions: at.count + 1, capacity: zone.capacity } });
    return gateFor(s, run, true);
  };

  /** 흐름 8 의 8 ~ 11 — Api 의 지우기가 SessionRpc forget 으로. Characters.owner(8 의 6)는 Api 가 이미 보았다. */
  const forget = async (account: string, character: string, run: string): Promise<{ forgot: string } | Unattached> => {
    const who = { account };
    const s = sessions.get(character);
    mark(8, 8, run, s === null ? 'ok' : 'refused', s ?? who);
    if (s !== null) return { why: '놀고 있는 캐릭터다 — 접속을 끊고 유예가 지난 뒤 다시' };
    for (const q of queues.values()) q.drop(character);
    try {
      await o.remove(character);
      mark(8, 9, run, 'ok', who);
      const erased = await o.characters.erase(character);
      mark(8, 10, run, erased ? 'ok' : 'refused', who); // 누가 값을 들고 있다 — 줄은 이미 지웠다, 값은 운영자가(흐름 6)
      if (!erased) o.log(`${character} session 값을 지우지 못했다 — lease 를 누가 들고 있다`);
      await zoneMap.forget(character);
      mark(8, 11, run, 'ok', who);
    } catch (e) {
      mark(8, 9, run, 'failed', who);
      return busy(`스토리지에 닿지 않는다 — ${(e as Error).message}`);
    }
    return { forgot: character };
  };

  /** 흐름 9 의 3 · 8 · 9 — 게이트웨이의 SessionRpc attach. 4 ~ 7(Loader.load)은 plan 07 이 세운다. */
  const attach = async (character: string, gate: string, run: string): Promise<Attached | Unattached> => {
    const s = sessions.get(character);
    if (s === null) {
      mark(9, 3, run, 'refused', null);
      return { why: '세션이 없다 — 먼저 입장' };
    }
    const address = o.address(s.instance);
    if (address === null) {
      sessions.drop(character);
      mark(9, 3, run, 'refused', s, { unit: s.instance, person: 'gone' });
      return { why: '인스턴스가 떠 있지 않다 — 다시 입장' };
    }
    mark(9, 3, run, 'ok', s, { unit: s.instance });
    sessions.activate(character, gate);
    mark(9, 8, run, 'ok', s, { unit: s.instance, person: 'active' });
    const token = o.issue(character);
    mark(9, 9, run, 'ok', s, { unit: s.instance });
    return { instance: s.instance, address, token };
  };

  /** 흐름 11 의 2 — 게이트웨이의 SessionRpc detach. 그 게이트웨이의 active 만 grace 로. */
  const detach = (character: string, gate: string, run: string): void => {
    const s = sessions.suspend(character, gate);
    if (s !== null) mark(11, 2, run, 'wait', s, { unit: s.instance, person: 'grace' });
  };

  return {
    enter: (character, build, run) => turns.run(character, () => enter(character, build, run)),
    forget: (account, character, run) => turns.run(character, () => forget(account, character, run)),
    attach,
    detach,
    report: (r, run) => {
      gates.seen(r.name, r.address, r.closing);
      o.trace({ flow: 5, step: 8, run, unit: '-', end: 'ok', counts: { connections: r.connections.length, closing: r.closing ? 1 : 0 } }); // Gates.seen — 단위는 `-`(게이트웨이는 인스턴스가 아니다)
    },
    close: () => clearInterval(timer),
  };
}

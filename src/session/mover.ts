// Mover — 캐릭터 하나를 한 인스턴스에서 다른 인스턴스로 옮긴다 (design/02-roles/session.md 의 Mover, 흐름 10 · 흐름 12 의 5).
// 값은 한때에 한 인스턴스에만 있다 — 내림(Loader.unload)이 올림(Loader.load)보다 먼저이고, 그 사이의 진실은 스토리지다.
// 장애 복구(recover)는 내림이 없다(떠나는 곳이 죽었다 — lease 는 Recoverer 가 끊었다). 한 캐릭터의 이동은 한 번에 하나 — 부르는 쪽(openSession)이 차례를 지킨다.

import type { TraceEnd, TraceInput } from '../protocol/observe';
import type { Attached } from '../protocol/session';
import type { Placer } from './placer';
import type { Router } from './router';
import type { Session } from './session';
import type { Sessions } from './sessions';
import type { Zone } from './zone';
import type { ZoneMap } from './zone-map';

/** 사람의 흔적 — openSession 의 mark. */
export type Mark = (flow: number, step: number, run: string, end: TraceEnd, s: Session | null, extra?: Partial<TraceInput>) => void;

/** move 의 끝 — 옮겼다 · 제자리에 있다 · 접속을 닫고 세션을 지웠다. */
export type Moved = 'moved' | 'stayed' | 'closed';

export interface MoverParts {
  readonly sessions: Sessions;
  readonly placer: Placer;
  readonly router: Router;
  readonly zoneMap: ZoneMap;
  /** 플릿의 Loader.load · unload(NodeRpc) · launch(흐름 3 의 B) · address — 앱이 준다 */
  readonly load: (instance: string, character: string, spot: string | null, run: string) => Promise<string | null>;
  readonly unload: (instance: string, character: string, run: string) => Promise<string | null>;
  readonly launch: (zone: string, build: string, run: string) => Promise<boolean>;
  readonly address: (instance: string) => string | null;
  /** Signer.issue — 새 호스트에 줄 토큰 */
  readonly issue: (character: string) => string;
  readonly mark: Mark;
  readonly log: (line: string) => void;
}

export class Mover {
  // 데이터 — sessions(참조) · load · unload(플릿의 기능 — 앱이 준다) · busy(옮기는 가운데의 캐릭터들)
  readonly busy = new Set<string>();
  private readonly p: MoverParts;

  constructor(parts: MoverParts) {
    this.p = parts;
  }

  /**
   * move — 흐름 10. 갈 존에 슬롯을 잡고, 값을 지금의 인스턴스에서 내려 저장하고, 갈 인스턴스에 올리고, 게이트웨이가 뒤를 바꿔 잇게 한다. spot 은 갈 공간.
   * recover 면 흐름 12 의 5 — 내림 없이(떠나는 곳이 죽었다) 옮기고, 갈 곳이 없으면 접속을 닫고(1001) 세션을 지운다.
   * 값이 아직 올라가지 않은 세션(pending)은 슬롯만 옮긴다 — 접속(흐름 9)이 갈 곳에 올린다.
   */
  async move(character: string, zone: Zone, spot: string | null, run: string, recover = false): Promise<Moved> {
    const p = this.p;
    const s = p.sessions.get(character);
    if (s === null) return 'stayed';
    this.busy.add(character);
    try {
      const from = s.instance;
      p.mark(10, 1, run, 'ok', s, { unit: from }); // Mover.move
      // 2 — 갈 존에서 슬롯이 빈 인스턴스. 없으면 띄운다(흐름 3 의 B). 지금의 인스턴스는 빼지만, 장애 복구면 같은 이름으로 다시 띄운 것이 갈 곳일 수 있다
      const except = recover ? null : from;
      const mine = recover ? from : null;
      let at = p.placer.pick(zone, s.build, except, mine);
      if (at === null) {
        try {
          if (await p.launch(zone.name, s.build, run)) at = p.placer.pick(zone, s.build, except, mine);
        } catch (e) {
          p.log(`${character} session 갈 인스턴스를 띄우지 못했다 — ${(e as Error).message}`);
        }
      }
      p.mark(10, 2, run, at === null ? 'refused' : 'ok', s, at === null ? { unit: zone.name } : { unit: at.instance, counts: { sessions: at.count, capacity: zone.capacity } }); // Placer.pick
      if (at === null) return recover ? this.close(s, run, '옮길 슬롯이 없다', [12, 5]) : 'stayed'; // 그만둔다 — 캐릭터는 제자리에
      p.sessions.reserve(character, at.instance);
      p.mark(10, 3, run, 'ok', s, { unit: at.instance, counts: { sessions: p.sessions.count(at.instance) } }); // Sessions.reserve
      const loaded = s.state !== 'pending';
      if (loaded && !recover) {
        const why = await p.unload(from, character, run); // 4 ~ 7 — 흔적은 플릿의 Loader 가(5 ~ 7)
        p.mark(10, 4, run, why === null ? 'ok' : 'failed', s, { unit: from }); // Loader.unload
        if (why !== null) {
          // 6 이 실패했다 — 그 파일로 지금의 인스턴스에 다시 올리고 그만둔다
          s.to = null;
          const back = await p.load(from, character, null, run);
          p.log(`${character} session 옮기지 못했다 — ${why}${back === null ? '' : ` · 되돌리지도 못했다 — ${back}`}`);
          return back === null ? 'stayed' : this.close(s, run, '값을 되돌리지 못했다', [10, 4]);
        }
      }
      if (loaded) {
        const why = await p.load(at.instance, character, spot, run); // 흐름 9 의 5 ~ 7 — 흔적은 플릿의 Loader 가
        p.mark(10, 8, run, why === null ? 'ok' : 'failed', s, { unit: at.instance }); // Loader.load
        if (why !== null) {
          s.to = null;
          if (recover) return this.close(s, run, why, [12, 5]);
          const back = await p.load(from, character, null, run); // 지금의 인스턴스에 다시 올린다
          p.log(`${character} session 갈 곳에 올리지 못했다 — ${why}${back === null ? ' · 제자리에 되돌렸다' : ` · 되돌리지도 못했다 — ${back}`}`);
          return back === null ? 'stayed' : this.close(s, run, '값을 올리지 못했다', [10, 8]);
        }
      }
      p.sessions.move(character);
      p.mark(10, 9, run, 'ok', s, { unit: s.instance, counts: { sessions: p.sessions.count(s.instance) } }); // Sessions.move
      try {
        await p.zoneMap.remember(character, zone.name);
        p.mark(10, 10, run, 'ok', s, { unit: zone.name }); // ZoneMap.remember
      } catch (e) {
        p.mark(10, 10, run, 'failed', s, { unit: zone.name });
        p.log(`${character} session 마지막 존을 적지 못했다 — ${(e as Error).message}`);
      }
      const address = p.address(s.instance);
      if (address !== null) {
        const to: Attached = { instance: s.instance, address, token: p.issue(character) };
        if (p.router.reroute(s, to, run)) p.mark(10, 11, run, 'ok', s, { unit: s.instance }); // Router.reroute ⇒ 게이트웨이의 Connection.reroute(12)
      }
      return 'moved';
    } finally {
      this.busy.delete(character);
    }
  }

  /** 옮길 수 없다 — 접속을 닫고(1001 — 클라이언트는 다시 입장한다) 세션을 지운다. 흔적은 그 일을 그만둔 단계에(at). 값은 스토리지에 있다. */
  private close(s: Session, run: string, why: string, at: readonly [number, number]): Moved {
    this.p.router.kick(s, 1001, run);
    this.p.sessions.drop(s.character);
    this.p.mark(at[0], at[1], run, 'failed', s, { unit: s.instance, person: 'gone' });
    this.p.log(`${s.character} session 접속을 닫았다 — ${why}`);
    return 'closed';
  }
}

// ZoneMap — 캐릭터가 설 존을 든다 (design/02-roles/session.md 의 ZoneMap, 흐름 3 의 5 · 8 의 11 · 11 의 5).
// 표는 스토리지에 — `lastZone`(Character.id → 존 이름) · `zones`(존 이름 → {closed}). 마지막 존은 메모리에 두지 않는다.

import type { DatabaseSocket } from '../protocol/storage';
import type { Zone } from './zone';

export class ZoneMap {
  // 데이터 — zones · db(참조) · entry(불변)
  readonly zones: Map<string, Zone>;
  readonly db: DatabaseSocket;
  readonly entry: string;

  private constructor(zones: Map<string, Zone>, db: DatabaseSocket, entry: string) {
    this.zones = zones;
    this.db = db;
    this.entry = entry;
  }

  /** Service.start — 설정의 존마다 줄을 세우고, 표 `zones` 의 closed 를 읽는다. entry 가 설정에 없으면 던진다. */
  static async open(zones: readonly Omit<Zone, 'closed'>[], db: DatabaseSocket, entry: string): Promise<ZoneMap> {
    const map = new Map<string, Zone>();
    for (const z of zones) {
      const row = (await db.get('zones', z.name)) as { closed?: unknown } | null;
      map.set(z.name, { ...z, closed: row?.closed === true });
    }
    if (!map.has(entry)) throw new Error(`처음 서는 존이 설정에 없다 — ${entry}`);
    return new ZoneMap(map, db, entry);
  }

  /** zoneOf — 마지막에 있던 존(없거나 설정에 없는 존이면 entry). 닫혀 있으면 { shut }. */
  async zoneOf(character: string): Promise<{ readonly zone: Zone } | { readonly shut: Zone }> {
    const last = await this.db.get('lastZone', character);
    const zone = (typeof last === 'string' ? this.zones.get(last) : undefined) ?? this.zones.get(this.entry)!;
    return zone.closed ? { shut: zone } : { zone };
  }

  /** 인스턴스의 존 — 인스턴스의 이름은 `<존>-<번호>`(지금은 존 하나에 인스턴스 하나 — 이름이 존의 이름이다). */
  zoneOfInstance(instance: string): Zone | null {
    for (const z of this.zones.values()) if (instance === z.name || instance.startsWith(`${z.name}-`)) return z;
    return null;
  }

  async remember(character: string, zone: string): Promise<void> {
    await this.db.put('lastZone', character, zone);
  }

  async forget(character: string): Promise<void> {
    await this.db.remove('lastZone', character);
  }

  /** close · open — 그 존의 입장을 막고 푼다(흐름 6 — 운영자, plan 08). */
  async close(zone: string): Promise<void> {
    await this.set(zone, true);
  }

  async open(zone: string): Promise<void> {
    await this.set(zone, false);
  }

  private async set(zone: string, closed: boolean): Promise<void> {
    const z = this.zones.get(zone);
    if (z === undefined) throw new Error(`모르는 존 — ${zone}`);
    await this.db.put('zones', zone, { closed });
    z.closed = closed;
  }
}

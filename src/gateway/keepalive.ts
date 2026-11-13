// Keepalive — 죽은 선을 찾는다 (design/02-roles/gateway.md 의 Keepalive, 흐름 5 의 5).

import type { Connection } from './connection';

export class Keepalive {
  // 데이터 — pongMs(불변)
  readonly pongMs: number;
  private readonly now: () => number;

  constructor(pongMs: number, now: () => number = Date.now) {
    this.pongMs = pongMs;
    this.now = now;
  }

  /** ping — 앞의 ping 에 한계 안의 답이 없었으면 닫게 하고(1001 → 흐름 11) false, 아니면 새 ping 을 보내고 true. */
  ping(connection: Connection): boolean {
    const t = this.now();
    if (connection.pingAt !== null && t - connection.pingAt >= this.pongMs) {
      connection.close(1001, 'ping 에 답이 없다');
      return false;
    }
    if (connection.pingAt === null) {
      connection.pingAt = t;
      connection.ping();
    }
    return true;
  }
}

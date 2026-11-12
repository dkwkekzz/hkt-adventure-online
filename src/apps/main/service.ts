// Service — 서비스 프로세스의 조립 (design/README.md 의 Service). start 는 흐름 1, stop 은 흐름 7.
// Monitor(흐름 14)를 먼저 세우고 그 trace 를 개념들에 준다 — 흐름 1 의 단계부터 흔적이 남는다.

import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Directory, Signer } from '../../account';
import { Fleet } from '../../fleet';
import { openStorage } from '../../storage';
import type { StorageSocket } from '../../protocol/storage';
import { openApi } from './api';
import { readMap } from './map';
import { Monitor } from './monitor';
import { Static } from './static';
import type { ServiceConfig } from './config';

/** 이 파일에서 src 와 design 의 자리 — 흐름의 지도는 저장소의 design/01-flows 에서 뽑는다. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESIGN = join(SRC, '..', 'design');
const freshRun = (): string => randomBytes(4).toString('hex');

export class Service {
  // 데이터 — config(불변) · monitor · storage · directory · signer · fleet · api · 전부 참조
  readonly config: ServiceConfig;
  readonly monitor: Monitor;
  readonly storage: StorageSocket;
  readonly directory: Directory;
  readonly signer: Signer;
  readonly fleet: Fleet;
  readonly api: Server;
  port = 0;
  private stopping: Promise<void> | null = null;

  private constructor(config: ServiceConfig, log: (line: string) => void, monitor: Monitor, storage: StorageSocket, signer: Signer, fleet: Fleet) {
    this.config = config;
    this.monitor = monitor;
    this.storage = storage;
    this.directory = new Directory(storage.database);
    this.signer = signer;
    this.fleet = fleet;
    this.api = openApi({ directory: this.directory, signer: this.signer, fleet: this.fleet, files: new Static(config.fleet.engineDir, config.fleet.viewerOut, config.keymap), log, trace: monitor.trace });
  }

  /** start — 흐름 1. 키가 없으면 시작 거부. Monitor 를 열고, 스토리지에 닿고, 뷰어를 한 번 묶고, Api 를 연다. 샤드는 띄우지 않는다. */
  static async start(config: ServiceConfig, key: string | undefined, log: (line: string) => void = (l) => console.log(l)): Promise<Service> {
    if (key === undefined || key === '') throw new Error('HOST_AUTH_KEY 가 없다 — 토큰 없는 서비스는 열지 않는다');
    const run = freshRun();
    const monitor = new Monitor({ role: 'main', build: config.build, map: readMap(DESIGN, SRC), traceKeep: config.traceKeep, every: config.fleet.clockMs, key });
    await monitor.listen(config.monitorPort);
    let service: Service;
    let storage: StorageSocket | null = null;
    try {
      storage = await openStorage(config.storage); // 흐름 1 의 1 — 닿지 않으면 시작 거부
      const signer = new Signer(key, config.tokenTtl);
      const fleet = await Fleet.open(config.fleet, storage, key, (account) => signer.issue(account, config.agentTtl), log, monitor.trace, run); // 흐름 1 의 7
      service = new Service(config, log, monitor, storage, signer, fleet);
      monitor.trace({ flow: 1, step: 1, run, unit: '-', end: 'ok' });
      log(`service 스토리지 — ${storage.where}`);
      await service.fleet.start(run); // 흐름 1 의 2 — 뷰어를 묶고 박자를 돌린다
      await new Promise<void>((resolve, reject) => {
        service.api.once('error', reject);
        service.api.listen(config.apiPort, () => resolve());
      });
    } catch (e) {
      monitor.trace({ flow: 1, step: 1, run, unit: '-', end: 'failed' });
      await storage?.close().catch(() => {});
      await monitor.close();
      throw e;
    }
    const at = service.api.address();
    service.port = typeof at === 'object' && at !== null ? at.port : config.apiPort;
    monitor.trace({ flow: 1, step: 3, run, unit: '-', end: 'wait', counts: { port: service.port } }); // Api.listen — 클라이언트 ◇
    return service;
  }

  /** stop — 흐름 7. 두 번 불려도 한 번. Monitor 는 내려가는 동안 503 을 답하고 마지막에 닫는다. */
  stop(): Promise<void> {
    if (this.stopping !== null) return this.stopping;
    this.monitor.closing = true;
    const run = freshRun();
    this.stopping = (async () => {
      this.fleet.clock.stop();
      await this.fleet.stopAll(run); // 흐름 7 의 4 · 5 — 표는 바뀔 때마다 스토리지에 있다 — 따로 쓰지 않는다
      await new Promise<void>((resolve) => this.api.close(() => resolve()));
      this.api.closeAllConnections();
      this.monitor.trace({ flow: 7, step: 10, run, unit: '-', end: 'ok' }); // Api.close
      let closed: 'ok' | 'failed' = 'ok';
      await this.storage.close().catch(() => (closed = 'failed'));
      this.monitor.trace({ flow: 7, step: 11, run, unit: '-', end: closed }); // 스토리지를 닫는다 — 다른 개념이 다 내려간 뒤
      await this.monitor.close();
    })();
    return this.stopping;
  }
}

// Service — 서비스 프로세스의 조립 (design/README.md 의 Service). start 는 흐름 1, stop 은 흐름 7.

import type { Server } from 'node:http';
import { Directory, Signer } from '../../account';
import { Fleet } from '../../fleet';
import { openVault } from '../../storage';
import type { VaultSocket } from '../../protocol/vault';
import { openApi } from './api';
import type { ServiceConfig } from './config';

export class Service {
  // 데이터 — config(불변) · vault · directory · signer · fleet · api · 전부 참조
  readonly config: ServiceConfig;
  readonly vault: VaultSocket;
  readonly directory: Directory;
  readonly signer: Signer;
  readonly fleet: Fleet;
  readonly api: Server;
  port = 0;
  private stopping: Promise<void> | null = null;

  private constructor(config: ServiceConfig, key: string, log: (line: string) => void) {
    this.config = config;
    this.vault = openVault(config.storageRoot); // 흐름 1 의 1 · 2
    this.directory = new Directory(this.vault.ledger); // 흐름 1 의 3
    this.signer = new Signer(key, config.tokenTtl);
    this.fleet = new Fleet(config.fleet, this.vault, key, (account) => this.signer.issue(account, config.agentTtl), log); // 흐름 1 의 4 · 5
    this.api = openApi({ directory: this.directory, signer: this.signer, fleet: this.fleet, log });
  }

  /** start — 흐름 1. 키가 없으면 시작 거부. 샤드는 띄우지 않는다. */
  static async start(config: ServiceConfig, key: string | undefined, log: (line: string) => void = (l) => console.log(l)): Promise<Service> {
    if (key === undefined || key === '') throw new Error('HOST_AUTH_KEY 가 없다 — 토큰 없는 서비스는 열지 않는다');
    const service = new Service(config, key, log);
    service.fleet.clock.run(() => service.fleet.tick()); // 흐름 1 의 6
    await new Promise<void>((resolve, reject) => {
      service.api.once('error', reject);
      service.api.listen(config.apiPort, () => resolve());
    });
    const at = service.api.address();
    service.port = typeof at === 'object' && at !== null ? at.port : config.apiPort;
    return service;
  }

  /** stop — 흐름 7. 두 번 불려도 한 번. */
  stop(): Promise<void> {
    if (this.stopping !== null) return this.stopping;
    this.stopping = (async () => {
      this.fleet.clock.stop();
      await this.fleet.stopAll(); // 표 둘은 바뀔 때마다 저장장치에 있다 — 따로 쓰지 않는다(흐름 7 의 3)
      await new Promise<void>((resolve) => this.api.close(() => resolve()));
      this.api.closeAllConnections();
    })();
    return this.stopping;
  }
}

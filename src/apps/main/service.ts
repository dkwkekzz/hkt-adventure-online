// Service — 서비스 프로세스의 조립 (design/README.md 의 Service). start 는 흐름 1, stop 은 흐름 7.
// Monitor(흐름 14)를 먼저 세우고 그 trace 를 개념들에 준다 — 흐름 1 의 단계부터 흔적이 남는다.

import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Banlist, Characters, Directory, Signer, kindOf } from '../../account';
import { Fleet } from '../../fleet';
import { openGateway } from '../../gateway';
import { openSession } from '../../session';
import { openStorage } from '../../storage';
import type { GatewaySocket } from '../../protocol/gateway';
import type { SessionSocket } from '../../protocol/session';
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
  // 데이터 — config(불변) · monitor · storage · directory · characters · banlist · signer · fleet · session · api · gateway — 전부 참조
  readonly config: ServiceConfig;
  readonly monitor: Monitor;
  readonly storage: StorageSocket;
  readonly directory: Directory;
  readonly characters: Characters;
  readonly banlist: Banlist;
  readonly signer: Signer;
  readonly fleet: Fleet;
  /** 세션 — SessionRpc 의 받는 쪽(컨트롤 플레인). main 에서는 Api · 게이트웨이가 함수로 부른다 */
  readonly session: SessionSocket;
  readonly api: Server;
  /** 게이트웨이 — 클라이언트의 소켓을 받아 호스트와 잇는다(흐름 9 · 11). SessionRpc 는 함수 부름 */
  readonly gateway: GatewaySocket;
  port = 0;
  private stopping: Promise<void> | null = null;

  private constructor(config: ServiceConfig, log: (line: string) => void, monitor: Monitor, storage: StorageSocket, signer: Signer, fleet: Fleet, characters: Characters, banlist: Banlist, session: SessionSocket, gateway: GatewaySocket) {
    this.config = config;
    this.monitor = monitor;
    this.storage = storage;
    this.directory = new Directory(storage.database);
    this.characters = characters;
    this.banlist = banlist;
    this.signer = signer;
    this.fleet = fleet;
    this.session = session;
    this.gateway = gateway;
    const files = new Static(config.fleet.engineDir, config.fleet.viewerOut, config.keymap, config.scheme);
    // Keymap 을 찾지 못하면 뷰어는 단축키 없이 메뉴로만 고른다 — 엔진을 올려 자리가 바뀌어도 조용히 지나가지 않게 알린다
    if (config.keymap !== null && files.keymapFile() === null) log(`service Keymap 이 없다 — ${files.keymap}${config.scheme === null ? '' : ` (조작 틀 ${config.scheme})`}. 뷰어는 메뉴로만 고른다`);
    this.api = openApi({
      directory: this.directory,
      characters,
      banlist,
      signer,
      session,
      build: config.build,
      pageUrl: config.pageUrl,
      characterTtl: config.characterTtl,
      files,
      log,
      trace: monitor.trace,
    });
  }

  /** start — 흐름 1. 키가 없으면 시작 거부. Monitor 를 열고, 스토리지에 닿고, 뷰어를 한 번 묶고, Api 를 연다. 샤드는 띄우지 않는다. */
  static async start(config: ServiceConfig, key: string | undefined, log: (line: string) => void = (l) => console.log(l)): Promise<Service> {
    if (key === undefined || key === '') throw new Error('HOST_AUTH_KEY 가 없다 — 토큰 없는 서비스는 열지 않는다');
    const run = freshRun();
    const monitor = new Monitor({ role: 'main', build: config.build, map: readMap(DESIGN, SRC), traceKeep: config.traceKeep, every: config.fleet.clockMs, key });
    await monitor.listen(config.monitorPort);
    let service: Service;
    let storage: StorageSocket | null = null;
    let opened: SessionSocket | null = null;
    try {
      storage = await openStorage(config.storage); // 흐름 1 의 1 — 닿지 않으면 시작 거부
      const signer = new Signer(key, config.tokenTtl);
      const fleet = await Fleet.open(config.fleet, storage, key, (account) => signer.issue(account, config.agentTtl), log, monitor.trace, run); // 흐름 1 의 7
      const characters = new Characters(storage.database, config.characterLimit);
      const banlist = new Banlist(storage.database);
      // SessionRpc 는 함수 부름 — 세션 ↔ 게이트웨이는 서로를 부른다(attach · detach · report ↔ kick). 게이트웨이는 아래에서 선다
      let gateway: GatewaySocket | null = null;
      const session = await openSession({
        config: config.session,
        zones: [{ name: config.fleet.world, dataset: config.fleet.dataset, capacity: config.session.capacity }],
        entry: config.fleet.world,
        clockMs: config.fleet.clockMs,
        database: storage.database,
        characters: storage.characters,
        owner: (character) => characters.owner(character),
        banned: (account) => banlist.banned(account),
        remove: (character) => characters.remove(character),
        ready: (zone) => fleet.ready(zone).map((name) => ({ name, build: config.build })), // 빌드는 이 서버의 것 하나 — 노드마다의 빌드는 plan 08
        launch: (zone, _build, r) => fleet.launch(zone, r),
        address: (instance) => fleet.address(instance),
        issue: (character) => signer.issue(character, config.agentTtl), // 호스트에 줄 토큰 — 접속 한 번에만 쓴다
        kick: (_gate, character, code, r) => gateway?.kick(character, code, r), // 게이트웨이는 지금 하나
        trace: monitor.trace,
        log,
      });
      opened = session;
      gateway = openGateway({
        config: config.gateway,
        name: 'gate-1',
        address: config.gateUrl,
        clockMs: config.fleet.clockMs,
        verify: (token) => {
          const id = signer.verify(token);
          return id !== null && kindOf(id) === 'character' ? id : null; // 캐릭터의 토큰만
        },
        attach: (character, gate, r) => session.attach(character, gate, r),
        detach: (character, gate, r) => session.detach(character, gate, r),
        report: (report, r) => session.report(report, r),
        trace: monitor.trace,
        log,
      });
      service = new Service(config, log, monitor, storage, signer, fleet, characters, banlist, session, gateway);
      monitor.trace({ flow: 1, step: 1, run, unit: '-', end: 'ok' });
      log(`service 스토리지 — ${storage.where}`);
      await service.fleet.start(run); // 흐름 1 의 2 — 뷰어를 묶고 박자를 돌린다
      await new Promise<void>((resolve, reject) => {
        service.api.once('error', reject);
        service.api.listen(config.apiPort, () => resolve());
      });
      await service.gateway.listen(run); // 흐름 1 의 4 · 5 — 소켓을 듣고 자기를 알린다
    } catch (e) {
      monitor.trace({ flow: 1, step: 1, run, unit: '-', end: 'failed' });
      opened?.close(); // 세우다 그만둔 세션의 간격
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
      this.session.close(); // 세션의 간격 — 세션은 스토리지에 두지 않는다(다시 서면 보고로, plan 07 · 08)
      await this.gateway.close(run); // 흐름 7 의 7 · 8 — 내려간다고 알리고 접속을 닫는다(1001). 세계보다 먼저 — 사람은 rerouting 없이 닫힘을 받는다
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

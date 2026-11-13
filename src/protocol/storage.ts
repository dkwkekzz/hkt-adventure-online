// Storage 소켓 — 계정 · 플릿 · 앱 → 스토리지 (design/02-roles/storage.md 의 소켓 표).
// 스토리지의 객체는 소켓 너머다 — 모듈은 이 모양만 안다. 구현은 storage/ 의 openStorage 하나가 낸다.
// 뒤가 MongoDB · object storage 일 수 있으므로 전부 기다린다(Promise).

/** Database 의 표 — 표 하나 = collection 하나. */
export const TABLES = ['accounts', 'accountInfo', 'characters', 'bans', 'lastZone', 'zones', 'instances', 'nodes', 'audit'] as const;
export type Table = (typeof TABLES)[number];

export interface DatabaseSocket {
  /** 줄 하나의 값 또는 null(없다). */
  get(table: Table, key: string): Promise<unknown>;
  /** 줄 하나를 통째로 쓴다 — 되거나 안 된다. */
  put(table: Table, key: string, value: unknown): Promise<void>;
  remove(table: Table, key: string): Promise<void>;
  /** 표의 줄 전부 — [key, value]. */
  all(table: Table): Promise<[string, unknown][]>;
}

/** 캐릭터의 값을 지금 누가 들고 있는가. 불변. n 은 늘기만 한다. until 은 스토리지의 시각(ms). */
export interface Lease {
  readonly character: string;
  /** 인스턴스의 이름과 세대 — `<이름>@<epoch>`. */
  readonly holder: string;
  readonly n: number;
  readonly until: number;
}

export interface CharacterStoreSocket {
  /** 값을 file 에 내려 준다. 아직 없으면 false — file 을 만들지 않는다. */
  read(character: string, file: string): Promise<boolean>;
  /** lease 가 지금의 것일 때만 file 을 값으로 — 아니면 false(거절). */
  write(character: string, lease: Lease, file: string): Promise<boolean>;
  /** 값과 이력을 지운다. 누가 들고 있으면 false. */
  erase(character: string): Promise<boolean>;
  /** 이력의 때들(ms) — 오래된 것부터. */
  versions(character: string): Promise<number[]>;
  /** 값을 그때의 것으로. 누가 들고 있거나 그때가 없으면 false. */
  rollback(character: string, at: number): Promise<boolean>;
}

export interface LeasesSocket {
  /** 비었거나 만료됐으면 번호를 올린 Lease. 누가 들고 있으면 null. */
  acquire(character: string, holder: string): Promise<Lease | null>;
  /** 만료를 늦춘 Lease. 이미 지금의 것이 아니면 null. */
  renew(lease: Lease): Promise<Lease | null>;
  release(lease: Lease): Promise<void>;
  /** 그 holder 가 든 것을 전부 비운다. */
  expire(holder: string): Promise<void>;
}

export interface SnapshotStoreSocket {
  /** 올라가 있는 Store 를 이 서버에 — 그 자리(절대 경로). 없으면 빈 디렉터리. */
  pull(instance: string): Promise<string>;
  /** dir 를 통째로 올린다. 올라가 있는 것보다 낡은 세대면 false(거절). */
  push(dir: string, instance: string, epoch: number): Promise<boolean>;
  /** 올라가 있는 것의 백업 하나 — 그 이름. 올라간 것이 없으면 던진다. */
  copy(instance: string): Promise<string>;
  /** 올라가 있는 것을 백업으로. 기존은 백업 하나로 남긴다. 없는 백업이면 던진다. */
  restore(instance: string, backup: string): Promise<void>;
  /** 백업 이름들 — 오래된 것부터. */
  list(instance: string): Promise<string[]>;
  /** 새것 keep 개만 남긴다. */
  prune(instance: string, keep: number): Promise<void>;
  /** 그 인스턴스의 것을 전부 지운다 — 올라간 것 · 백업 · 이 서버의 자리. */
  purge(instance: string): Promise<void>;
}

export interface LeaderLockSocket {
  /** 비었거나 만료됐으면 term 을 하나 올려 잡는다. 남이 들고 있으면 null. */
  acquire(holder: string, ttl: number): Promise<number | null>;
  /** 제 것이면 만료를 늦춘다 — 아니면 false. */
  renew(holder: string, term: number): Promise<boolean>;
  resign(holder: string, term: number): Promise<void>;
  /** 지금 든 자 — 비었거나 만료됐으면 null. */
  holder(): Promise<{ readonly holder: string; readonly term: number } | null>;
}

export interface StorageSocket {
  readonly database: DatabaseSocket;
  readonly characters: CharacterStoreSocket;
  readonly leases: LeasesSocket;
  readonly snapshots: SnapshotStoreSocket;
  readonly leader: LeaderLockSocket;
  /** 어디에 섰는가 — 사람이 읽는 한 줄(자격은 싣지 않는다). */
  readonly where: string;
  /** 뒤의 연결을 닫는다 — Service.stop 의 마지막(흐름 7 의 11). */
  close(): Promise<void>;
}

/** object storage(S3 호환)의 자리 — SNAPSHOT_URI · S3_ENDPOINT · AWS_*. */
export interface BucketOptions {
  readonly bucket: string;
  /** 물건 이름의 머리 — 끝의 `/` 없이. 비면 뿌리. */
  readonly prefix: string;
  /** `https://host[:port]` — path-style 로 부른다. */
  readonly endpoint: string;
  readonly region: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly sessionToken: string | null;
}

/** openStorage 가 받는 것 — 앱이 설정 · 환경변수에서 짓는다. 없는 쪽은 root 의 디렉터리로. */
export interface StorageOptions {
  /** 개발의 뒤 · 이 서버의 Store 자리의 뿌리. */
  readonly root: string;
  /** MONGODB_URI — null 이면 Database · CharacterStore · Leases · LeaderLock 은 root 의 디렉터리. */
  readonly mongodbUri: string | null;
  /** SNAPSHOT_URI — null 이면 SnapshotStore 의 remote 는 root 의 디렉터리. */
  readonly bucket: BucketOptions | null;
  /** Lease 의 길이(ms). */
  readonly leaseMs: number;
  /** 캐릭터의 값의 이력 — 지난 값 몇 개. */
  readonly characterHistory: number;
}

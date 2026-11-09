// Vault · Ledger 소켓 — 함대 · 계정 → 저장장치 (design/02-roles/storage.md 의 소켓 표).
// 저장장치의 객체는 소켓 너머다 — 모듈은 이 모양만 안다. 구현은 storage/ 의 openVault 하나가 낸다.

/** Ledger 의 자리 — 서비스의 표 둘. */
export type LedgerSlot = 'directory' | 'assignment';

export interface LedgerSocket {
  /** 그 자리의 값(JSON 통째) 또는 null(아직 없다). */
  load(slot: LedgerSlot): unknown;
  /** 그 자리에 값을 통째로 쓴다. 반쯤 쓴 표가 남지 않는다. */
  save(slot: LedgerSlot, value: unknown): void;
}

export interface VaultSocket {
  readonly ledger: LedgerSocket;
  /** 계정 · 데이터셋의 Store 자리 — 만들어 절대 경로로 준다. */
  dirOf(account: string, dataset: string): string;
  /** 자리를 통째로 베끼고 사본 이름을 준다. */
  copy(dir: string): string;
  /** 자리를 사본으로 바꾼다. 기존은 사본 하나로 남긴다. 없는 사본이면 던진다. */
  restore(dir: string, backup: string): void;
  /** 그 자리의 사본 이름들 — 오래된 것부터. */
  list(dir: string): string[];
}

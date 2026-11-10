// 저장장치 storage (design/02-roles/storage.md). 밖에 내보내는 것은 openVault 하나 — 저장장치의 객체는 소켓(protocol/vault.ts) 너머다.

import type { VaultSocket } from '../protocol/vault';
import { Vault } from './vault';

/** Service.start(흐름 1 의 1) — 뿌리를 연다. 없으면 만든다. */
export function openVault(root: string): VaultSocket {
  return new Vault(root);
}

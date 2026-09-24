import type { PlayerAccount } from "@/api/types/chips";
import type { PokerApp } from "@/api/types/tournaments";

/**
 * Аккаунт приложения: ID и ник в PPPoker / X-Poker / Poker21 общие для всех его клубов
 * (Иван, 24.09). В базе это строки «аккаунт × клуб» — здесь они собираются обратно.
 */
export interface AppAccount {
  key: string;
  app: PokerApp;
  appAccountId: string;
  nickname: string;
  /** Строки по клубам: первая — представитель для правки (сервер правит все разом). */
  rows: PlayerAccount[];
}

export function groupAccounts(accounts: PlayerAccount[]): AppAccount[] {
  const groups = new Map<string, AppAccount>();
  for (const account of accounts) {
    const key = `${account.club.app}:${account.app_account_id}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(account);
    } else {
      groups.set(key, {
        key,
        app: account.club.app,
        appAccountId: account.app_account_id,
        nickname: account.nickname,
        rows: [account],
      });
    }
  }
  return [...groups.values()];
}

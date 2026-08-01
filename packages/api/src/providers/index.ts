export interface ProviderAdapter {
  getAccountBalance: (accountId: string) => Promise<unknown>;
  getAccountHoldings: (accountId: string) => Promise<unknown>;
  getAccountTransactions: (accountId: string) => Promise<unknown>;
  listAccounts: () => Promise<unknown>;
}

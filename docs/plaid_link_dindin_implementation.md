# Plaid Link implementation guide for dindin

This guide is intended for an LLM agent to implement Plaid in the `dindin` app using:

- TypeScript
- TanStack Start
- TailwindCSS
- shared UI package in `packages/ui`
- oRPC
- Drizzle
- SQLite/Turso
- Better-Auth
- Turborepo

Reference code note:

- code snippets in this document are reference code only
- they are intentionally illustrative and are not guaranteed to match project standards, utilities, abstractions, or naming patterns
- do not copy them blindly
- implement the solution using the existing project standards, structure, and conventions

Core implementation requirements:

- use `react-plaid-link`
- implement Multi-Item Link so a user can connect multiple institutions in a single Link session

Current scope:

- implement the full sandbox flow for regular banking data
- fetch account info, balances, and transactions for checking/savings
- prepare the architecture for a later investments task, including Questrade

Relevant Plaid docs used here include the [Quickstart](https://plaid.com/docs/quickstart/), [Link overview](https://plaid.com/docs/link/), [Link API](https://plaid.com/docs/api/link/), [Users API](https://plaid.com/docs/api/users/), [Sandbox API](https://plaid.com/docs/api/sandbox/), [Institutions API](https://plaid.com/docs/api/institutions/), [Accounts API](https://plaid.com/docs/api/accounts/), [Items API](https://plaid.com/docs/api/items/), [Investments API](https://plaid.com/docs/api/products/investments/), and [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/).

## 1. Multi-Item Link requirements

Do not implement the standard single-item Link flow as the primary flow.

For Multi-Item Link:

- create a Plaid user first via `/user/create`
- create the link token with `enable_multi_item_link: true`
- use the returned `user_id` in `/link/token/create`
- do not expect useful data in the frontend `onSuccess` callback
- obtain `public_token` values from webhooks or `/link/token/get`

Per Plaid's Multi-Item Link docs, this flow allows users to add multiple Items in one Link session and is automatically available without special enablement. It is compatible with Transactions and Investments, but not with Embedded Institution Search, and not with certain non-credential Auth flows like Same-Day Micro-deposits or Database Auth in the same flow. See [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/).

## 2. Target product scope for this task

Implement now:

- Transactions product for bank accounts
- `/accounts/get` for account metadata and cached balances
- transactions retrieval for account history
- Multi-Item Link session support
- sandbox-only initial validation

Prepare for later:

- Investments product for Questrade and other brokerages
- `/investments/holdings/get`
- `/investments/transactions/get`

Important product choice guidance from Plaid:

- Link should be initialized with the minimal product set required for the use case, because requested products reduce the institution set available in Link. See [Link API](https://plaid.com/docs/api/link/).
- For this task, use `products: ['transactions']` for the first implementation.
- Add `investments` only in the later follow-up task.

## 3. Package to use on the frontend

Install the official React package:

```bash
npm install --save react-plaid-link
```

Use `react-plaid-link` inside the TanStack Start web app client code only.

Do not import Plaid browser code into server-only modules.

## 4. Environment model

The app already has in it's `.env`:

```env
PLAID_ENV=sandbox # valid values: sandbox, dev, prod
PLAID_SANDBOX_CLIENT_ID=<set>
PLAID_SANDBOX_SECRET=<set>
PLAID_DEV_CLIENT_ID=<unset>
PLAID_DEV_SECRET=<unset>
PLAID_PROD_CLIENT_ID=<unset>
PLAID_PROD_SECRET=<unset>
```

&nbsp;

Rules:

- only server-side code reads client ID and secret
- never expose Plaid secrets or access tokens to the browser
- choose credentials based on `PLAID_ENV`
- for this task use `sandbox`
- update `packages/env/src/server.ts` to expose and validate the new Plaid environment keys

## 5. Placement guidance

Follow the existing project structure instead of creating new folder conventions from this document.

Repo-specific corrections:

- app code should target `apps/web`, not `apps/dindin`
- API/server modules should live under `packages/api`, not `packages/server`
- database schemas should live under `packages/db/src/schema`, not `packages/db/schema`

Keep the concerns separated, but let the implementation follow the repo's established structure and naming patterns.

## 6. Plaid client setup

Create a backend-only Plaid client module in the existing API package structure.

```ts
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const plaidConfigByEnv = {
  sandbox: {
    basePath: PlaidEnvironments.sandbox,
    clientId: process.env.PLAID_SANDBOX_CLIENT_ID,
    secret: process.env.PLAID_SANDBOX_SECRET,
  },
  dev: {
    basePath: PlaidEnvironments.development,
    clientId: process.env.PLAID_DEV_CLIENT_ID,
    secret: process.env.PLAID_DEV_SECRET,
  },
  prod: {
    basePath: PlaidEnvironments.production,
    clientId: process.env.PLAID_PROD_CLIENT_ID,
    secret: process.env.PLAID_PROD_SECRET,
  },
} as const

function getPlaidSecrets() {
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof plaidConfigByEnv
  const cfg = plaidConfigByEnv[env] ?? plaidConfigByEnv.sandbox

  if (!cfg.clientId || !cfg.secret) {
    throw new Error(`Missing Plaid credentials for PLAID_ENV=${env}`)
  }

  return cfg
}

const cfg = getPlaidSecrets()

export const plaidClient = new PlaidApi(
  new Configuration({
    basePath: cfg.basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': cfg.clientId,
        'PLAID-SECRET': cfg.secret,
      },
    },
  }),
)
```

This follows the standard Plaid server-side pattern described in the [Quickstart](https://plaid.com/docs/quickstart/) and [Link API](https://plaid.com/docs/api/link/).

## 7. Data model to support Multi-Item Link

Because one Link session can create multiple Items, do not model the flow as "one link token -> one item".

Create these tables.

### 7.1 `plaid_users`

This maps your app user to Plaid's `user_id`.

Fields:

- `id`
- `userId` – your Better-Auth user ID
- `plaidUserId` – Plaid `user_id`
- `createdAt`
- `updatedAt`

Reason:

Multi-Item Link requires `/user/create` first and then using the resulting `user_id` in `/link/token/create`. See [Users API](https://plaid.com/docs/api/users/) and [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/).

### 7.2 `plaid_link_sessions`

Track link sessions so you can reconcile webhooks and `/link/token/get` results.

Fields:

- `id`
- `userId`
- `plaidUserId`
- `linkToken`
- `status` – `created | exited | success | partial | errored`
- `lastLinkSessionId` – Plaid `link_session_id` if known
- `createdAt`
- `updatedAt`

Reason:

In Multi-Item Link, tokens arrive through `SESSION_FINISHED`, `ITEM_ADD_RESULT`, or `/link/token/get`, so you need a durable session record.

### 7.3 `plaid_items`

Store one row per Plaid Item.

Fields:

- `id`
- `userId`
- `plaidUserId`
- `plaidItemId`
- `plaidAccessToken`
- `institutionId`
- `institutionName`
- `linkToken`
- `linkSessionId`
- `status`
- `createdAt`
- `updatedAt`

Reason:

An Item is a single login at an institution. One Multi-Item session can create multiple Items. See [Items API](https://plaid.com/docs/api/items/).

### 7.4 `plaid_accounts`

Store accounts under an Item.

Fields:

- `id`
- `plaidItemRowId`
- `plaidAccountId`
- `name`
- `officialName`
- `mask`
- `type`
- `subtype`
- `holderCategory`
- `currentBalance`
- `availableBalance`
- `currency`
- `createdAt`
- `updatedAt`

Relevant account types and subtypes are described in the [Accounts API](https://plaid.com/docs/api/accounts/).

### 7.5 `plaid_transactions`

Optional for the first pass, but recommended if dindin will need querying, caching, or account history screens.

Fields:

- `id`
- `plaidTransactionId`
- `plaidAccountRowId`
- `name`
- `merchantName`
- `amount`
- `currency`
- `datePosted`
- `pending`
- `rawJson`
- `createdAt`
- `updatedAt`

### 7.6 future tables for investments

Do not implement in this task unless easy to scaffold, but plan for:

- `plaid_investment_holdings`
- `plaid_investment_securities`
- `plaid_investment_transactions`

## 8. Backend flow to implement

## 8.1 Create or reuse Plaid user

Before creating any Multi-Item link token, ensure the app user has a Plaid `user_id`.

Implementation rule:

- when a logged-in Better-Auth user starts the flow, look up `plaid_users`
- if missing, call `/user/create` with `client_user_id = user.id`
- persist the returned `user_id`

Minimal request shape:

```ts
const response = await plaidClient.userCreate({
  client_user_id: user.id,
})
```

Why this is required:

Plaid's Multi-Item Link docs explicitly say to call `/user/create` first, then pass the returned identifier to `/link/token/create`. See [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/) and [Users API](https://plaid.com/docs/api/users/).

## 8.2 Create Multi-Item link token

Create an oRPC mutation like `plaid.createLinkToken`.

Request logic:

```ts
const response = await plaidClient.linkTokenCreate({
  client_name: 'dindin',
  language: 'en',
  country_codes: ['CA', 'US'],
  user_id: plaidUserId,
  enable_multi_item_link: true,
  products: ['transactions'],
  webhook: process.env.PLAID_WEBHOOK_URL,
})
```

Notes:

- `enable_multi_item_link: true` is required for this mode. See [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/).
- keep `products: ['transactions']` for this task
- do not add `investments` yet
- include a webhook URL, because for Multi-Item Link the recommended way to receive public tokens is by webhook

Persist a `plaid_link_sessions` row when you create the token.

Return to frontend:

```ts
{ linkToken: response.data.link_token }
```

## 8.3 Frontend Link initialization using `react-plaid-link`

Create a client component such as `connect-bank-button.tsx`.

Important behavior difference:

- in a Multi-Item Link session, frontend `onSuccess` is effectively empty for obtaining public tokens
- use `onExit` and `onEvent` for UX and session-end signaling
- the backend will finalize Item creation from webhook data or `/link/token/get`

Suggested component shape:

```tsx
'use client'

import * as React from 'react'
import { usePlaidLink } from 'react-plaid-link'

export function ConnectBankButton({ linkToken, onExitComplete }: {
  linkToken: string
  onExitComplete?: () => void
}) {
  const config = React.useMemo(() => ({
    token: linkToken,
    onSuccess: () => {
      // intentionally do not rely on this in Multi-Item Link
    },
    onExit: async () => {
      await onExitComplete?.()
    },
    onEvent: (eventName: string, metadata: unknown) => {
      // optional analytics / diagnostics
      console.debug('Plaid event', eventName, metadata)
    },
  }), [linkToken, onExitComplete])

  const { open, ready } = usePlaidLink(config)

  return (
    <button type="button" disabled={!ready} onClick={() => open()}>
      Connect accounts
    </button>
  )
}
```

The key point is that the frontend should launch Link normally, but should not assume `onSuccess` contains the tokens it needs. Plaid says the data should come from `SESSION_FINISHED`, `ITEM_ADD_RESULT`, or `/link/token/get` in Multi-Item Link. See [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/).

## 8.4 Webhook endpoint

Implement a public POST route such as:

```text
/api/plaid/webhook
```

It must handle at least:

- `LINK / ITEM_ADD_RESULT`
- `LINK / SESSION_FINISHED`
- optionally `LINK / EVENTS`
- later, relevant `ITEM` and `TRANSACTIONS` webhooks

### 8.4.1 Handle `ITEM_ADD_RESULT`

Use this for early processing of each new Item.

Behavior:

- read `public_token`
- exchange it via `/item/public_token/exchange`
- persist Item row
- optionally call `/accounts/get` immediately and upsert account rows

Per Plaid, this webhook fires after each completed Item add within the session. See [Link API](https://plaid.com/docs/api/link/) and [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/).

### 8.4.2 Handle `SESSION_FINISHED`

Use this as the authoritative session completion event.

Behavior:

- mark the `plaid_link_sessions` row as `success` or `exited`
- if `public_tokens` are present, exchange any not already processed
- store `link_session_id`

Per Plaid, `SESSION_FINISHED` contains the final status and public tokens for Multi-Item Link sessions. See [Link API](https://plaid.com/docs/api/link/) and [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/).

## 8.5 Fallback: pull session results via `/link/token/get`

Because webhook delivery can fail or be delayed, implement a backend method like `plaid.finalizeLinkSession(linkToken)` that calls `/link/token/get`.

Use cases:

- user exits Link and the UI wants to refresh quickly
- webhook not yet received
- webhook outage recovery

What to extract:

- `link_sessions`
- `results.item_add_results`
- institution metadata
- selected accounts
- public tokens

Plaid explicitly recommends webhooks first, with `/link/token/get` as a backup. See [Multi-Item Link](https://plaid.com/docs/link/multi-item-link/) and [Link API](https://plaid.com/docs/api/link/).

Implementation rule:

- dedupe by `public_token` and/or `item_id`
- never assume `on_success` is sufficient in Multi-Item Link

## 8.6 Exchange public token

Whenever you obtain a `public_token`, call:

```ts
const exchange = await plaidClient.itemPublicTokenExchange({
  public_token,
})
```

Persist:

- `access_token`
- `item_id`

See [Items API](https://plaid.com/docs/api/items/).

## 8.7 Fetch and persist accounts

After exchanging a token, call `/accounts/get`.

```ts
const accountsResp = await plaidClient.accountsGet({
  access_token,
})
```

Persist accounts and balances.

Important behavior from Plaid:

- `/accounts/get` returns active accounts on the Item
- balances are cached, not guaranteed real-time
- for real-time balance a separate endpoint would be needed later

See [Accounts API](https://plaid.com/docs/api/accounts/).

For this task, focus on depository accounts with subtypes such as `checking` and `savings`.

## 8.8 Fetch transactions

Implement a backend method such as `plaid.getTransactions({ itemId, startDate, endDate })`.

Use the stored `access_token` for the selected Item.

Recommended implementation approach:

- first implementation can fetch on demand and return normalized results
- optionally also persist transactions to `plaid_transactions`
- if the codebase already has background jobs or sync infrastructure, prefer incremental sync patterns

The original request did not force a specific endpoint shape, so the LLM agent can choose the simplest Plaid Transactions implementation that matches the rest of the app.

The output should at least normalize:

- transaction ID
- account ID
- date
- amount
- merchant/name
- pending status
- category metadata if available

## 9. oRPC API surface

Create a `plaid` router with at least these procedures.

### 9.1 `createLinkToken`

Authenticated mutation.

Responsibilities:

- ensure Better-Auth user exists
- ensure Plaid `user_id` exists in `plaid_users`
- create Multi-Item link token
- store a `plaid_link_sessions` record
- return `linkToken`

### 9.2 `finalizeLinkSession`

Authenticated mutation.

Input:

```ts
{ linkToken: string }
```

Responsibilities:

- call `/link/token/get`
- process `results.item_add_results`
- exchange any new public tokens
- upsert items and accounts
- return a session summary

This is the critical bridge between the frontend and webhook-driven Multi-Item flow.

### 9.3 `listConnectedInstitutions`

Authenticated query.

Returns all connected Items for the current user.

### 9.4 `listAccounts`

Authenticated query.

Returns normalized account rows for all user Items or a selected Item.

### 9.5 `getTransactions`

Authenticated query.

Input:

```ts
{ plaidItemId: string; startDate: string; endDate: string }
```

Returns transactions for the requested Item.

## 10. UI flow in dindin

Recommended route: a settings page or onboarding step such as:

```text
/settings/bank-connections
```

Page sections:

- explanation text: "Connect one or more bank accounts"
- button using `react-plaid-link`
- loading state while finalizing the session
- list of connected institutions
- nested list of accounts under each institution
- transactions panel for selected account

Recommended UX for Multi-Item Link:

- after Link closes, call `plaid.finalizeLinkSession({ linkToken })`
- then refetch `listConnectedInstitutions` and `listAccounts`
- show partial success correctly if one institution connected and another failed or was abandoned

Because Multi-Item Link can add multiple Items in one session, the UI must not assume a single connected bank after one Link launch.

## 11. Better-Auth integration rules

Use Better-Auth session identity as the only source of app user identity.

Rules:

- `client_user_id` sent to Plaid should be your internal user ID, not email, not phone number
- all Plaid rows must be scoped to authenticated user ID
- all oRPC plaid procedures require auth middleware
- do not accept arbitrary `userId` from the client

This aligns with Plaid's guidance that `client_user_id` should be a unique internal identifier and should not contain PII. See [Users API](https://plaid.com/docs/api/users/) and [Link API](https://plaid.com/docs/api/link/).

## 12. Sandbox testing plan

## 12.1 basic end-to-end Multi-Item Link test

Use `PLAID_ENV=sandbox`.

From the app:

- click Connect accounts
- in Link, connect one institution using sandbox credentials
- continue and add another institution in the same Link session if the flow presents the option
- close the session

Expectations:

- frontend launched successfully with `react-plaid-link`
- backend received webhooks or successfully finalized via `/link/token/get`
- one or more `plaid_items` rows were created
- `plaid_accounts` rows exist for checking/savings accounts

General sandbox login credentials from the Quickstart docs are:

- username: `user_good`
- password: `pass_good`
- MFA code if prompted: `1234`

See [Quickstart](https://plaid.com/docs/quickstart/).

## 12.2 webhook validation

Use sandbox webhook helpers where useful.

Useful endpoints described by Plaid include:

- `/sandbox/item/fire_webhook`
- `/sandbox/item/reset_login`
- `/sandbox/transactions/create`

See [Sandbox API](https://plaid.com/docs/api/sandbox/).

Test cases:

- webhook endpoint receives `ITEM_ADD_RESULT`
- webhook endpoint receives `SESSION_FINISHED`
- duplicate webhook deliveries do not create duplicate items
- finalization via `/link/token/get` still works if webhook processing is disabled

## 12.3 transaction testing

For deeper transaction validation:

- create a sandbox Item compatible with dynamic transaction testing if needed
- use `/sandbox/transactions/create` to add transactions
- fetch them through your transactions procedure

See [Sandbox API](https://plaid.com/docs/api/sandbox/).

## 12.4 update mode testing later

Not required for first pass, but plan for it.

Use `/sandbox/item/reset_login` to force `ITEM_LOGIN_REQUIRED`, then later implement update-mode link token creation. See [Sandbox API](https://plaid.com/docs/api/sandbox/) and [Items API](https://plaid.com/docs/api/items/).

## 13. Important implementation constraints

### 13.1 Do not rely on frontend `onSuccess` for Multi-Item Link

This is the most important behavioral difference.

For Multi-Item Link:

- `onSuccess` is not the authoritative source of public tokens
- use webhooks or `/link/token/get`

### 13.2 Do not model one Link session as one Item

A single link token can produce multiple Items.

### 13.3 Use webhooks as primary, `/link/token/get` as backup

This is the recommended Plaid approach for Multi-Item Link.

### 13.4 Keep products minimal for now

Use:

```ts
products: ['transactions']
```

Do not add `auth` unless you specifically need it in this task.

Do not add `investments` yet.

## 14. Future task: investments and Questrade

This should be implemented after the base checking/savings flow is working.

Follow-up work:

- confirm Questrade institution support using `/institutions/search` with Canada and `products: ['investments']`
- create a dedicated investments Link flow or expand the Multi-Item flow depending on product strategy
- add `investments` product
- implement:
    - `/investments/holdings/get`
    - `/investments/transactions/get`
- persist holdings, securities, and investment transactions in new tables

Important notes from Plaid investments docs:

- holdings come from `/investments/holdings/get`
- investment transactions come from `/investments/transactions/get`
- investment transaction results are paginated
- if asynchronous extraction is used, listen for `HISTORICAL_UPDATE`

See [Investments API](https://plaid.com/docs/api/products/investments/) and [Institutions API](https://plaid.com/docs/api/institutions/).

## 15. Concrete execution checklist for the LLM agent

1. Add the `plaid` and `react-plaid-link` packages if not already present.
2. Update `packages/env/src/server.ts` to register the Plaid server environment keys.
3. Create a server-only Plaid client config module within the existing `packages/api` structure.
4. Add Drizzle tables under `packages/db/src/schema`:
    - `plaid_users`
        - `plaid_link_sessions`
        - `plaid_items`
        - `plaid_accounts`
        - optionally `plaid_transactions`
5. Run migrations for SQLite/Turso.
6. Create oRPC `plaid.createLinkToken` mutation in the existing `apps/web` server/router structure:
    - ensure Better-Auth session
        - ensure Plaid `user_id` exists via `/user/create`
        - call `/link/token/create` with `enable_multi_item_link: true`
        - persist session row
7. Create frontend connect button using `react-plaid-link`, reusing the existing `packages/ui` structure where appropriate.
8. Create public webhook route for Plaid.
9. Implement webhook handlers for:
    - `ITEM_ADD_RESULT`
        - `SESSION_FINISHED`
10. Implement token exchange logic and item/account upserts.
11. Implement `plaid.finalizeLinkSession(linkToken)` using `/link/token/get`.
12. After Link exits, call `finalizeLinkSession` from the UI and refetch connection data.
13. Implement `listConnectedInstitutions` and `listAccounts` queries.
14. Implement `getTransactions` query.
15. Build the UI page to display institutions, accounts, balances, and transactions, following the existing app structure.
16. Test in sandbox with one and then multiple institutions in a single Link session.
17. Verify duplicate-protection and webhook idempotency.
18. Leave investments scaffolding documented but not active in the initial release.

## 16. Suggested definition of done

The task is done when all of the following are true:

- authenticated dindin user can launch Plaid Link from the app
- Link is initialized via `react-plaid-link`
- Plaid user is created and reused correctly
- link token is created with `enable_multi_item_link: true`
- one Link session can connect more than one institution
- backend processes public tokens from webhook or `/link/token/get`
- Items and accounts are stored in Drizzle/Turso
- accounts page shows account name, type, subtype, mask, and balances
- transactions can be fetched and displayed for a connected checking/savings account
- all of the above works in sandbox

## Sources

- [Plaid Quickstart](https://plaid.com/docs/quickstart/)
- [Plaid Link overview](https://plaid.com/docs/link/)
- [Plaid Link API](https://plaid.com/docs/api/link/)
- [Plaid Multi-Item Link](https://plaid.com/docs/link/multi-item-link/)
- [Plaid Users API](https://plaid.com/docs/api/users/)
- [Plaid Sandbox API](https://plaid.com/docs/api/sandbox/)
- [Plaid Institutions API](https://plaid.com/docs/api/institutions/)
- [Plaid Accounts API](https://plaid.com/docs/api/accounts/)
- [Plaid Items API](https://plaid.com/docs/api/items/)
- [Plaid Investments API](https://plaid.com/docs/api/products/investments/)

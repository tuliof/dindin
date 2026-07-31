# Household Finance Dashboard

**Version:** 0.2  
**Status:** Approved product requirements  
**Audience:** Two household members  
**Deployment:** Private homelab, home LAN only  
**Currency:** CAD  
**Initial provider:** Lunchflow Personal API

## 1. Product summary

A private financial dashboard for a couple that consolidates banking and
investment data, explains spending, tracks savings goals, and helps the
household make informed trade-offs between spending, saving, and goals.

The application will show:

- Current household and personal financial positions.
- Account balances and transactions.
- Investment balances and supported holdings.
- Spending by category and owner.
- Savings goals and progress.
- Available, reserved, and unallocated cash.
- Subscriptions and unusual spending.
- Forecasts and budget status.
- Concise AI-generated recommendations.

The application may recommend and prepare changes, but it must never transfer
money, place trades, or perform other financial transactions.

## 2. Problem

Financial information is distributed across multiple institutions and account
types, including:

- Canadian banks
- Credit-card providers
- Investment institutions

This makes it difficult to answer:

- What is our current financial position?
- Where is our money going?
- How much can we safely save?
- Are we on track for our goals?
- Which goal should receive the next dollar?
- What should change after an unexpected expense?

The application should answer these questions in one place with minimal manual
maintenance.

## 3. Product principles

1. Facts come before recommendations.
2. Physical accounts remain separate sources of truth.
3. Pools, goals, budgets, and allocations are virtual planning concepts.
4. AI recommendations must be explainable and require approval.
5. Imported financial facts are immutable.
6. User corrections are stored as overlays or application-level changes.
7. The application should minimize repetitive manual work.
8. Unsupported provider data must be shown as unavailable, not invented.
9. Household totals must not double-count accounts, transfers, or allocations.
10. Recommendations should be concise and direct.

## 4. Users and access

The application supports one household with two users:

- Partner A
- Partner B

Each user has a separate password-protected account.

Both users can access the household financial view and the shared financial
data. Owner-only financial visibility is not required initially.

Transactions may be marked `advisor_hidden`. This flag:

- Is visible to household users.
- Does not remove the transaction from internal calculations.
- Is stored for future advisor views and exports.
- Does not have filtering or export behaviour until those features are built.

## 5. Success criteria

The application is successful when the household can:

- See supported accounts in one place.
- Understand how much and where it spends.
- Identify unnecessary or excessive spending.
- Set and track savings goals.
- See whether goals are on track.
- Determine how much can safely be allocated to savings and goals.
- Understand trade-offs after unexpected expenses.
- Complete a bi-weekly financial review in approximately 45–60 minutes.

## 6. Delivery phases

### Phase 0: Foundation

Include:

- Docker Compose deployment.
- Next.js application.
- SQLite database and migrations.
- Two-user authentication.
- Household membership.
- Lunchflow provider adapter.
- Background worker process.
- Raw and normalized data storage.
- Idempotent imports.
- Sync history and retry.
- Application and worker logs.
- Health checks.
- NAS backup support.

### Phase 1: Financial visibility

Include:

- Account balances.
- Credit-card balances.
- Transaction history.
- Up to one year of history where available.
- Investment account balances.
- Holdings where supported.
- Unrealized gains where supported.
- Contributions and withdrawals where supported.
- Account ownership.
- Account type and institution.
- Account identifiers supplied by the provider.
- Explicit household-inclusion settings.
- Household and personal views.
- Basic cash-flow summaries.
- Data freshness indicators.
- Sync status page.

Net worth is not required in Phase 1.

### Phase 1.1: Net worth

Include:

- Household assets.
- Household liabilities.
- Household net worth.
- Historical net-worth snapshots.
- Personal household-share views.

### Phase 2: Categorization and spending analysis

Include:

- Categories and subcategories.
- Transaction scopes.
- Merchant normalization.
- Transfer detection.
- Credit-card payment detection.
- AI categorization suggestions.
- Confidence scores.
- Review queue for uncertain transactions.
- Categorization rules.
- User corrections.
- Subscription detection.
- Unusual-spending detection.
- Transaction notes.
- Advisor-hidden transaction flag.

### Phase 3: Budgeting, goals, forecasting, and advice

Include:

- Household budget.
- Personal spending allowances.
- Shared and personal goals.
- Account pools.
- Virtual goal allocations.
- Recurring income and expenses.
- Monthly cash-flow forecasts.
- Goal projections.
- Scenario modelling.
- Priority-based allocation recommendations.
- Bi-weekly review workflow.
- AI-generated financial summaries.
- AI chat for financial scenarios.
- AI-generated trade-off recommendations.

### Phase 4: Tax and contribution planning

Include:

- Simple RRSP contribution scenarios.
- Estimated RRSP tax impact.
- User-entered RRSP deduction room.
- FHSA contribution tracking.
- TFSA contribution tracking where data is available.
- Contribution recommendations.
- Account-allocation recommendations.
- Tax-year views.

Exclude:

- Tax-return preparation.
- CRA filing.
- Automated HST calculations.
- Full self-employment accounting.
- Business-expense deductions.
- Investment trading recommendations.

For now, HST is represented by a protected goal such as `HST Set-Aside`.

### Reports and exports

Reports and exports are not currently defined. The
`advisor_hidden` flag should be stored now so those features can use it later.

## 7. Account model

Each physical bank, credit-card, or investment account is stored separately.

An account may contain:

- Institution.
- Provider account identifier.
- Display name.
- Account type.
- Account class.
- Currency.
- Owner.
- Household-inclusion status.
- Current balance.
- Historical balance snapshots.
- Last successful sync.
- Provider capabilities.

Examples include:

- Savings accounts.
- Chequing accounts.
- Credit cards.
- TFSA accounts.
- FHSA accounts.
- RRSP accounts.
- Other supported investment accounts.

Accounts are never merged in storage or synchronization.

### Account ownership

An account can be owned by:

- Partner A.
- Partner B.
- Both jointly.

Actual account ownership is stored separately from household planning and goal
ownership.

### Household inclusion

Each account has an explicit household-inclusion setting.

Only accounts explicitly included in the household participate in:

- Household dashboards.
- Household net worth.
- Household cash-flow planning.
- Household goals and pools.

### Personal views

The household view counts every included account exactly once.

Each personal view includes:

- Accounts associated with that user.
- Personal goals.
- Relevant household goals.
- Personal spending.
- A calculated 50/50 share of the included household assets and liabilities.

The 50/50 value is a household reporting convention and must be labelled
clearly as a household share, not as legal ownership or legal net worth.

## 8. Account pools

An account pool is a virtual group of physical accounts used for financial
planning.

Examples:

```text
Down Payment Pool
- Partner A's FHSA

Anniversary and Gaming Pool
- Partner A's bank savings
- Partner B's bank savings
```

Pools allow multiple goals to share one or more savings accounts without
requiring separate bank accounts for every goal.

### Pool rules

- A pool may contain one or more accounts.
- An account may belong to at most one active pool.
- An account may remain unpooled.
- A pool may fund multiple goals.
- A goal may be funded by multiple pools.
- Pools must contain accounts in the same currency.
- Credit-card accounts cannot fund pools.
- Account balances remain the source of truth.
- Pool balances are calculated from current account balances.
- Pool membership is a planning classification and does not alter bank data.

Savings, chequing, FHSA, TFSA, and RRSP accounts may fund pools.

Investment pools use the latest available account balance. Changes in
investment market value may cause a pool to become over-allocated.

## 9. Goals

Goals may be personal or household/shared.

Examples:

- House down payment.
- Anniversary trip.
- Gaming PC.
- Emergency fund.
- Retirement.
- HST set-aside.

Each goal supports:

- Name.
- Scope: personal or household.
- Owner where applicable.
- Target amount.
- Target date.
- Priority.
- Protected status.
- Current status.
- Planned monthly contribution.
- Minimum contribution where applicable.
- Available-cash treatment.
- Notes.
- One or more funding pools.

A goal may be funded by multiple pools. A pool may fund multiple goals.

### Goal allocations

Goal allocations are virtual classifications of existing money.

They do not:

- Change account balances.
- Change net worth.
- Create transactions.
- Move money.
- Represent separate bank accounts.

For each pool:

```text
Unallocated pool balance =
  Current pool balance - total goal allocations
```

The system must prevent normal allocations from exceeding the current pool
balance.

### Allocation history

Every allocation change must be recorded.

Each allocation event includes:

- Goal.
- Pool.
- Previous allocation.
- New allocation.
- User or AI source.
- Timestamp.
- Optional reason.
- Related scenario or approval, where applicable.

This provides full allocation traceability.

### Over-allocation

An account balance, pool balance, withdrawal, transfer, fee, or market-value
change may cause a pool to become over-allocated.

When that happens, the system must:

1. Mark the pool as over-allocated.
2. Show the shortfall.
3. Mark affected goals as potentially underfunded.
4. Create a reconciliation task.
5. Suggest possible resolutions.
6. Require confirmation before changing allocations.

The system must not automatically move money between goals or reduce a goal.

Suggested resolutions may include:

- Reduce the lowest-priority unprotected goal.
- Reduce several goals proportionally.
- Fund the shortfall from another pool.
- Leave the issue unresolved.

Protected goals should not be suggested for reduction by default.

### Available-cash treatment

Each goal has a setting controlling whether its allocation counts as available
cash.

Supported values:

- `reserved`: excluded from discretionary available cash.
- `flexible`: included in available cash.

New goals default to `reserved`.

Examples:

| Goal | Default |
|---|---|
| HST Set-Aside | Protected and reserved |
| Emergency fund | Protected and reserved |
| House down payment | Reserved |
| Anniversary trip | Reserved |
| Gaming PC | Reserved, configurable |
| General future spending | Flexible |

This setting affects budgets, forecasts, and recommendations. It does not
affect account balances, net worth, transactions, or goal progress.

## 10. Budget model

The budgeting model combines household budgets with personal allowances.

### Household budget

Household categories include:

- Rent.
- Utilities.
- Groceries.
- Insurance.
- Household supplies.
- Shared transportation.
- Restaurants.
- Entertainment.
- Travel.

The first six categories default to household scope.

Restaurants, entertainment, and travel require assignment based on context.

### Personal allowances

Each person has a personal allowance budget.

Allowance rules:

- Allowances are part of the budget.
- Allowances are configured independently for each person.
- Equal amounts are the initial default.
- Rollover is configurable.
- Rollover is disabled by default.
- Transactions assigned to a person count against that person's allowance.

### Transaction scopes

Transactions can be assigned to:

- `household`
- `partner_a`
- `partner_b`
- `unclassified`

Category defaults may assign a scope, but individual transactions can override
the default.

### Budget calculation

The planning model uses both category budgets and overall cash-flow planning:

```text
Planned net income
- planned household expenses
- personal allowances
- planned goal contributions
= planned remaining surplus
```

Category budgets explain where actual spending differs from planned spending.

Budgets use calendar months.

### Pending and unclassified transactions

- Posted transactions count toward finalized budgets.
- Pending transactions are displayed separately.
- Pending transactions do not affect finalized budget totals.
- Unclassified transactions count as spending under `Unclassified`.
- Unclassified transactions enter the AI review queue.

## 11. Income

The application supports both planned and actual income.

### Planned income

Users can configure:

- Recurring planned net income.
- Optional irregular income events.
- Income source and owner.
- Frequency and expected date.

For one partner with recurring primary income:

- Base salary may be configured as recurring income.
- Annual bonus is not planned because its amount is unknown.
- A received bonus appears as actual income when imported.
- A received bonus does not automatically change future planned
  contributions.

For one partner with variable income:

- A manually entered recurring average may be configured.
- Optional irregular income events may be added when predictable.
- Full self-employment accounting is out of scope.

### Actual income

Imported deposits may be classified as actual income and used for
actual-versus-planned reporting.

## 12. Credit-card handling

- A credit-card purchase is an expense on its purchase date.
- A credit-card payment is a transfer.
- Credit-card payments must not count as additional spending.
- A credit-card balance is a liability.
- Refunds offset the original spending category where possible.
- Pending transactions are separate from posted transactions.

Transfers between the household's own accounts must not count as income or
spending.

## 13. Transaction processing

### Imported data

Provider-originated financial facts are immutable.

The application stores:

- Raw provider payloads.
- Provider identifiers.
- Normalized application records.
- Application-level overlays and corrections.

### Phase 2 categorization workflow

1. Apply deterministic categorization rules.
2. Use provider categories where available.
3. Ask AI to classify ambiguous transactions.
4. Automatically apply only high-confidence classifications.
5. Place uncertain transactions in a review queue.
6. Allow users to correct categories, merchants, and scope.
7. Offer reusable rules based on corrections.

Manual editing of imported amounts, dates, balances, or provider identities is
out of scope.

### Merchant normalization

Merchant normalization maps multiple provider descriptions to one merchant.

Example:

```text
AMZN Mktp CA*12345
AMAZON.CA
Amazon Marketplace
```

becomes:

```text
Amazon
```

## 14. Subscriptions and unusual spending

Subscription detection should use:

- Merchant.
- Similar amounts.
- Regular billing interval.
- Recent billing date.
- Historical transactions.
- Account and category.

The subscription view should show:

- Merchant.
- Most recent billing date.
- Most recent amount.
- Estimated frequency.
- Previous billing dates.
- Confidence.
- Active or possibly inactive status.

Unusual-spending detection should identify:

- Transactions materially above normal spending.
- Category spending spikes.
- New merchants with unusually large charges.
- Spending that materially affects a budget or goal.

## 15. AI requirements

The application supports an OpenAI-compatible provider configured by the user.

AI may:

- Categorize transactions.
- Detect subscriptions.
- Detect unusual spending.
- Explain spending changes.
- Generate financial summaries.
- Answer questions about the dashboard.
- Recommend budgets.
- Recommend goal contributions.
- Recommend account allocations.
- Explain tax trade-offs.
- Model hypothetical scenarios.
- Propose changes to application data.

### AI chat and scenarios

Users can describe situations such as unexpected expenses.

Example:

```text
The car repair cost $1,200. What happens if we keep the house goal
unchanged?
```

The AI should:

- Use current dashboard data.
- Explain the effect on budgets and goals.
- Present one or more alternatives.
- State assumptions.
- Show uncertainty.
- Propose changes without applying them automatically.

### AI recommendations

Recommendations must be:

- Concise.
- Direct.
- Based on available data.
- Clear about assumptions.
- Clear about confidence or uncertainty.
- Clear about estimated impact.
- Accompanied by alternatives where appropriate.

### AI change approval

AI changes must follow this workflow:

1. Explain the situation.
2. Present a proposed plan.
3. Show before-and-after values.
4. Show expected effects.
5. Allow the user to approve all, approve selected changes, or reject.
6. Apply approved changes atomically.
7. Record every resulting change in the relevant audit history.

AI may update application data after confirmation, including:

- Categories.
- Categorization rules.
- Budgets.
- Goal priorities.
- Goal allocations.
- Income assumptions.
- Notes.

AI must never:

- Transfer money.
- Place trades.
- Submit tax filings.
- Modify provider credentials.
- Delete financial history.
- Change imported balances.
- Make an irreversible financial transaction.

## 16. Synchronization

The initial integration uses Lunchflow's Personal API capabilities:

- List user accounts.
- Get account balances.
- Get account transactions.
- Get account holdings.

The provider integration must be isolated behind an internal adapter so another
provider can be added later.

### Sync requirements

Syncs must be:

- Idempotent.
- Retryable.
- Logged.
- Safe to repeat.
- Able to record partial failures.
- Able to preserve provider identifiers.
- Able to distinguish unsupported data from missing data.

### Sync page

The application must provide a dedicated sync page showing:

- Sync start time.
- Completion time.
- Provider.
- Accounts included.
- Records imported.
- Status.
- Error details.
- Last successful sync.
- Retry action.
- Partial failure details.

Supported statuses:

- Pending.
- Running.
- Succeeded.
- Partially succeeded.
- Failed.
- Retrying.

The dashboard must show data freshness and clearly identify stale or missing
data.

## 17. Dashboards

### Household dashboard

Show:

- Account balances.
- Credit-card liabilities.
- Cash totals.
- Investment totals.
- Recent income.
- Recent spending.
- Available cash.
- Reserved goal allocations.
- Unallocated cash.
- Budget status.
- Goal progress.
- Upcoming recurring expenses.
- Subscriptions.
- Unusual spending.
- Sync freshness.
- Open reconciliation tasks.
- AI-generated summary.

### Personal dashboard

Show:

- Accounts associated with the user.
- Personal household share.
- Personal spending.
- Personal allowance status.
- Personal goals.
- Relevant household goals.
- Household financial context.

### Bi-weekly review

The standard review view should show:

1. Sync health and stale data.
2. Current account balances and liabilities.
3. Income and spending since the last review.
4. Unusual spending.
5. Subscriptions.
6. Upcoming recurring expenses.
7. Budget status.
8. Goal progress.
9. Forecast changes.
10. AI recommendations and trade-offs.
11. Reconciliation tasks.
12. Notes and decisions.

## 18. Tax and contribution planning

Tax planning is limited to simple estimates.

The RRSP feature may use:

- Tax year.
- Province.
- Employment income.
- Expected bonus only if manually entered after becoming known.
- Existing RRSP contributions.
- User-entered RRSP deduction room.
- Desired deduction amount.
- User-provided assumptions.

Outputs may include:

- Estimated tax impact.
- Contribution required to reach a selected bracket.
- Contribution scenario comparisons.
- Remaining available room.
- Assumptions and limitations.

The application must not infer RRSP room solely from transactions.

HST is represented by a goal and is not calculated automatically.

## 19. Technical and operational requirements

### Technology

- TypeScript 7 is preferred.
- TypeScript 6 is acceptable if required for Next.js or dependency
  compatibility.
- Next.js.
- shadcn/ui.
- SQLite initially.
- Docker Compose.
- A separate worker process.
- PostgreSQL migration should remain possible without significant
  architectural overhead.

### Deployment

- Homelab deployment.
- Home LAN access only.
- No public internet exposure required.
- Separate application and worker containers are acceptable.

### Security

- Separate password-protected users.
- Credentials and API keys must not be committed to source control.
- Financial data is stored in the application database.
- Destructive operations require confirmation.
- No financial actions are performed automatically.

### Backups

- Backups are stored on the NAS.
- Losing up to one week of data is acceptable.
- Database restoration must be possible and documented.

### Observability

Include:

- Application logs.
- Worker logs.
- Sync logs.
- Visible sync errors.
- Failed-sync alerts.
- Health checks.
- Basic local observability available through Next.js and Docker.

Enterprise-grade metrics and distributed tracing are out of scope.

## 20. Explicit non-goals

The initial product will not include:

- Automated money transfers.
- Automated investment trades.
- Tax-return preparation.
- Automated HST calculations.
- Full self-employment accounting.
- Business-expense deduction tracking.
- Investment portfolio optimization.
- Advanced investment performance attribution.
- Mortgage planning.
- Property or vehicle valuation.
- Employer pension modelling.
- Mobile applications.
- Public access.
- Multi-household support.
- Advisor portal.
- Complex role-based permissions.
- Full reports and exports.
- Monte Carlo forecasting.
- Manual editing of imported financial facts.

## 21. Core business rules

1. Each physical account is stored separately.
2. Only explicitly included accounts appear in household views.
3. Household totals count each included account once.
4. Personal household shares default to 50/50.
5. Account ownership and goal ownership are independent.
6. An account can belong to at most one active pool.
7. A pool may contain multiple accounts.
8. A pool may fund multiple goals.
9. A goal may be funded by multiple pools.
10. Pools cannot mix currencies.
11. Credit cards cannot fund goals.
12. Goal allocations do not affect net worth.
13. Credit-card purchases are expenses.
14. Credit-card payments are transfers.
15. Transfers between own accounts are not income or spending.
16. Imported provider facts are immutable.
17. Corrections are application-level overlays.
18. Over-allocation creates a reconciliation task.
19. The system never automatically reduces or reallocates goals.
20. Protected goals are excluded from reduction suggestions by default.
21. Every allocation change is recorded.
22. New goals are reserved by default.
23. Allowance rollover is disabled by default but configurable.
24. Unclassified transactions count as spending.
25. AI recommendations require explicit approval before applying changes.
26. AI cannot perform financial transactions.
27. Unsupported provider fields are shown as unavailable.
28. Bonuses are treated as actual income when received, not planned income.


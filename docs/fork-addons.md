# Fork add-ons and upstream merges

This fork keeps its installable web app, background alerts, single sign-on and AI chat as add-ons: new files that plug
into the journal through Next.js conventions, so merging new commits from the upstream project
touches as little as possible.

## Where the add-ons touch upstream files

| File                                                                                     | Change                                                                                                                                                            | If a merge conflicts                                                        |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web/src/middleware.ts`                                                             | One import and one line: `if (isPublicAppAsset(pathname)) return NextResponse.next();` after the `/login` check.                                                  | Keep upstream's version and add the line back after its public-path checks. |
| `CHANGELOG.md`                                                                           | Entries under `[Unreleased]`.                                                                                                                                     | Keep both.                                                                  |
| `apps/web/src/middleware.ts` (single sign-on)                                            | The gate also turns on for `JOURNAL_OIDC_ISSUER`, lets `/api/auth/*` through, and passes `?next=` to `/login`.                                                    | Keep upstream's version and re-add the three changes.                       |
| `apps/web/src/server/auth.ts`, `server/api.ts`                                           | `authRequired()` (password or OIDC) replaces `passwordConfigured()` in the handler gate; `verifySession` also accepts `o1.` sessions from `server/oidc/store.ts`. | Keep upstream's password logic and re-add `authRequired`/`oidcSession`.     |
| `apps/web/src/app/api/auth/route.ts`, `app/login/page.tsx`                               | A public `GET` describing the sign-in methods; the login page's SSO button, error codes and `next` return path.                                                   | Keep upstream's password flow and re-add the SSO parts.                     |
| `apps/web/src/components/shell.tsx`                                                      | `<SignOutButton />` under the privacy toggle (desktop sidebar and mobile drawer).                                                                                 | Re-add the import and the two elements.                                     |
| `apps/web/package.json`, `pnpm-lock.yaml`                                                | `openid-client` and `jose` (MIT).                                                                                                                                 | Keep upstream's and re-add the two dependencies.                            |
| `apps/web/src/app/journal/page.tsx`                                                      | Three imports and three elements above the day list: `<WeeklyReview timeZone={timeZone} />`, `<AiDigests timeZone={timeZone} />` and `<DayTypeStats />`.          | Keep upstream's page and add the three elements back above the day list.    |
| `apps/web/src/app/api/ai/recap/route.ts`, `.../critique/route.ts`                        | `await` before `linkedAnalyses(...)` (it fetches the day's price action).                                                                                         | Keep upstream's route and add the `await` back.                             |
| `apps/web/src/server/ai.ts` (AI chat)                                                    | `aiModel()` and `aiFailure()` split out of `runAi` (same behavior), `AI_SYSTEM` exported, and `streamAi()` added.                                                 | Keep upstream's `runAi` and re-add the three exports around it.             |
| `apps/web/src/server/ai-scope.ts`                                                        | Filter checks moved into `parseAiFilters()` (the chat's tools use them); `readAiRequest` accepts and returns `stream`.                                            | Keep upstream's checks inside `parseAiFilters` and re-add `stream`.         |
| `apps/web/src/app/api/ai/{recap,critique,weekly}/route.ts`                               | The prompt goes into a variable; `stream: true` returns `streamedAnswer(...)` instead of `ok(...)`.                                                               | Keep upstream's prompt and re-add the two lines.                            |
| `apps/web/src/components/ai-recap.tsx`, `weekly-review.tsx`, `app/trades/[key]/page.tsx` | Requests use `postAiStream` and show the text as it is written.                                                                                                   | Swap `postJson` back to `postAiStream` and re-add the preview.              |
| `apps/web/src/app/reports/page.tsx`                                                      | `<AskJournalChat />` in place of `<AskJournal />` (the component is kept).                                                                                        | Swap the element and import back.                                           |
| `apps/web/src/app/trades/[key]/page.tsx`, `app/journal/[date]/page.tsx`                  | A `<JournalChat>` in the AI review card and an "Ask about this day" card; the day page keeps the last recap to seed it and opens `?chat=` (a digest) in it.       | Re-add the imports and the elements.                                        |
| `apps/web/tests/ai-ui.test.ts`                                                           | Mocks for `journal-chat` and `ai-stream`.                                                                                                                         | Re-add the two mocks.                                                       |
| `apps/web/src/app/reports/page.tsx` (coaching)                                           | A "Habits" tab rendering `<BehaviourPatterns>`.                                                                                                                   | Re-add the tab entry and its branch.                                        |
| `apps/web/src/app/trades/page.tsx`                                                       | `<BulkLabelSuggestions>` in the selection bar.                                                                                                                    | Re-add the import and the element.                                          |
| `apps/web/src/app/trades/[key]/page.tsx` (coaching)                                      | `<TradeLabelSuggestions>`, `<VoiceMemo>`, `<SimilarPast>`, and the replay chart's picture with the critique.                                                      | Re-add the imports and elements.                                            |
| `apps/web/src/app/journal/[date]/page.tsx` (coaching)                                    | `<VoiceMemo>` above the recap and `<SimilarPast>` in the chat card.                                                                                               | Re-add the imports and elements.                                            |
| `apps/web/src/app/import/page.tsx`                                                       | **Suggest with AI** in the column mapper (`suggestMapping`, `mappingNote`).                                                                                       | Re-add the button, note and handler.                                        |
| `apps/web/src/components/rule-checklist.tsx`                                             | **Check with AI** and per-rule suggestions; the select saves through `save()`.                                                                                    | Re-add the AI block.                                                        |
| `apps/web/src/components/trade-market-data.tsx`                                          | The replay chart registers its screenshot (`registerTradeSnapshot`).                                                                                              | Re-add the registration and cleanup.                                        |
| `apps/web/src/app/api/ai/critique/route.ts` (coaching)                                   | Market context from `tradeMarketContext`, and `chartImage`.                                                                                                       | Re-add the context block and image.                                         |
| `apps/web/src/app/api/ai/recap/route.ts`, `.../weekly/route.ts`                          | `recurringLessonsText(...)` appended to the prompt.                                                                                                               | Re-add the line.                                                            |
| `apps/web/src/server/ai.ts` (coaching)                                                   | `withImages` exported and taking `AiImage` (a buffer or `{ data, mediaType }`).                                                                                   | Re-add the export and type.                                                 |
| `packages/core/src/index.ts`                                                             | `export * from "./behaviour";`                                                                                                                                    | Re-add the export.                                                          |
| `apps/web/src/components/shell.tsx` (performance)                                        | `NavLink` prefetches on hover, focus or touch (`prefetch={false}` plus `router.prefetch`).                                                                        | Re-add the three handlers and `prefetch={false}`.                           |
| `apps/web/src/components/shell.tsx` (external analysis)                                  | An "External analysis" entry in `NAV` (icon `MonitorPlay`).                                                                                                       | Re-add the entry and the icon import.                                       |
| `apps/web/src/components/shell.tsx` (backtesting)                                        | A "Backtesting" entry in `NAV` after Charts (icon `FlaskConical`).                                                                                                | Re-add the entry and the icon import.                                       |
| `apps/web/src/components/shell.tsx` (alerts)                                             | An "Alerts" entry in `NAV` after External analysis (icon `BellRing`).                                                                                             | Re-add the entry and the icon import.                                       |
| `apps/web/src/components/shell.tsx` (update notice)                                      | `<UpdateNotice />` at the end of the sidebar footer.                                                                                                              | Re-add the import and the element.                                          |
| `Dockerfile`, `docker-compose.yml` (update notice)                                       | A `JOURNAL_BUILD_COMMIT` build argument, kept as an environment variable in the image.                                                                            | Re-add the `ARG`/`ENV` pair and the compose `build.args`.                   |
| `packages/core/src/index.ts` (backtesting)                                               | `export * from "./backtest";` for the fork's `packages/core/src/backtest.ts`.                                                                                     | Re-add the export.                                                          |
| `apps/web/src/app/journal/[date]/page.tsx` (external analysis)                           | `<ExternalOpinions>` above "Ask about this day", appending to the note like recaps.                                                                               | Re-add the import and the element.                                          |
| `apps/web/src/server/market-data/http.ts`, `transport.ts`, `public-crypto.ts`            | Concurrent grid-aligned `windows()`, per-host `HOST_LIMITS`, hour-long cache for past pages, Binance symbol details beside the candles.                           | Keep upstream's adapters and re-add the pacing, paging and cache changes.   |

Nothing else upstream owns is changed: no database schema, bootstrap or upgrade edits (the
add-ons create their own tables), no `next.config.ts` or `layout.tsx` edits. The only
dependencies added are single sign-on's (push uses Node's crypto).

## Bug fixes in upstream code

The September 2026 audit (branch `chore/audit`) fixed bugs in upstream-owned files. They are
fixes, not add-ons, and are worth proposing upstream. On a merge conflict keep upstream's
structure and re-apply the fix; each one has a test that fails without it.

- **Security** (`server/api.ts`, `server/auth.ts`, `app/api/auth/route.ts`): cross-site
  changes refused, signed and expiring password sessions, a sign-in pause, 400 for malformed
  bodies, raw database errors kept out of responses. Tests: `api-security.test.ts`.
- **Reads after writes** (`lib/api-request.ts`, `lib/use-api.ts`): a refresh never joins a
  read started before it. Test: `api-request.test.ts`.
- **Importers and core** (`packages/importers/src/**`, `packages/core/src/metrics.ts`):
  MetaTrader 4 profit and swap, MT5 swap credits, decimal commas, TradeZella fees, sides and
  times, DAS short sells, ThinkorSwim options, fill order at one instant, UTC suffixes and
  dash dates, `returnOnNotional`. Hashes stay stable; see "Parsing fixes and earlier
  imports" in `docs/importers.md`. Tests: the package test suites.
- **Accounts, trades and data** (`app/api/accounts/**`, `app/api/trades/**`,
  `app/api/playbooks/**`, `app/api/notes/**`, `app/api/journal/[date]`, `app/api/export`,
  `app/api/executions`, `app/api/settings`, `server/executions.ts`,
  `server/trades-query.ts`): transfers and deletes keep or clean every trade reference,
  hand validation, manual fills stored as UTC instants, spreadsheet-safe CSV export,
  multipliers rebuilt only when changed. Tests: `account-data`, `api-validation`,
  `manual-fills`, `export-data`, `multipliers`, `trade-status`.
- **Pages** (dashboard, trades, trade detail, notebook, playbooks, progress, import, login,
  settings, accounts, reports; `components/manual-trade-entry.tsx`,
  `import-reconciliation.tsx`, `prop-firm-*.tsx`, `report-market-estimates.tsx`,
  `market-csv-settings.tsx`, `charts/daily-bars.tsx`): currency on the dashboard, labelled
  fields, keyboard and drop import, partial legs refused, typed numbers never clearing a
  value, the notebook's open note kept while searching, loading and error states, signed
  P&L, ids that work over plain http (`lib/random-id.ts`). Tests: `ai-ui`,
  `notebook-editor`, `random-id` and the page tests.

## Files the add-ons own

- Installable app: `app/manifest.ts`, `app/icons/[name]/route.tsx`, `app/apple-icon.tsx`,
  `app/icon.tsx` (the tab icon),
  `components/app-icon.tsx`, `lib/pwa.ts`, `instrumentation-client.ts`, `public/sw.js`.
- Background alerts and the Alerts page: `server/background-alerts/*` (with the preferences
  and `notification_log`), `instrumentation.ts`, `instrumentation-node.ts`, `app/api/alerts/**`,
  `app/alerts/page.tsx`, `components/alerts/*`, `components/background-alerts.tsx`,
  `lib/alert-messages.ts`, `lib/alert-preferences.ts`, tests `background-alerts.test.ts`,
  `alert-preferences.test.ts` and `web-push.test.ts`.
- Single sign-on: `server/oidc/*` (configuration, provider client, sessions and login
  transactions in their own tables), `app/api/auth/oidc/**`, `app/api/auth/logout/route.ts`,
  `components/sign-out.tsx`, `lib/auth-redirect.ts`, `docs/authentication.md`, tests
  `oidc-auth.test.ts`, `oidc-config.test.ts` and `oidc-provider-fixture.ts`.
- AI chat: `server/ai-agent/*` (tools, chat turn, conversations in their own tables),
  `server/ai-stream.ts`, `app/api/ai/chat/**`, `components/journal-chat.tsx`,
  `components/ask-journal-chat.tsx`, `lib/ai-chat.ts`, `lib/ai-stream.ts`, `docs/ai-chat.md`,
  test `ai-chat.test.ts`. Scheduled digests: `server/ai-digests/*`, `app/api/ai/digests/**`,
  `components/ai-digests.tsx`, tests `ai-digests.test.ts` and `ai-provider-fixtures.ts`; the
  scheduler starts from `instrumentation-node.ts`.
- Explained alerts: `lib/alert-explain.ts`, test `alert-explain.test.ts`.
- Update notice (docs/updates.md): `server/update-check.ts`, `app/api/update/route.ts`,
  `components/update-notice.tsx`, test `update-check.test.ts`.
- Chart workspace (docs/charts.md#workspace): `app/charts/workspace/page.tsx`,
  `components/chart-workspace.tsx`, `components/workspace-symbol-search.ts`,
  `lib/chart-workspace.ts`, `server/chart-workspace/store.ts` (its `chart_workspaces` table),
  `app/api/chart-workspace/route.ts`, test `chart-workspace.test.ts`. It replaced the fork's
  multiview on the Charts page.
- Backtesting (docs/backtesting.md): `packages/core/src/backtest.ts` (the fill engine and
  report), `lib/backtest-session.ts`, `lib/backtest-replay.ts`, `lib/backtest-strategies.ts`,
  `server/backtest/*` (its `backtest_sessions` table), `app/api/backtests/**`,
  `app/backtest/**`, `components/backtest/*`.
- External analysis (docs/external-analysis.md): `lib/youtube.ts`, `lib/external-summary.ts`,
  `server/external-analysis/*` (its own tables; scheduler started from `instrumentation-node.ts`),
  `app/api/external/**`, `app/external/page.tsx`, components `external-summary-view.tsx` and
  `external-opinions.tsx`, the chat's `external_opinions` tool, tests `youtube`,
  `youtube.live`, `external-analysis` and `external-summary`.
- AI coaching (docs/ai-coaching.md): `packages/core/src/behaviour.ts`; `lib/{lesson-tracking,trade-context,goals,plan-draft,note-search,trade-snapshot}.ts`;
  `server/{ai-structured,ai-images,lessons,trade-context,goals,note-search}.ts` (goals and note passages in their own
  tables); `app/api/{behaviour,lessons,goals,notes-search}/**` and
  `app/api/ai/{playbook-check,suggest-labels,suggest-mapping,structure-note,plan-draft,chart-levels,suggest-goals,period-review}/**`;
  components `behaviour-patterns`, `recurring-lessons`, `period-reviews`, `note-search`, `label-suggestions`, `voice-memo`,
  `plan-draft`, `screenshot-levels`; tests `behaviour`, `lesson-tracking`, `trade-context`, `goals`, `plan-draft`,
  `note-search`, `ai-actions`.
- Fork code they plug into (the chart section, not upstream): one `<BackgroundAlerts>` element in
  `app/charts/page.tsx`, and the process-wide feed map in `server/market-data/live.ts`.

## If upstream adds the same Next.js convention files

Next.js allows one `instrumentation.ts`, one `instrumentation-client.ts` and one
`app/manifest.ts`. If upstream adds its own, merge by calling both: keep upstream's `register()`
body and add `await import("./instrumentation-node")` for the Node runtime; append the service
worker registration to upstream's client file; and prefer upstream's manifest, keeping the
`/icons/*` entries if it has none.

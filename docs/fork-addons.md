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

Nothing else upstream owns is changed: no database schema, bootstrap or upgrade edits (the
add-ons create their own tables), no `next.config.ts` or `layout.tsx` edits. The only
dependencies added are single sign-on's (push uses Node's crypto).

## Files the add-ons own

- Installable app: `app/manifest.ts`, `app/icons/[name]/route.tsx`, `app/apple-icon.tsx`,
  `components/app-icon.tsx`, `lib/pwa.ts`, `instrumentation-client.ts`, `public/sw.js`.
- Background alerts: `server/background-alerts/*`, `instrumentation.ts`,
  `instrumentation-node.ts`, `app/api/alerts/**`, `components/background-alerts.tsx`,
  `lib/alert-messages.ts`, tests `background-alerts.test.ts` and `web-push.test.ts`.
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
- Fork code they plug into (the chart section, not upstream): one `<BackgroundAlerts>` element in
  `app/charts/page.tsx`, and the process-wide feed map in `server/market-data/live.ts`.

## If upstream adds the same Next.js convention files

Next.js allows one `instrumentation.ts`, one `instrumentation-client.ts` and one
`app/manifest.ts`. If upstream adds its own, merge by calling both: keep upstream's `register()`
body and add `await import("./instrumentation-node")` for the Node runtime; append the service
worker registration to upstream's client file; and prefer upstream's manifest, keeping the
`/icons/*` entries if it has none.

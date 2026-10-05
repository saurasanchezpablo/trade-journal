# Correcting a trade

A trade is computed from its fills (executions), so a wrong value is corrected on the fill:
**Edit fills** on the trade's page, in the Executions card.

## What can be corrected

- Each fill's **time** (in the journal's display timezone, to the second), **side**,
  **quantity**, **price** and **fee**, and the trade's **symbol** (all its fills).
- **Remove** a fill that should not be there, or **Add a fill** that is missing (a
  partial exit you forgot, a scale-in).
- **Save the fills** applies everything at once: the fills change and the account's trades
  are recalculated in one step, so nothing is half saved. A trade needs at least one fill; to
  remove it entirely, delete the trade.

## What stays with the trade

- Notes, tags, mistakes, rating, playbook, stop loss, profit target and the reviewed mark,
  rule checks, chart plan links, attached files, notebook links and AI chats stay with the
  trade, even when the correction changes its first fill's time, symbol or side (which is
  how a trade is identified): the page moves to the trade's new address.
- A correction can also reshape trades: an earlier exit can close the position before a
  later fill, which then starts its own trade; a corrected symbol can join another trade.
  The trade that continues the corrected one keeps its annotations; when it merges into a
  trade you had already annotated, that trade keeps its own and gains only what it lacked.
- A fill that would be identical to another fill in the account (same symbol, side,
  quantity, price and time) is refused.

## Imported and synced fills

- A corrected fill from a statement import or a broker sync keeps matching its source:
  importing the same statement again does not add the old values back as a second fill.
- A fill removed from an imported or synced trade is remembered and not added again by a
  later import or sync of the same fill. Typing it back by hand works.
- When a statement gave a fill's P&L directly (TradeZella and similar exports), correcting
  its price, quantity or side recalculates that P&L from the prices instead.

## History

Every correction is listed under the trade's fills (**N corrections to these fills**):
what was added, removed or changed, field by field, with when.

## Code

`server/fill-corrections.ts` (the correction, its tables `fill_corrections` and
`removed_fills`, created on first use), `app/api/trades/[key]/fills/route.ts` (`GET` the
history, `PUT { fills }` the whole corrected list: rows with an `id` are that fill, rows
without one are added, fills left out are removed; answers `{ key, changed }`),
`lib/fill-editor.ts` (rows as typed, times in a timezone), `components/trade-fills-editor.tsx`
and `components/fill-corrections.tsx`. Imports and syncs skip removed fills in
`insertExecutions` (`server/executions.ts`). Tests `fill-corrections.test.ts` and
`fill-editor.test.ts`.

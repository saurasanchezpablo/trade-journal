# Update notice

When a newer version of the journal is published, the bottom of the sidebar says **A new
update is available**, linked to the list of changes on GitHub. It is only that line: no
popup, nothing to dismiss, and the journal keeps working as it is until you update.

## How it knows

- **The running version** is the commit the server was built from: `JOURNAL_BUILD_COMMIT`
  when set (Docker images get it as a build argument, below), or else the commit checked out
  in the journal's own folder (its `.git`, next to `pnpm-workspace.yaml`). With neither, the
  notice never shows.
- **The published version** is the newest commit of the repository's branch on GitHub: the
  checkout's `origin` when it is on GitHub, or `JOURNAL_UPDATE_REPO` (`owner/name`), else
  `saurasanchezpablo/trade-journal`; the branch is `JOURNAL_UPDATE_BRANCH`, `main` by
  default.
- The server asks GitHub's public API at most every six hours (an hour after a failure):
  first the branch's newest commit, which sends nothing about your journal; only when it
  differs from the running one, a comparison, which names the running commit, to count the
  changes you do not have. A version built from changes GitHub does not know, or one newer
  than the branch, shows nothing.
- Turn it off with `JOURNAL_UPDATE_CHECK=off`.

## Docker

The image does not contain the repository, so pass the commit when building:

```bash
JOURNAL_BUILD_COMMIT=$(git rev-parse HEAD) docker compose build
# or
docker build --build-arg JOURNAL_BUILD_COMMIT=$(git rev-parse HEAD) .
```

## Code

`server/update-check.ts` (the running commit, the repository, the cached GitHub check),
`app/api/update/route.ts`, `components/update-notice.tsx` (in the sidebar footer), test
`update-check.test.ts`.

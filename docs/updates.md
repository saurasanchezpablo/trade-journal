# Update notice

When a newer release of the journal is published on GitHub, the bottom of the sidebar says
**A new update is available**, linked to the release and its notes (hovering it names the
release). It is only that line: no popup, nothing to dismiss, and the journal keeps working
as it is until you update.

## How it knows

- **The published version** is the repository's latest GitHub release (drafts and
  pre-releases never count): the checkout's `origin` when it is on GitHub, or
  `JOURNAL_UPDATE_REPO` (`owner/name`), else `saurasanchezpablo/trade-journal`. Commits pushed
  without a release show nothing. A repository without releases shows nothing.
- **The running version** is the commit the server was built from: `JOURNAL_BUILD_COMMIT`
  when set (Docker images get it as a build argument, below), or else the commit checked out
  in the journal's own folder (its `.git`, next to `pnpm-workspace.yaml`). GitHub says whether
  that commit already contains the release's tag: if it does (the release itself, or a later
  commit), nothing shows; if it lacks any of the release's commits, the notice shows.
- **Without a known commit**, or one GitHub has never seen (a build with local changes), the
  app's version number (`version` in `apps/web/package.json`) is compared with the release's
  tag (`v0.2.0` or `0.2.0`); a tag that is not a version number never shows the notice.
- The server asks GitHub's public API at most every six hours (an hour after a failure):
  the latest release, which sends nothing about your journal, then, with a release, one
  comparison naming the running commit.
- Turn it off with `JOURNAL_UPDATE_CHECK=off`.

## Publishing a release

On GitHub, **Releases → Draft a new release**, with a tag such as `v0.2.0` on the commit to
ship, a title and notes (the notice links to them), then **Publish release**. Set the same
number as `version` in `apps/web/package.json` in that commit, so installs that can't name
their commit compare correctly. Or from the command line:

```bash
gh release create v0.2.0 --title "0.2.0" --notes-file notes.md
```

## Docker

The image does not contain the repository, so pass the commit when building:

```bash
JOURNAL_BUILD_COMMIT=$(git rev-parse HEAD) docker compose build
# or
docker build --build-arg JOURNAL_BUILD_COMMIT=$(git rev-parse HEAD) .
```

## Code

`server/update-check.ts` (the running commit and version, the repository, the cached
release check),
`app/api/update/route.ts`, `components/update-notice.tsx` (in the sidebar footer), test
`update-check.test.ts`.

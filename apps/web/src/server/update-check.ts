import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import appPackage from "../../package.json";

/**
 * Whether a newer release of the journal is published: the repository's latest GitHub
 * release (drafts and pre-releases never count), against the version this server runs.
 * Asked at most every six hours (an hour after a failure); nothing about the journal is
 * sent, only the running commit's id to ask GitHub whether it already has the release.
 * `JOURNAL_UPDATE_CHECK=off` turns it off.
 *
 * The running version is its commit when known (`JOURNAL_BUILD_COMMIT`, which a Docker build
 * sets, or the checkout's own `.git`): it has the release when it contains the release's tag.
 * Otherwise the app's version number (`apps/web/package.json`) against the release's tag
 * (`v0.2.0`). The repository is `JOURNAL_UPDATE_REPO` (owner/name), or the checkout's GitHub
 * `origin`, or this fork's.
 */

export const DEFAULT_UPDATE_REPO = "saurasanchezpablo/trade-journal";
const CHECK_EVERY_MS = 6 * 3_600_000;
const RETRY_AFTER_MS = 3_600_000;
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface UpdateStatus {
  available: boolean;
  /** The newer release's tag (`v0.2.0`) and its title. */
  version: string | null;
  name: string | null;
  /** The release's page on GitHub, with its notes. */
  url: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
}

const NONE: UpdateStatus = {
  available: false,
  version: null,
  name: null,
  url: null,
  publishedAt: null,
  checkedAt: null,
};
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG = /^[A-Za-z0-9._/+-]{1,100}$/;

/**
 * The `.git` directory of the journal's checkout holding `from` (a worktree's `.git` file
 * too). Only a checkout of the journal counts, the one with its `pnpm-workspace.yaml`: a
 * folder that happens to sit inside another repository (a home directory under git) is not.
 */
export function findGitDir(from = process.cwd()): string | null {
  let dir = resolve(from);
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, ".git");
    if (existsSync(candidate) && existsSync(join(dir, "pnpm-workspace.yaml"))) {
      if (statSync(candidate).isDirectory()) return candidate;
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(candidate, "utf8"));
      return pointer ? resolve(dir, pointer[1]!.trim()) : null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** The commit a `.git` directory's HEAD points at, following a branch through packed refs. */
export function headCommit(gitDir: string): string | null {
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (SHA.test(head)) return head;
    const ref = /^ref:\s*(refs\/\S+)$/.exec(head)?.[1];
    if (!ref) return null;
    // A worktree keeps its refs in the main repository.
    const common = existsSync(join(gitDir, "commondir"))
      ? resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim())
      : gitDir;
    for (const base of [gitDir, common]) {
      const loose = join(base, ref);
      if (existsSync(loose)) {
        const sha = readFileSync(loose, "utf8").trim();
        if (SHA.test(sha)) return sha;
      }
    }
    const packed = join(common, "packed-refs");
    if (existsSync(packed))
      for (const line of readFileSync(packed, "utf8").split("\n")) {
        const [sha, name] = line.trim().split(" ");
        if (name === ref && sha && SHA.test(sha)) return sha;
      }
  } catch {
    // An unreadable checkout has no known commit.
  }
  return null;
}

/** owner/name of a GitHub remote URL (https or ssh), or null for anything else. */
export function githubRepo(url: string): string | null {
  const match = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
    url.trim(),
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

/** The checkout's `origin` on GitHub, from its config. */
export function originRepo(gitDir: string): string | null {
  try {
    const common = existsSync(join(gitDir, "commondir"))
      ? resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim())
      : gitDir;
    const config = readFileSync(join(common, "config"), "utf8");
    const section = /\[remote "origin"\]([^[]*)/.exec(config)?.[1] ?? "";
    const url = /^\s*url\s*=\s*(.+)$/m.exec(section)?.[1];
    return url ? githubRepo(url) : null;
  } catch {
    return null;
  }
}

export interface UpdateSource {
  commit: string | null;
  /** The app's version number. */
  version: string;
  repo: string;
}

/** What to compare: the running commit and version, and the repository. */
export function updateSource(
  env: Record<string, string | undefined> = process.env,
  from = process.cwd(),
  version: string = appPackage.version,
): UpdateSource {
  const gitDir = findGitDir(from);
  const built = env.JOURNAL_BUILD_COMMIT?.trim().toLowerCase();
  const repo = env.JOURNAL_UPDATE_REPO?.trim();
  return {
    commit: built && SHA.test(built) ? built : gitDir ? headCommit(gitDir) : null,
    version,
    repo: repo && REPO.test(repo) ? repo : (gitDir && originRepo(gitDir)) || DEFAULT_UPDATE_REPO,
  };
}

const semver = (value: string) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/**
 * Whether a release tag (`v0.2.0`, `0.2.0`) is a later version than `current`. A tag that is
 * not a plain version number never counts: there is nothing to compare it with.
 */
export function isNewerVersion(tag: string, current: string): boolean {
  const a = semver(tag);
  const b = semver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function readGitHub(fetcher: Fetcher, url: string): Promise<Record<string, unknown> | null> {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "TradeJournal-update-check",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  // A commit GitHub does not know (built from local changes) answers 404: no update to show.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new Error("GitHub's answer is too large");
  return (await response.json()) as Record<string, unknown>;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Whether the repository's latest release is newer than what this server runs. */
export async function compareWithGitHub(
  source: UpdateSource,
  fetcher: Fetcher = fetch,
  now = Date.now(),
): Promise<UpdateStatus> {
  const checkedAt = new Date(now).toISOString();
  const api = `https://api.github.com/repos/${source.repo}`;
  // A repository without releases answers 404: nothing to tell.
  const latest = await readGitHub(fetcher, `${api}/releases/latest`);
  const tag = text(latest?.tag_name);
  if (!latest || !tag || !TAG.test(tag) || latest.draft === true || latest.prerelease === true)
    return { ...NONE, checkedAt };
  let newer: boolean | null = null;
  if (source.commit) {
    // Base the release, head the running commit: "behind" or "diverged" means the release
    // has commits this version lacks. A commit GitHub does not know (404) falls back below.
    const compared = await readGitHub(
      fetcher,
      `${api}/compare/${encodeURIComponent(tag)}...${source.commit}?per_page=1`,
    );
    const status = compared?.status;
    if (status === "identical" || status === "ahead") newer = false;
    else if (status === "behind" || status === "diverged") newer = true;
  }
  if (newer === null) newer = isNewerVersion(tag, source.version);
  if (!newer) return { ...NONE, checkedAt };
  const page = text(latest.html_url);
  return {
    available: true,
    version: tag,
    name: text(latest.name) ?? tag,
    url:
      page && page.startsWith("https://github.com/")
        ? page
        : `https://github.com/${source.repo}/releases/tag/${encodeURIComponent(tag)}`,
    publishedAt: text(latest.published_at),
    checkedAt,
  };
}

const globalForUpdates = globalThis as typeof globalThis & {
  __journalUpdateCheck?: {
    at: number;
    ok: boolean;
    status: UpdateStatus;
    running?: Promise<UpdateStatus>;
  };
};

/** The cached answer, refreshed in the background once it is old; off when turned off. */
export async function updateStatus(): Promise<UpdateStatus> {
  if (process.env.JOURNAL_UPDATE_CHECK?.trim().toLowerCase() === "off") return NONE;
  const cached = globalForUpdates.__journalUpdateCheck;
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < (cached.ok ? CHECK_EVERY_MS : RETRY_AFTER_MS)) return cached.status;
  if (cached?.running) return cached.running;
  const running = compareWithGitHub(updateSource())
    .then((status) => {
      globalForUpdates.__journalUpdateCheck = { at: Date.now(), ok: true, status };
      return status;
    })
    .catch(() => {
      // Offline or rate limited: keep what was known, try again in an hour.
      const status = cached?.status ?? NONE;
      globalForUpdates.__journalUpdateCheck = { at: Date.now(), ok: false, status };
      return status;
    });
  globalForUpdates.__journalUpdateCheck = {
    ...(cached ?? { at: 0, ok: false, status: NONE }),
    running,
  };
  return running;
}

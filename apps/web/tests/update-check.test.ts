import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_UPDATE_REPO,
  compareWithGitHub,
  findGitDir,
  githubRepo,
  headCommit,
  originRepo,
  updateSource,
  updateStatus,
} from "../src/server/update-check";

const root = mkdtempSync(join(tmpdir(), "journal-update-check-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const A = "a".repeat(40);
const B = "b".repeat(40);

/** A checkout with HEAD on main, the ref either loose or packed. */
function checkout(
  name: string,
  { packed = false, origin = "https://github.com/me/journal.git" } = {},
) {
  const dir = join(root, name);
  const git = join(dir, ".git");
  mkdirSync(join(git, "refs", "heads"), { recursive: true });
  mkdirSync(join(dir, "apps", "web"), { recursive: true });
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(join(git, "HEAD"), "ref: refs/heads/main\n");
  if (packed) writeFileSync(join(git, "packed-refs"), `# pack-refs\n${A} refs/heads/main\n`);
  else writeFileSync(join(git, "refs", "heads", "main"), `${A}\n`);
  writeFileSync(
    join(git, "config"),
    `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${origin}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
  );
  return dir;
}

describe("the version this server runs", () => {
  it("is the checkout's commit, from a loose or a packed branch ref, found from the app folder", () => {
    const loose = checkout("loose");
    expect(findGitDir(join(loose, "apps", "web"))).toBe(join(loose, ".git"));
    expect(headCommit(join(loose, ".git"))).toBe(A);
    expect(headCommit(join(checkout("packed", { packed: true }), ".git"))).toBe(A);
  });

  it("follows a detached HEAD and a worktree's pointer", () => {
    const dir = checkout("detached");
    writeFileSync(join(dir, ".git", "HEAD"), `${B}\n`);
    expect(headCommit(join(dir, ".git"))).toBe(B);
    const main = checkout("main-repo");
    const worktreeGit = join(main, ".git", "worktrees", "wt");
    mkdirSync(worktreeGit, { recursive: true });
    writeFileSync(join(worktreeGit, "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(worktreeGit, "commondir"), "../..\n");
    const worktree = join(root, "wt");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, "pnpm-workspace.yaml"), "packages: []\n");
    writeFileSync(join(worktree, ".git"), `gitdir: ${worktreeGit}\n`);
    expect(findGitDir(worktree)).toBe(worktreeGit);
    expect(headCommit(worktreeGit)).toBe(A);
    expect(originRepo(worktreeGit)).toBe("me/journal");
  });

  it("reads the GitHub repository of the origin, and a build's commit before the checkout's", () => {
    expect(githubRepo("git@github.com:owner/repo.git")).toBe("owner/repo");
    expect(githubRepo("https://github.com/owner/repo")).toBe("owner/repo");
    expect(githubRepo("https://gitlab.com/owner/repo.git")).toBeNull();
    const dir = checkout("source");
    expect(updateSource({}, dir)).toEqual({ commit: A, repo: "me/journal", branch: "main" });
    expect(
      updateSource(
        { JOURNAL_BUILD_COMMIT: B, JOURNAL_UPDATE_REPO: "x/y", JOURNAL_UPDATE_BRANCH: "stable" },
        dir,
      ),
    ).toEqual({ commit: B, repo: "x/y", branch: "stable" });
    // A Docker image without a build commit, or a folder outside any journal checkout (even
    // inside another repository): nothing to compare.
    const outside = mkdtempSync(join(tmpdir(), "journal-no-git-"));
    expect(updateSource({}, outside)).toEqual({
      commit: null,
      repo: DEFAULT_UPDATE_REPO,
      branch: "main",
    });
    rmSync(outside, { recursive: true, force: true });
  });
});

describe("the update notice", () => {
  const github = (newest: string, aheadBy: number | null) =>
    vi.fn(async (url: string) =>
      url.includes("/branches/")
        ? Response.json({ commit: { sha: newest } })
        : aheadBy === null
          ? new Response("Not Found", { status: 404 })
          : Response.json({ status: "ahead", ahead_by: aheadBy }),
    );

  it("says nothing when this is the newest version, without asking for a comparison", async () => {
    const fetcher = github(A, 0);
    const status = await compareWithGitHub(
      { commit: A, repo: "me/journal", branch: "main" },
      fetcher,
    );
    expect(status.available).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("links to what changed when the branch is ahead", async () => {
    const status = await compareWithGitHub(
      { commit: A, repo: "me/journal", branch: "main" },
      github(B, 3),
    );
    expect(status).toMatchObject({
      available: true,
      behind: 3,
      url: `https://github.com/me/journal/compare/${A.slice(0, 12)}...main`,
    });
  });

  it("stays quiet for local changes GitHub does not know, a newer local version, or no known commit", async () => {
    expect(
      (await compareWithGitHub({ commit: A, repo: "me/j", branch: "main" }, github(B, null)))
        .available,
    ).toBe(false);
    expect(
      (await compareWithGitHub({ commit: A, repo: "me/j", branch: "main" }, github(B, 0)))
        .available,
    ).toBe(false);
    const fetcher = github(B, 5);
    expect(
      (await compareWithGitHub({ commit: null, repo: "me/j", branch: "main" }, fetcher)).available,
    ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks nothing when turned off", async () => {
    vi.stubEnv("JOURNAL_UPDATE_CHECK", "off");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await updateStatus()).toMatchObject({ available: false });
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

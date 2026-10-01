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
  isNewerVersion,
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
    expect(updateSource({}, dir, "0.1.0")).toEqual({
      commit: A,
      version: "0.1.0",
      repo: "me/journal",
    });
    expect(
      updateSource({ JOURNAL_BUILD_COMMIT: B, JOURNAL_UPDATE_REPO: "x/y" }, dir, "0.1.0"),
    ).toEqual({ commit: B, version: "0.1.0", repo: "x/y" });
    // A Docker image without a build commit, or a folder outside any journal checkout (even
    // inside another repository): nothing to compare.
    const outside = mkdtempSync(join(tmpdir(), "journal-no-git-"));
    expect(updateSource({}, outside, "0.1.0")).toEqual({
      commit: null,
      version: "0.1.0",
      repo: DEFAULT_UPDATE_REPO,
    });
    rmSync(outside, { recursive: true, force: true });
  });
});

describe("the update notice", () => {
  const release = {
    tag_name: "v0.2.0",
    name: "0.2.0: chart workspace",
    html_url: "https://github.com/me/journal/releases/tag/v0.2.0",
    published_at: "2026-10-01T10:00:00Z",
    draft: false,
    prerelease: false,
  };
  /** GitHub with a latest release (or none) and the running commit's place against it. */
  const github = (latest: object | null, compare: string | null) =>
    vi.fn(async (url: string) =>
      url.endsWith("/releases/latest")
        ? latest
          ? Response.json(latest)
          : new Response("Not Found", { status: 404 })
        : compare === null
          ? new Response("Not Found", { status: 404 })
          : Response.json({ status: compare }),
    );
  const at = (commit: string | null, version = "0.1.0") => ({
    commit,
    version,
    repo: "me/journal",
  });

  it("links to a newer release when this version does not have it", async () => {
    const fetcher = github(release, "behind");
    const status = await compareWithGitHub(at(A), fetcher);
    expect(status).toMatchObject({
      available: true,
      version: "v0.2.0",
      name: "0.2.0: chart workspace",
      url: "https://github.com/me/journal/releases/tag/v0.2.0",
    });
    expect(fetcher.mock.calls[1]![0]).toContain(`/compare/v0.2.0...${A}`);
    // Local commits besides an older version still miss the release.
    expect((await compareWithGitHub(at(A), github(release, "diverged"))).available).toBe(true);
  });

  it("says nothing when this version is the release or newer, or there is no release", async () => {
    expect((await compareWithGitHub(at(A), github(release, "identical"))).available).toBe(false);
    // Running main after the release: the tag is already in it, whatever the version says.
    expect((await compareWithGitHub(at(A, "0.1.0"), github(release, "ahead"))).available).toBe(
      false,
    );
    const none = github(null, "behind");
    expect((await compareWithGitHub(at(A), none)).available).toBe(false);
    expect(none).toHaveBeenCalledTimes(1);
  });

  it("compares version numbers when the running commit is unknown to it or to GitHub", async () => {
    expect((await compareWithGitHub(at(null, "0.1.0"), github(release, null))).available).toBe(
      true,
    );
    expect((await compareWithGitHub(at(null, "0.2.0"), github(release, null))).available).toBe(
      false,
    );
    // Built from local changes GitHub has never seen: the version decides.
    expect((await compareWithGitHub(at(A, "0.3.1"), github(release, null))).available).toBe(false);
    expect(isNewerVersion("v1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("nightly", "0.1.0")).toBe(false);
  });

  it("ignores drafts and pre-releases", async () => {
    expect(
      (await compareWithGitHub(at(null), github({ ...release, prerelease: true }, null))).available,
    ).toBe(false);
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

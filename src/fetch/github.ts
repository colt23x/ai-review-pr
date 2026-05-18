import axios, { AxiosInstance } from "axios";
import { Ticket, FetchConfig } from "../types";

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  closed_at: string | null;
  labels: Array<{ name: string }>;
  assignee: { login: string } | null;
  pull_request?: unknown;
  milestone?: { title: string } | null;
  body: string | null;
}

interface GitHubPR {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged_at: string | null;
  closed_at: string | null;
  labels: Array<{ name: string }>;
  assignee: { login: string } | null;
  milestone?: { title: string } | null;
}

function buildClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: "https://api.github.com",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

function extractStoryPoints(labels: string[]): number | undefined {
  // Supports label conventions: "points:3", "sp:5", "3 points", "story-points-8"
  for (const label of labels) {
    const m =
      label.match(/^(?:points?|sp|story-?points?)[:\s-](\d+)$/i) ||
      label.match(/^(\d+)\s*(?:points?|sp)$/i);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

function deriveStatus(
  issue: GitHubIssue | GitHubPR,
  labelNames: string[],
  isMergedPR: boolean
): Ticket["status"] {
  if (isMergedPR || (issue.state === "closed" && !("merged_at" in issue))) {
    return "done";
  }
  if (labelNames.some((l) => /blocked/i.test(l))) return "blocked";
  if (labelNames.some((l) => /in.?review|review.?in.?progress/i.test(l)))
    return "in_review";
  if (labelNames.some((l) => /in.?progress|wip|doing/i.test(l)))
    return "in_progress";
  if ("pull_request" in issue || "merged_at" in issue) return "in_review";
  return "todo";
}

function derivePriority(labelNames: string[]): Ticket["priority"] {
  for (const l of labelNames) {
    if (/critical|urgent|p0/i.test(l)) return "critical";
    if (/high|p1/i.test(l)) return "high";
    if (/low|p3|nice.?to.?have/i.test(l)) return "low";
  }
  return "medium";
}

async function fetchAllPages<T>(
  client: AxiosInstance,
  path: string,
  params: Record<string, string | number>
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const res = await client.get<T[]>(path, {
      params: { ...params, per_page: 100, page },
    });
    results.push(...res.data);
    // GitHub signals last page when fewer than per_page items are returned
    if (res.data.length < 100) break;
    page++;
    // Respect rate limit headers
    const remaining = parseInt(res.headers["x-ratelimit-remaining"] ?? "1", 10);
    if (remaining < 5) {
      const reset = parseInt(res.headers["x-ratelimit-reset"] ?? "0", 10);
      const wait = Math.max(0, reset * 1000 - Date.now()) + 1000;
      console.warn(`[github] Rate limit low — waiting ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return results;
}

export async function fetchGitHub(config: FetchConfig): Promise<Ticket[]> {
  const token = process.env.GITHUB_TOKEN;
  const reposRaw = process.env.GITHUB_REPOS;
  const milestone = process.env.GITHUB_MILESTONE || config.milestone;

  if (!token) {
    console.warn("[github] GITHUB_TOKEN not set — skipping GitHub fetch");
    return [];
  }
  if (!reposRaw) {
    console.warn("[github] GITHUB_REPOS not set — skipping GitHub fetch");
    return [];
  }

  const repos = reposRaw.split(",").map((r) => r.trim()).filter(Boolean);
  const client = buildClient(token);
  const since = new Date(
    Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const allTickets: Ticket[] = [];

  for (const repo of repos) {
    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
      console.warn(`[github] Skipping malformed repo entry: "${repo}"`);
      continue;
    }

    try {
      // ── Closed issues (done) ────────────────────────────────────────────
      const closedParams: Record<string, string | number> = {
        state: "closed",
        since,
        sort: "updated",
        direction: "desc",
      };
      if (milestone) closedParams.milestone = milestone;

      const closedIssues = await fetchAllPages<GitHubIssue>(
        client,
        `/repos/${owner}/${repoName}/issues`,
        closedParams
      );

      // ── Open issues (todo / in_progress / blocked) ──────────────────────
      const openParams: Record<string, string | number> = {
        state: "open",
        sort: "updated",
        direction: "desc",
      };
      if (milestone) openParams.milestone = milestone;

      const openIssues = await fetchAllPages<GitHubIssue>(
        client,
        `/repos/${owner}/${repoName}/issues`,
        openParams
      );

      // ── PRs (open = in_review; merged in window = done) ─────────────────
      const openPRs = await fetchAllPages<GitHubPR>(
        client,
        `/repos/${owner}/${repoName}/pulls`,
        { state: "open", sort: "updated", direction: "desc" }
      );

      const closedPRs = await fetchAllPages<GitHubPR>(
        client,
        `/repos/${owner}/${repoName}/pulls`,
        { state: "closed", sort: "updated", direction: "desc" }
      );

      const recentMergedPRs = closedPRs.filter(
        (pr) => pr.merged_at && new Date(pr.merged_at) >= new Date(since)
      );

      // ── Normalize ────────────────────────────────────────────────────────
      const issueMap = (issue: GitHubIssue, forceDone = false): Ticket => {
        // Issues endpoint returns PRs too; skip them — handled separately
        const labelNames = issue.labels.map((l) => l.name);
        const isMerged = forceDone;
        return {
          id: `${repo}#${issue.number}`,
          title: issue.title,
          status: isMerged ? "done" : deriveStatus(issue, labelNames, false),
          assignee: issue.assignee?.login ?? "unassigned",
          priority: derivePriority(labelNames),
          storyPoints: extractStoryPoints(labelNames),
          completedAt: issue.closed_at ?? undefined,
          labels: labelNames,
          url: issue.html_url,
        };
      };

      const prMap = (pr: GitHubPR, isMerged: boolean): Ticket => {
        const labelNames = pr.labels.map((l) => l.name);
        return {
          id: `${repo}#${pr.number}`,
          title: pr.title,
          status: isMerged ? "done" : "in_review",
          assignee: pr.assignee?.login ?? "unassigned",
          priority: derivePriority(labelNames),
          storyPoints: extractStoryPoints(labelNames),
          completedAt: pr.merged_at ?? pr.closed_at ?? undefined,
          labels: labelNames,
          url: pr.html_url,
        };
      };

      // Filter out issues that are actually PRs (have pull_request key)
      const pureClosedIssues = closedIssues.filter((i) => !i.pull_request);
      const pureOpenIssues = openIssues.filter((i) => !i.pull_request);

      allTickets.push(...pureClosedIssues.map((i) => issueMap(i)));
      allTickets.push(...pureOpenIssues.map((i) => issueMap(i)));
      allTickets.push(...openPRs.map((pr) => prMap(pr, false)));
      allTickets.push(...recentMergedPRs.map((pr) => prMap(pr, true)));

      console.log(
        `[github] ${repo}: ${pureClosedIssues.length} closed issues, ` +
          `${pureOpenIssues.length} open issues, ` +
          `${openPRs.length} open PRs, ` +
          `${recentMergedPRs.length} merged PRs`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[github] Failed to fetch from ${repo}: ${msg}`);
    }
  }

  // Deduplicate by id (same item can appear in multiple list calls)
  const seen = new Set<string>();
  return allTickets.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

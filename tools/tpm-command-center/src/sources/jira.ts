import { Entity, WorkItem, entityId } from "../model";
import { McpHost } from "../mcp/host";
import { McpServerConfig } from "../config";
import { SourceAdapter, pickTool, asArray, str } from "./adapter";

/**
 * Jira adapter: maps Jira issues (fetched via a Jira MCP server) into WorkItems.
 * Tool names vary across Jira MCP server implementations, so we probe for the
 * common ones rather than binding to a single server.
 */
const SEARCH_TOOLS = [
  "searchJiraIssuesUsingJql", // Atlassian official remote MCP
  "jira_search", // mcp-atlassian (sooperset)
  "search_issues",
  "jql_search",
];

function mapStatus(raw: string | undefined): WorkItem["itemStatus"] {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("block")) return "blocked";
  if (s.includes("review")) return "in_review";
  if (s.includes("progress") || s.includes("doing")) return "in_progress";
  if (s.includes("done") || s.includes("closed") || s.includes("resolved")) return "done";
  return "todo";
}

function mapPriority(raw: string | undefined): WorkItem["priority"] {
  const p = (raw ?? "").toLowerCase();
  if (p.includes("critical") || p.includes("highest") || p.includes("p0")) return "critical";
  if (p.includes("high") || p.includes("p1")) return "high";
  if (p.includes("low") || p.includes("p3") || p.includes("p4")) return "low";
  if (p) return "medium";
  return undefined;
}

export const jiraAdapter: SourceAdapter = {
  name: "jira",

  async fetch(host: McpHost, server: string, cfg: McpServerConfig): Promise<Entity[]> {
    const tool = await pickTool(host, server, SEARCH_TOOLS);
    const jql =
      cfg.options?.jql ??
      "resolution = Unresolved AND updated >= -30d ORDER BY updated DESC";
    const result = await host.callTool(server, tool, { jql, maxResults: 100 });
    const issues = asArray(result, "issues", "results", "items");

    return issues.map((raw): WorkItem => {
      const fields = (raw.fields ?? raw) as Record<string, unknown>;
      const key = str(raw, "key", "id") ?? "unknown";
      const deps = asArray(fields.issuelinks ?? [], "")
        .filter((l) => str(l, "type.inward")?.toLowerCase().includes("blocked"))
        .map((l) => str(l, "inwardIssue.key"))
        .filter((k): k is string => !!k);

      return {
        id: entityId(server, "work_item", key),
        kind: "work_item",
        source: server,
        sourceNativeId: key,
        title: str(fields, "summary", "title") ?? key,
        body: str(fields, "description") ?? "",
        url: str(raw, "self", "url"),
        owner: str(fields, "assignee.displayName", "assignee.emailAddress", "assignee"),
        status: str(fields, "status.name", "status"),
        itemStatus: mapStatus(str(fields, "status.name", "status")),
        priority: mapPriority(str(fields, "priority.name", "priority")),
        dueDate: str(fields, "duedate", "dueDate"),
        createdAt: str(fields, "created", "createdAt"),
        updatedAt: str(fields, "updated", "updatedAt"),
        dependsOn: deps,
        labels: Array.isArray(fields.labels) ? (fields.labels as string[]) : [],
        links: [],
        flags: [],
      };
    });
  },
};

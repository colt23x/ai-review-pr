import * as fs from "fs";
import * as path from "path";

/**
 * Connector configuration (spec §6.2, §3): onboarding a new tool is adding a
 * server entry here, not writing code. Each entry names an MCP server, how to
 * launch/reach it, and which adapter maps its tool results into the unified model.
 */
export interface McpServerConfig {
  /** Which adapter normalizes this server's output: "jira" | "calendar" | ... */
  adapter: string;
  /** stdio transport: command + args to launch the server. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Streamable HTTP transport: URL of a remote MCP server. */
  url?: string;
  /** Optional per-adapter options (project keys, calendar id, etc.). */
  options?: Record<string, string>;
}

export interface Config {
  /** How the TPM appears as assignee/attendee in source tools, for "is this mine" checks. */
  me: {
    names: string[];
    emails: string[];
  };
  /** Days without activity before an owned item is flagged stale (spec §8.3). */
  staleAfterDays: number;
  servers: Record<string, McpServerConfig>;
}

const DEFAULTS: Pick<Config, "staleAfterDays"> = { staleAfterDays: 5 };

export function loadConfig(configPath?: string): Config {
  const p = configPath ?? path.join(process.cwd(), "servers.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      `No config found at ${p}. Copy servers.example.json to servers.json and fill in your MCP servers, or run with --demo.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  return { ...DEFAULTS, ...raw };
}

export function isMe(config: Config, who?: string): boolean {
  if (!who) return false;
  const w = who.toLowerCase();
  return (
    config.me.names.some((n) => n.toLowerCase() === w) ||
    config.me.emails.some((e) => e.toLowerCase() === w)
  );
}

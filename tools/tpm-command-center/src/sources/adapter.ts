import { Entity } from "../model";
import { McpHost } from "../mcp/host";
import { McpServerConfig } from "../config";

/**
 * An adapter turns one MCP server's tool results into unified entities.
 * It is the only tool-specific code in the app, and it is mapping, not
 * integration — transport, auth, and API details live in the MCP server.
 */
export interface SourceAdapter {
  name: string;
  fetch(host: McpHost, server: string, cfg: McpServerConfig): Promise<Entity[]>;
}

/** Pick the first tool a server actually exposes from a list of known names. */
export async function pickTool(
  host: McpHost,
  server: string,
  candidates: string[]
): Promise<string> {
  const available = await host.listTools(server);
  const found = candidates.find((c) => available.includes(c));
  if (!found) {
    throw new Error(
      `Server "${server}" exposes none of the expected tools [${candidates.join(", ")}]. ` +
        `Available: ${available.join(", ")}`
    );
  }
  return found;
}

/** Defensive helpers for mining loosely-shaped MCP results. */
export function asArray(value: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export function str(obj: Record<string, unknown>, ...paths: string[]): string | undefined {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const part of path.split(".")) {
      if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
      else cur = undefined;
    }
    if (typeof cur === "string" && cur.length > 0) return cur;
  }
  return undefined;
}

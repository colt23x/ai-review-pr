import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServerConfig } from "../config";

/**
 * MCP host/client layer (spec §6.2). The only layer that knows a given tool
 * exists: it manages connections to configured MCP servers and calls their
 * tools. Everything above works on the unified model.
 */
export class McpHost {
  private clients = new Map<string, Client>();

  async connect(name: string, cfg: McpServerConfig): Promise<void> {
    const client = new Client({ name: "tpm-command-center", version: "0.1.0" });
    if (cfg.url) {
      await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url)));
    } else if (cfg.command) {
      await client.connect(
        new StdioClientTransport({
          command: cfg.command,
          args: cfg.args ?? [],
          env: { ...(process.env as Record<string, string>), ...(cfg.env ?? {}) },
        })
      );
    } else {
      throw new Error(`Server "${name}": config needs either "command" (stdio) or "url" (http).`);
    }
    this.clients.set(name, client);
  }

  /** List the tool names a connected server exposes (adapters use this to pick a fetch tool). */
  async listTools(server: string): Promise<string[]> {
    const res = await this.client(server).listTools();
    return res.tools.map((t) => t.name);
  }

  /** Call a tool and return its text content parsed as JSON (or raw text if not JSON). */
  async callTool(server: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await this.client(server).callTool({ name: tool, arguments: args });
    const content = res.content as Array<{ type: string; text?: string }> | undefined;
    const text = (content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close().catch(() => undefined);
    }
    this.clients.clear();
  }

  private client(server: string): Client {
    const c = this.clients.get(server);
    if (!c) throw new Error(`Not connected to MCP server "${server}".`);
    return c;
  }
}

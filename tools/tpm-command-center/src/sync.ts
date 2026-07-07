import { Config } from "./config";
import { Entity } from "./model";
import { McpHost } from "./mcp/host";
import { getAdapter } from "./sources";
import { correlate } from "./intelligence/correlate";
import { detectRisks } from "./intelligence/risk";
import { Snapshot } from "./store";

/**
 * The ingest pipeline: connect to every configured MCP server, pull and
 * normalize its data, then run the deterministic intelligence passes
 * (correlate, detect risks) over the unified model.
 */
export async function sync(config: Config, now = new Date()): Promise<Snapshot> {
  const host = new McpHost();
  const entities: Entity[] = [];
  try {
    for (const [name, serverCfg] of Object.entries(config.servers)) {
      const adapter = getAdapter(serverCfg.adapter);
      process.stderr.write(`Connecting to "${name}" (${serverCfg.adapter} adapter)...\n`);
      await host.connect(name, serverCfg);
      const fetched = await adapter.fetch(host, name, serverCfg);
      process.stderr.write(`  ${fetched.length} entities from ${name}\n`);
      entities.push(...fetched);
    }
  } finally {
    await host.closeAll();
  }
  return enrich(entities, config, now);
}

/** Correlation + risk passes; shared by real sync and demo mode. */
export function enrich(entities: Entity[], config: Config, now = new Date()): Snapshot {
  const workstreams = correlate(entities);
  detectRisks(entities, config, now);
  return { syncedAt: now.toISOString(), entities, workstreams };
}

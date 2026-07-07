#!/usr/bin/env node
import "dotenv/config";
import { loadConfig, Config } from "./config";
import { sync, enrich } from "./sync";
import { saveSnapshot, loadSnapshot, Snapshot } from "./store";
import { renderToday } from "./views/today";
import { renderPrep } from "./views/prep";
import { renderRisks } from "./views/risks";
import { demoConfig, demoEntities } from "./demo";

const USAGE = `TPM Command Center — a unified, MCP-connected work surface for TPMs

Usage: tpmcc [--demo] [--config <path>] <command>

Commands:
  sync            Pull from all configured MCP servers and rebuild the local model
  today           "What needs me today?" — attention-ranked view (syncs if no snapshot)
  prep <event>    "Prep me for this meeting." — context pack for a calendar event
  risks           "What's at risk?" — blocked / slipping / stale / owed items

Flags:
  --demo          Run against built-in sample data (no MCP servers needed)
  --config <p>    Path to servers.json (default: ./servers.json)
`;

async function getSnapshot(config: Config, demo: boolean, forceSync: boolean): Promise<Snapshot> {
  if (demo) return enrich(demoEntities(), config);
  const cached = forceSync ? undefined : loadSnapshot();
  if (cached) return cached;
  const snapshot = await sync(config);
  const file = saveSnapshot(snapshot);
  process.stderr.write(`Snapshot saved to ${file}\n`);
  return snapshot;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const configFlag = args.indexOf("--config");
  const configPath = configFlag >= 0 ? args[configFlag + 1] : undefined;
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && (configFlag < 0 || i !== configFlag + 1)
  );
  const command = positional[0];

  if (!command || command === "help") {
    console.log(USAGE);
    return;
  }

  const config = demo ? demoConfig : loadConfig(configPath);

  switch (command) {
    case "sync": {
      const snapshot = await getSnapshot(config, demo, true);
      console.log(
        `Synced ${snapshot.entities.length} entities into ${snapshot.workstreams.length} workstream(s).`
      );
      break;
    }
    case "today": {
      const snapshot = await getSnapshot(config, demo, false);
      console.log(renderToday(snapshot.entities, config));
      break;
    }
    case "prep": {
      const query = positional.slice(1).join(" ");
      if (!query) {
        console.error('Usage: tpmcc prep "<event title or id>"');
        process.exitCode = 1;
        return;
      }
      const snapshot = await getSnapshot(config, demo, false);
      console.log(renderPrep(query, snapshot.entities, snapshot.workstreams));
      break;
    }
    case "risks": {
      const snapshot = await getSnapshot(config, demo, false);
      console.log(renderRisks(snapshot.entities));
      break;
    }
    default:
      console.error(`Unknown command "${command}".\n\n${USAGE}`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

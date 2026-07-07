import * as fs from "fs";
import * as path from "path";
import { Entity, Workstream } from "./model";

/**
 * Local store for the unified model (spec §6.2). Deliberately simple: a JSON
 * snapshot per sync. The command center is a lens, not a system of record —
 * losing this file loses nothing that can't be re-fetched from the sources.
 */
export interface Snapshot {
  syncedAt: string;
  entities: Entity[];
  workstreams: Workstream[];
}

const STORE_DIR = ".tpmcc";
const STORE_FILE = "snapshot.json";

export function saveSnapshot(snapshot: Snapshot, baseDir = process.cwd()): string {
  const dir = path.join(baseDir, STORE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, STORE_FILE);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  return file;
}

export function loadSnapshot(baseDir = process.cwd()): Snapshot | undefined {
  const file = path.join(baseDir, STORE_DIR, STORE_FILE);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Snapshot;
}

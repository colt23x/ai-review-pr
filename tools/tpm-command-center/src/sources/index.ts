import { SourceAdapter } from "./adapter";
import { jiraAdapter } from "./jira";
import { calendarAdapter } from "./calendar";

/**
 * Adapter registry. Phase 1 ships jira + calendar (spec §10); adding Slack,
 * GitHub, etc. means adding one adapter here and a server entry in servers.json.
 */
const ADAPTERS: Record<string, SourceAdapter> = {
  jira: jiraAdapter,
  calendar: calendarAdapter,
};

export function getAdapter(name: string): SourceAdapter {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(
      `Unknown adapter "${name}". Available: ${Object.keys(ADAPTERS).join(", ")}`
    );
  }
  return adapter;
}

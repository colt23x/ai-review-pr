import { Entity, Event, entityId } from "../model";
import { McpHost } from "../mcp/host";
import { McpServerConfig } from "../config";
import { SourceAdapter, pickTool, asArray, str } from "./adapter";

/**
 * Calendar adapter: maps calendar events (fetched via a calendar MCP server,
 * e.g. Google Calendar) into Event entities. Probes common tool names.
 */
const LIST_TOOLS = [
  "list-events", // google-calendar-mcp (nspady)
  "list_events",
  "listEvents",
  "get_events",
  "calendar_list_events",
];

export const calendarAdapter: SourceAdapter = {
  name: "calendar",

  async fetch(host: McpHost, server: string, cfg: McpServerConfig): Promise<Entity[]> {
    const tool = await pickTool(host, server, LIST_TOOLS);
    const now = new Date();
    const horizonDays = Number(cfg.options?.horizonDays ?? 7);
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + horizonDays * 86400_000).toISOString();

    const result = await host.callTool(server, tool, {
      calendarId: cfg.options?.calendarId ?? "primary",
      timeMin,
      timeMax,
    });
    const events = asArray(result, "events", "items", "results");

    return events.map((raw): Event => {
      const id = str(raw, "id", "iCalUID") ?? "unknown";
      const attendees = asArray(raw.attendees ?? [], "")
        .map((a) => str(a, "email", "displayName", "name"))
        .filter((a): a is string => !!a);

      return {
        id: entityId(server, "event", id),
        kind: "event",
        source: server,
        sourceNativeId: id,
        title: str(raw, "summary", "title") ?? "(untitled event)",
        body: str(raw, "description", "body") ?? "",
        url: str(raw, "htmlLink", "url"),
        owner: str(raw, "organizer.email", "organizer.displayName"),
        status: str(raw, "status"),
        start: str(raw, "start.dateTime", "start.date", "start") ?? timeMin,
        end: str(raw, "end.dateTime", "end.date", "end") ?? timeMin,
        attendees,
        recurring: !!str(raw, "recurringEventId"),
        createdAt: str(raw, "created"),
        updatedAt: str(raw, "updated"),
        links: [],
        flags: [],
      };
    });
  },
};

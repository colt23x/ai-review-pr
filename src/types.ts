export interface Ticket {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done" | "blocked";
  assignee: string;
  priority: "critical" | "high" | "medium" | "low";
  storyPoints?: number;
  completedAt?: string;
  labels: string[];
  url: string;
}

export interface FetchConfig {
  lookbackDays: number;
  milestone?: string;
}

export interface ReportConfig {
  teamName: string;
  sprintName: string;
  sprintGoal?: string;
  dateRange: { from: string; to: string };
}

export interface Metrics {
  total: number;
  done: number;
  inProgress: number;
  inReview: number;
  blocked: number;
  todo: number;
  completionRate: number;
  pointsCommitted: number;
  pointsCompleted: number;
  velocityAvailable: boolean;
  byAssignee: Record<string, { done: number; inProgress: number; blocked: number }>;
  blockedTickets: Ticket[];
  spillover: Ticket[];
  doneTickets: Ticket[];
}

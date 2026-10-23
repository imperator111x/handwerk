import { quoteStatus, type JobStatus, type QuoteListItem, type QuoteStatus } from "./offers";

export type { JobStatus };

/** Fortschritt eines angenommenen Auftrags. */
export const JOB_STATUSES = ["offen", "in_arbeit", "fertig", "abgerechnet"] as const;

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  offen: "Offen",
  in_arbeit: "In Arbeit",
  fertig: "Fertig",
  abgerechnet: "Abgerechnet",
};

export function normalizeJobStatus(value: string | null | undefined): JobStatus {
  return JOB_STATUSES.includes(value as JobStatus) ? (value as JobStatus) : "offen";
}

export function isAuftrag(status: QuoteStatus | string | null | undefined): boolean {
  const s = quoteStatus(status);
  return s === "angenommen" || s === "abgerechnet";
}

export function jobStatusForQuote(row: {
  status?: string | null;
  job_status?: string | null;
}): JobStatus {
  if (quoteStatus(row.status) === "abgerechnet") return "abgerechnet";
  if (!isAuftrag(row.status)) return "offen";
  const job = normalizeJobStatus(row.job_status);
  return job === "abgerechnet" ? "fertig" : job;
}

export function filterAuftraege(
  quotes: QuoteListItem[],
  stand: JobStatus | "alle" = "alle",
): QuoteListItem[] {
  const rows = quotes.filter((row) => isAuftrag(row.status));
  if (stand === "alle") return rows;
  return rows.filter((row) => jobStatusForQuote(row) === stand);
}

export function countJobsByStatus(quotes: QuoteListItem[]): Record<JobStatus | "alle", number> {
  const rows = quotes.filter((row) => isAuftrag(row.status));
  const counts: Record<JobStatus | "alle", number> = {
    alle: rows.length,
    offen: 0,
    in_arbeit: 0,
    fertig: 0,
    abgerechnet: 0,
  };
  for (const row of rows) {
    counts[jobStatusForQuote(row)] += 1;
  }
  return counts;
}

export function nextJobActions(current: JobStatus): JobStatus[] {
  if (current === "offen") return ["in_arbeit"];
  if (current === "in_arbeit") return ["offen", "fertig"];
  if (current === "fertig") return ["in_arbeit"];
  return [];
}

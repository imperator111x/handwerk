export interface AnalysisStats {
  malicious?: number;
  suspicious?: number;
  harmless?: number;
  undetected?: number;
}

export type ScanStatus = "pending" | "clean" | "malicious" | "error";

/** Öffnen ist nur nach einem abgeschlossenen unauffälligen Ergebnis erlaubt. */
export function canOpenScan(status: string): boolean {
  return status === "clean";
}

export function verdictFromStats(stats: AnalysisStats | null | undefined, completed: boolean): ScanStatus {
  if (!stats || !completed) return "pending";
  const malicious = Number(stats.malicious ?? 0);
  const suspicious = Number(stats.suspicious ?? 0);
  if (malicious > 0 || suspicious > 0) return "malicious";
  const looked = malicious + suspicious + Number(stats.harmless ?? 0) + Number(stats.undetected ?? 0);
  return looked > 0 ? "clean" : "pending";
}

export interface ScanOutcome {
  status: ScanStatus;
  malicious: number;
  suspicious: number;
  harmless: number;
  analysisId: string | null;
}

interface VtFileResponse {
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      stats?: AnalysisStats;
      last_analysis_stats?: AnalysisStats;
    };
  };
}

function outcomeFrom(stats: AnalysisStats | undefined, completed: boolean, analysisId: string | null): ScanOutcome {
  return {
    status: verdictFromStats(stats, completed),
    malicious: Number(stats?.malicious ?? 0),
    suspicious: Number(stats?.suspicious ?? 0),
    harmless: Number(stats?.harmless ?? 0),
    analysisId,
  };
}

function pending(analysisId: string | null = null): ScanOutcome {
  return outcomeFrom(undefined, false, analysisId);
}

function failed(): ScanOutcome {
  return { status: "error", malicious: 0, suspicious: 0, harmless: 0, analysisId: null };
}

async function vtFetch(apiKey: string, url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("x-apikey", apiKey);
  return fetch(url, { ...init, headers });
}

/**
 * Prüft die Datei bei VirusTotal. Bekannte Hashes werden nur nachgeschlagen.
 * Neue Dateien werden hochgeladen. Ohne abgeschlossenes Ergebnis bleibt „pending“.
 */
export async function inspectWithVirusTotal(
  apiKey: string,
  bytes: Uint8Array,
  sha256: string,
  filename: string,
  options: { poll?: boolean; analysisId?: string | null } = {},
): Promise<ScanOutcome> {
  if (options.analysisId) {
    const current = await readAnalysis(apiKey, options.analysisId);
    if (current.status !== "pending" || !options.poll) return current;
    return pollAnalysis(apiKey, options.analysisId);
  }

  const known = await readHash(apiKey, sha256);
  if (known !== "missing") return known;

  const uploaded = await uploadFile(apiKey, bytes, filename);
  if (uploaded.status !== "pending" || !uploaded.analysisId || !options.poll) return uploaded;
  return pollAnalysis(apiKey, uploaded.analysisId);
}

async function readHash(apiKey: string, sha256: string): Promise<ScanOutcome | "missing"> {
  const response = await vtFetch(apiKey, `https://www.virustotal.com/api/v3/files/${sha256}`);
  if (response.status === 404) return "missing";
  if (response.status === 401 || response.status === 403) return failed();
  if (!response.ok) return pending();
  const body = (await response.json()) as VtFileResponse;
  return outcomeFrom(body.data?.attributes?.last_analysis_stats, true, null);
}

async function readAnalysis(apiKey: string, analysisId: string): Promise<ScanOutcome> {
  const response = await vtFetch(apiKey, `https://www.virustotal.com/api/v3/analyses/${analysisId}`);
  if (response.status === 401 || response.status === 403) return failed();
  if (!response.ok) return pending(analysisId);
  const body = (await response.json()) as VtFileResponse;
  const completed = body.data?.attributes?.status === "completed";
  return outcomeFrom(body.data?.attributes?.stats, completed, analysisId);
}

async function uploadFile(apiKey: string, bytes: Uint8Array, filename: string): Promise<ScanOutcome> {
  const body = new FormData();
  body.append("file", new Blob([Uint8Array.from(bytes)]), filename || "anhang");
  const response = await vtFetch(apiKey, "https://www.virustotal.com/api/v3/files", { method: "POST", body });
  if (response.status === 401 || response.status === 403) return failed();
  if (!response.ok) return pending();
  const payload = (await response.json()) as VtFileResponse;
  return pending(payload.data?.id ?? null);
}

async function pollAnalysis(apiKey: string, analysisId: string): Promise<ScanOutcome> {
  let latest = pending(analysisId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    latest = await readAnalysis(apiKey, analysisId);
    if (latest.status !== "pending") return latest;
  }
  return latest;
}

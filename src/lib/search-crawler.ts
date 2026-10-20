interface CrawlerRequest {
  headers: { get(name: string): string | null };
  cf?: {
    asOrganization?: string;
    botManagement?: { verifiedBot?: boolean };
  };
}

const SEARCH_AGENT =
  /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|bingbot|DuckDuckBot|Applebot|Slurp/i;

const SEARCH_NETWORKS = ["google", "microsoft", "apple", "duck duck go", "duckduckgo", "yahoo"];

/** Suchmaschinen dürfen die öffentliche Seite lesen. Nachgemachte Namen aus einem fremden Netz nicht. */
export function isSearchCrawler(request: CrawlerRequest): boolean {
  const agent = request.headers.get("user-agent") ?? "";
  if (!SEARCH_AGENT.test(agent)) return false;
  const network = request.cf;
  if (!network) return true;
  if (network.botManagement?.verifiedBot === true) return true;
  const organization = (network.asOrganization ?? "").toLowerCase();
  if (!organization) return true;
  return SEARCH_NETWORKS.some((name) => organization.includes(name));
}

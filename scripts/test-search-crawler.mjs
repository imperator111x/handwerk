import assert from "node:assert/strict";
import { isSearchCrawler } from "../src/lib/search-crawler.ts";

const google = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const visitor = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

function request(userAgent, cf) {
  return { headers: { get: (name) => (name.toLowerCase() === "user-agent" ? userAgent : null) }, cf };
}

assert.equal(isSearchCrawler(request(visitor)), false);
assert.equal(isSearchCrawler(request(google)), true);
assert.equal(isSearchCrawler(request(google, { asOrganization: "Google LLC" })), true);
assert.equal(isSearchCrawler(request(google, { asOrganization: "Hetzner Online GmbH" })), false);
assert.equal(isSearchCrawler(request(google, { asOrganization: "Hetzner Online GmbH", botManagement: { verifiedBot: true } })), true);
assert.equal(isSearchCrawler(request("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", { asOrganization: "Microsoft Corporation" })), true);
assert.equal(isSearchCrawler(request(visitor, { asOrganization: "Google LLC", botManagement: { verifiedBot: true } })), false);

console.log("search crawler checks ok");

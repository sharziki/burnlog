#!/usr/bin/env node
/**
 * Ping IndexNow with every URL in the sitemap.
 *
 * IndexNow is the only "please crawl this now" button that doesn't need a
 * logged-in dashboard: Bing, Yandex, Seznam and Naver share one endpoint, and
 * Bing is what several AI answer engines read. Google ignores it — Google's
 * equivalent is submitting the sitemap in Search Console, once, by hand.
 *
 * Ownership is proved by hosting the key as a text file at the site root, so
 * the key here and the file in public/ must stay the same string.
 *
 *   node scripts/indexnow.mjs [siteUrl]
 */
const KEY = "5168a75675ca21750fa627880b3084fc";
const site = process.argv[2] ?? "https://burnlog.net";
const host = new URL(site).host;

const sitemapUrl = new URL("/sitemap.xml", site).toString();
const xml = await fetch(sitemapUrl).then((r) => {
  if (!r.ok) throw new Error(`${sitemapUrl} returned ${r.status}`);
  return r.text();
});

const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) throw new Error("sitemap contained no <loc> entries");

// The key file has to be reachable, or the whole submission is rejected as
// unverified — and it fails silently, with a 200 on the submission itself.
const keyLocation = new URL(`/${KEY}.txt`, site).toString();
const keyCheck = await fetch(keyLocation);
if (!keyCheck.ok) throw new Error(`key file not reachable at ${keyLocation} (${keyCheck.status})`);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: KEY, keyLocation, urlList }),
});

console.log(`${res.status} ${res.statusText} — submitted ${urlList.length} URLs from ${sitemapUrl}`);
for (const u of urlList) console.log("  " + u);
if (!res.ok) process.exitCode = 1;

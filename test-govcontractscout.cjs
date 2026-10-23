const fs = require("fs");

const line = fs.readFileSync("server/.env", "utf8")
  .split(/\r?\n/)
  .find(x => /^AGGREGATED_PROCUREMENT_API_KEY=/.test(x));

if (!line) throw new Error("API key server/.env mein nahi mili");

const key = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
const headers = { Authorization: `Bearer ${key}` };

(async () => {
  for (const path of ["/usage", "/contracts?per_page=1&page=1"]) {
    const url = `https://scout.govbidportals.com/api/v1${path}`;
    const r = await fetch(url, { headers });
    console.log(path, "HTTP", r.status);
    console.log((await r.text()).slice(0, 200));
  }
})().catch(e => console.error(e.message));

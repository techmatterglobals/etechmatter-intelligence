import { env } from "./src/config/env.ts";
import { politeFetch } from "./src/connectors/http.ts";

async function main() {
  const url =
    "https://scout.govbidportals.com/api/v1/contracts?per_page=20&page=1";

  console.log("API key configured:", Boolean(env.aggregatedProcurement.apiKey));
  console.log("API key length:", env.aggregatedProcurement.apiKey.length);

  const response = await politeFetch(
    url,
    {
      headers: {
        Authorization: `Bearer ${env.aggregatedProcurement.apiKey}`,
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    },
    30000,
  );

  console.log("HTTP status:", response.status);
  console.log("Response:", (await response.text()).slice(0, 400));
}

main().catch((error) => {
  console.error("Diagnostic error:", error.message);
  process.exitCode = 1;
});


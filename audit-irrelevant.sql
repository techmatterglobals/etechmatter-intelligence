SELECT
  "title",
  "requirementSummary",
  "categories",
  "sourceUrl"
FROM public."Opportunity"
WHERE "sourceKey" = 'sam_gov'
  AND "intentLevel" = 'IRRELEVANT'
  AND "isDemo" = false
ORDER BY "publishedAt" DESC NULLS LAST
LIMIT 60;

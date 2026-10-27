SELECT
    title,
    "requirementSummary",
    "hardwareCategory",
    "intentScore",
    "sourceUrl"
FROM public."Opportunity"
WHERE "sourceKey" = 'sam_gov'
  AND "intentLevel" = 'IRRELEVANT'
ORDER BY "discoveredAt" DESC
LIMIT 20;

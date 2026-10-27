SELECT
  "sourceKey",
  "intentLevel",
  COUNT(*) AS total
FROM public."Opportunity"
WHERE "isDemo" = false
GROUP BY "sourceKey", "intentLevel"
ORDER BY "sourceKey", "intentLevel";

SELECT "sourceKey", "intentLevel", "status", "isDemo", COUNT(*) AS total
FROM public."Opportunity"
GROUP BY "sourceKey", "intentLevel", "status", "isDemo"
ORDER BY "sourceKey", "intentLevel", "status";

SELECT "hardwareCategory", "intentLevel", COUNT(*) AS total
FROM public."Opportunity"
WHERE "sourceKey" = 'sam_gov'
GROUP BY "hardwareCategory", "intentLevel"
ORDER BY total DESC;

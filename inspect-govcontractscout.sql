SELECT
    title,
    "requirementSummary",
    "hardwareCategory",
    "intentScore",
    "sourceUrl"
FROM public."Opportunity"
WHERE "sourceKey" = 'govcontractscout'
ORDER BY "intentScore" DESC
LIMIT 20;

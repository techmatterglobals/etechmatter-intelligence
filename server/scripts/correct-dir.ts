import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OPPORTUNITY_ID = 'opp_mv59av6y5ussf2wi';
const EXPECTED_URL =
  'https://dir.texas.gov/it-solutions-and-services/selling-through-dir/schedule-of-solicitation-opportunities';

async function main() {
  const existing = await prisma.opportunity.findUnique({
    where: { id: OPPORTUNITY_ID },
  });

  if (!existing) {
    throw new Error('DIR opportunity not found. No changes made.');
  }

  if (
    existing.sourceType !== 'PUBLIC_WEB' ||
    existing.sourceUrl !== EXPECTED_URL ||
    existing.sourceKey !== 'public_web'
  ) {
    throw new Error('Source verification failed. No changes made.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({
      where: { id: OPPORTUNITY_ID },
      data: {
        documentKind: 'OTHER',
        procurementType: 'UNKNOWN',

        intentLevel: 'IRRELEVANT',
        intentScore: 0,
        urgencyScore: 0,
        urgencyLabel: 'NONE',

        matchLevel: 'NONE',
        matchScore: 0,
        overallOpportunityScore: 0,

        buyerName: null,
        buyerTitle: null,
        buyerEmail: null,
        buyerPhone: null,
        buyerLinkedin: null,

        requirementSummary:
          'General Texas DIR procurement schedule. Not an individual solicitation.',
        hardwareCategory: null,
        categories: [],
        items: [],
        productsRequested: [],
        brandsRequested: [],
        modelsRequested: [],
        partNumbers: [],
        quantity: null,
        budget: null,
        deadline: null,

        contactsJson: [],
        productMatchesJson: [],
        scoreReasonsJson: [],
        whyItMatters: [
          'General procurement listing, not an individual solicitation.',
          'Individual notices require separate verification.',
        ],
        nextAction:
          'Review the Texas DIR schedule and open a specific solicitation notice before qualifying a lead.',
        aiSummary:
          'Texas DIR publishes a general schedule of solicitation opportunities. This page does not establish a single actionable hardware procurement.',
        aiReasoning: [
          'Corrected classification: general procurement listing.',
          'Source page must not be treated as an individual solicitation.',
        ],
        estimatedOpportunityValue: null,
        estimatedValueBasis: null,
        requirementDetails: {},
        fieldProvenance: {},
      },
    });

    const products = await tx.opportunityProduct.deleteMany({
      where: { opportunityId: OPPORTUNITY_ID },
    });

    const contacts = await tx.opportunityContact.deleteMany({
      where: { opportunityId: OPPORTUNITY_ID },
    });

    const scores = await tx.opportunityScore.deleteMany({
      where: { opportunityId: OPPORTUNITY_ID },
    });

    return {
      id: updated.id,
      documentKind: updated.documentKind,
      intentLevel: updated.intentLevel,
      matchLevel: updated.matchLevel,
      removedRelationships: {
        products: products.count,
        contacts: contacts.count,
        scores: scores.count,
      },
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
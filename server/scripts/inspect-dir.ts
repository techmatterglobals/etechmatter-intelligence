import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.opportunity.findMany({
    where: {
      sourceType: 'PUBLIC_WEB',
      sourceUrl: {
        contains: 'schedule-of-solicitation-opportunities',
      },
    },
    select: {
      id: true,
      title: true,
      sourceKey: true,
      sourceId: true,
      sourceUrl: true,
      documentKind: true,
      procurementType: true,
      intentLevel: true,
      intentScore: true,
      matchLevel: true,
      matchScore: true,
      overallOpportunityScore: true,
      buyerName: true,
      nextAction: true,
    },
  });

  for (const row of rows) {
    const [products, contacts, scores] = await Promise.all([
      prisma.opportunityProduct.count({
        where: { opportunityId: row.id },
      }),
      prisma.opportunityContact.count({
        where: { opportunityId: row.id },
      }),
      prisma.opportunityScore.count({
        where: { opportunityId: row.id },
      }),
    ]);

    console.log(
      JSON.stringify(
        {
          ...row,
          relatedRecords: {
            products,
            contacts,
            scores,
          },
        },
        null,
        2,
      ),
    );
  }

  console.log(`Found ${rows.length} matching DIR record(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
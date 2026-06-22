import { PrismaClient, EvalBucket } from "@prisma/client";

const prisma = new PrismaClient();

async function seedHandoffs() {
  console.log("Seeding handoff items...");

  const handoffs: Array<{
    learnerRequest: string;
    modelAnswer: string;
    confidenceScore: number;
    reviewerReasoning: string;
    gapBucket: EvalBucket;
    status: "pending" | "approved" | "corrected";
    correctedAnswer?: string;
    verificationStatus?: "single_annotator";
    reviewedAt?: Date;
  }> = [
    {
      learnerRequest:
        "What is the Igala word for 'electricity'? Is it a borrowed word?",
      modelAnswer:
        "The Igala word for electricity is 'ina mọtọ' which literally translates to 'fire of the machine'. It is a compound word rather than a direct borrowing from English.",
      confidenceScore: 0.25,
      reviewerReasoning:
        "Very low confidence. The model appears to be guessing at compound word formation. Igala vocabulary for modern technology concepts needs expert verification.",
      gapBucket: "lexicon_disambig",
      status: "pending",
    },
    {
      learnerRequest:
        "Can you translate 'The community gathered to celebrate the harvest' into Igala?",
      modelAnswer:
        "In Igala: 'Ọmọ ilẹ̀ jọ lọ́wọ́ ọjọ́ ikórè'. This translates roughly to 'The people of the land gathered on the day of harvest'.",
      confidenceScore: 0.45,
      reviewerReasoning:
        "Moderate-low confidence. The sentence structure seems plausible but specific vocabulary choices for 'community' and 'celebrate' in Igala need verification. The model may be drawing from related Yoruba patterns.",
      gapBucket: "authenticity",
      status: "pending",
    },
    {
      learnerRequest:
        "What are the different dialects of Igala and how do they differ?",
      modelAnswer:
        "Igala has several regional varieties across Kogi State. Differences include vowel quality, vocabulary, and intonation. There is no single official standard, and community variants are all valid.",
      confidenceScore: 0.58,
      reviewerReasoning:
        "Moderate confidence. The dialect categories are broadly correct but the specific linguistic differences need expert review for accuracy and completeness.",
      gapBucket: "dialectal_fidelity",
      status: "pending",
    },
    {
      learnerRequest: "How do I express gratitude formally in Igala?",
      modelAnswer:
        "To express gratitude formally in Igala, you would say 'Ọ̀ṣẹ̀' (oh-sheh) for a simple thank you, or 'Ọ̀ṣẹ̀ galẹ' for a more emphatic expression. In formal contexts, you might add 'ẹ̀gbẹ̀nyà' to show deeper appreciation.",
      confidenceScore: 0.68,
      reviewerReasoning:
        "Moderate confidence. Basic gratitude expression seems reasonable but the formal/emphatic variants need verification from native speakers.",
      gapBucket: "lexicon_disambig",
      status: "approved",
      reviewedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      learnerRequest:
        "What is the cultural significance of kola nuts in Igala ceremonies?",
      modelAnswer:
        "Kola nuts (oji) are shared during important Igala ceremonies such as naming ceremonies and the welcoming of guests. They symbolize hospitality, blessing, and communal bonds.",
      confidenceScore: 0.35,
      reviewerReasoning:
        "Low confidence. The general role of kola nuts is plausible, but the specific Igala cultural protocols and taboos around their use need expert verification.",
      gapBucket: "cultural_values",
      status: "corrected",
      correctedAnswer:
        "Kola nuts (oji) are central to Igala hospitality and ritual. They are presented to guests and elders, broken and shared to seal agreements, and offered during naming ceremonies and prayers. The manner of presentation and who breaks the kola follows strict seniority protocols.",
      verificationStatus: "single_annotator",
      reviewedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
  ];

  for (const handoff of handoffs) {
    await prisma.handoffItem.create({
      data: handoff,
    });
  }

  console.log(`Seeded ${handoffs.length} handoff items.`);
}

seedHandoffs()
  .catch((e) => {
    console.error("Error seeding handoffs:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

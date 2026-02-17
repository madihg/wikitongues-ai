import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedHandoffs() {
  console.log("Seeding handoff items...");

  const handoffs = [
    {
      learnerRequest:
        "How do I say 'I miss you' in Lebanese Arabic? Is there a difference between saying it to a friend vs. a romantic partner?",
      modelAnswer:
        "In Lebanese Arabic, you can say 'إشتقتلك' (ishtaqtelak) for male or 'إشتقتلِك' (ishtaqtelik) for female. This is commonly used for both friends and romantic partners. The tone and context typically convey the intended meaning rather than the words themselves.",
      confidenceScore: 0.32,
      reviewerReasoning:
        "Low confidence due to nuanced social context around expressing longing in Lebanese culture. The model may be oversimplifying the distinction between platonic and romantic expressions.",
      gapCategory: "missing_cultural_context" as const,
      status: "pending" as const,
    },
    {
      learnerRequest:
        "What is the Igala word for 'electricity'? Is it a borrowed word?",
      modelAnswer:
        "The Igala word for electricity is 'ina mọtọ' which literally translates to 'fire of the machine'. It is a compound word rather than a direct borrowing from English.",
      confidenceScore: 0.25,
      reviewerReasoning:
        "Very low confidence. The model appears to be guessing at compound word formation. Igala vocabulary for modern technology concepts needs expert verification.",
      gapCategory: "missing_vocabulary" as const,
      status: "pending" as const,
    },
    {
      learnerRequest:
        "Can you translate 'The community gathered to celebrate the harvest' into Igala?",
      modelAnswer:
        "In Igala: 'Ọmọ ilẹ̀ jọ lọ́wọ́ ọjọ́ ikórè'. This translates roughly to 'The people of the land gathered on the day of harvest'.",
      confidenceScore: 0.45,
      reviewerReasoning:
        "Moderate-low confidence. The sentence structure seems plausible but specific vocabulary choices for 'community' and 'celebrate' in Igala need verification. The model may be drawing from related Yoruba patterns.",
      gapCategory: "missing_translation_pair" as const,
      status: "pending" as const,
    },
    {
      learnerRequest:
        "What are the different dialects of Lebanese Arabic and how do they differ?",
      modelAnswer:
        "Lebanese Arabic has several regional dialects including Beiruti (the prestige urban dialect), Mount Lebanon (Druze and Maronite variations), Northern (Tripoli/Akkar), Southern (Sidon/Tyre), and Bekaa Valley. Key differences include vowel shifts, vocabulary, and intonation patterns. For example, Beiruti dialect tends to soften certain consonants compared to Northern Lebanese.",
      confidenceScore: 0.58,
      reviewerReasoning:
        "Moderate confidence. The dialect categories are broadly correct but the specific linguistic differences need expert review for accuracy and completeness.",
      gapCategory: "missing_dialect_knowledge" as const,
      status: "pending" as const,
    },
    {
      learnerRequest: "How do I express gratitude formally in Igala?",
      modelAnswer:
        "To express gratitude formally in Igala, you would say 'Ọ̀ṣẹ̀' (oh-sheh) for a simple thank you, or 'Ọ̀ṣẹ̀ galẹ' for a more emphatic expression. In formal contexts, you might add 'ẹ̀gbẹ̀nyà' to show deeper appreciation.",
      confidenceScore: 0.68,
      reviewerReasoning:
        "Moderate confidence. Basic gratitude expression seems reasonable but the formal/emphatic variants need verification from native speakers.",
      gapCategory: "missing_vocabulary" as const,
      status: "approved" as const,
      reviewedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      learnerRequest: "ما هو الفرق بين 'كيفك' و'شلونك' في اللهجة اللبنانية؟",
      modelAnswer:
        "في اللهجة اللبنانية، 'كيفك' (kifak) هي الطريقة الأكثر شيوعاً للسؤال عن الحال. أما 'شلونك' (shlonak) فهي أكثر استخداماً في اللهجات العراقية والخليجية. في لبنان، قد يُستخدم 'شلونك' أحياناً ولكن 'كيفك' هي السائدة.",
      confidenceScore: 0.35,
      reviewerReasoning:
        "Low confidence. The model correctly identifies that kifak is the Lebanese norm, but the claim about shlonak usage in Lebanon needs verification. The answer is in Arabic which is appropriate for the Arabic-language query.",
      gapCategory: "missing_dialect_knowledge" as const,
      status: "corrected" as const,
      correctedAnswer:
        "في اللهجة اللبنانية، 'كيفك' (kifak للذكر / kifik للأنثى) هي الطريقة الأساسية والأكثر شيوعاً للسؤال عن الحال. 'شلونك' (shlonak) ليست مستخدمة في اللهجة اللبنانية وهي خاصة باللهجات العراقية والخليجية. اللبنانيون لا يستخدمون 'شلونك' في حديثهم اليومي.",
      verificationStatus: "single_annotator" as const,
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

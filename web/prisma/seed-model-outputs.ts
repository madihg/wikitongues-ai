import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Realistic fake outputs per model for different prompt types
const igalaOutputs: Record<string, Record<string, string>> = {
  claude: {
    real_world_use:
      "Ene o! Ọma mi, ata wa kọjú àṣà ìbílẹ̀ Ígálà. The Igala people have a rich tradition of storytelling, often gathering in the evening around a fire. Elders share tales of Attah Igala, the paramount ruler, and the history of the kingdom. A common greeting is 'Ene o' (Hello), and the response is 'Ene, oyọ' (Hello, welcome). Family is central — 'ata' means father, 'ene' means mother, and 'ọma' means child.",
    words_concepts:
      "The Igala word 'gharaam' does not have a direct equivalent, as this is an Arabic loanword. However, the Igala concept of deep affection is expressed through 'ifẹ̀' which carries connotations of both romantic love and deep familial bonds. In Igala culture, expressions of love are often indirect, communicated through actions like sharing kola nuts (ọjị) at ceremonies rather than verbal declarations.",
    frontier_aspirations:
      "The Igala masquerade tradition (egwu) is deeply connected to ancestral worship and community governance. The Eku Kola masquerade appears during important festivals and represents the spirit world's connection to the living. I should note that some aspects of masquerade practices are sacred and not typically discussed with outsiders. The cultural significance goes beyond entertainment — masquerades serve as vehicles for social commentary, dispute resolution, and moral instruction.",
    abstract_vs_everyday:
      "In Igala, abstract concepts like 'justice' (ẹtọ́) are often expressed through proverbs and metaphors rather than single words. The proverb 'Ọgba ku nẹ ọchẹ alo' (The elder who dies leaving no story is truly dead) illustrates how abstract ideas of legacy and meaning are grounded in oral tradition. Everyday terms are more concrete: 'omi' (water), 'ijẹ' (food), 'ule' (house).",
  },
  chatgpt: {
    real_world_use:
      "The Igala people are an ethnic group in Nigeria, primarily found in Kogi State. Their culture is rich with traditions including naming ceremonies and masquerade festivals. Common greetings include 'Hello' which in Igala is said as a friendly welcoming phrase. The Igala Kingdom has a long history, with the Attah of Igala being the traditional ruler. Family structures are patrilineal, and community gatherings are an important part of social life.",
    words_concepts:
      "In Igala language, the concept of love is expressed through various terms. The word for affection encompasses both romantic and platonic meanings. Igala, like many African languages, has a tonal system where the same word can have different meanings depending on the tone used. The language belongs to the Yoruboid branch of the Niger-Congo language family and shares some features with Yoruba.",
    frontier_aspirations:
      "Igala masquerade traditions are an important cultural practice in Kogi State, Nigeria. These masquerades appear during festivals and celebrations, representing spirits and ancestors. The practice involves elaborate costumes and performances. While I can share general information, I should note that my knowledge of specific Igala masquerade practices may be limited, as this is an area where specialized cultural knowledge would be valuable.",
    abstract_vs_everyday:
      "In Igala language, like many Niger-Congo languages, abstract concepts are often conveyed through proverbs and idiomatic expressions rather than direct single-word translations. Everyday vocabulary tends to be more straightforward. The language uses tonal distinctions that can change the meaning of words. For example, common everyday terms for basic items exist, while more complex philosophical concepts require longer explanations.",
  },
  gemini: {
    real_world_use:
      "The Igala are a fascinating people! Their culture revolves around the Attah of Igala, the traditional paramount ruler. Let me share some greetings: 'Ene o' is a common hello. The Igala people celebrate several festivals, with the Egwu festival being particularly significant. Family life is very important, with extended family networks providing social support. The Igala language is tonal, meaning the pitch of your voice changes the meaning of words.",
    words_concepts:
      "The concept you're asking about relates to deep emotional attachment in Igala culture. While I don't have the specific Igala word at hand, I can tell you that expressions of emotion in Igala culture are often communicated through ceremonial practices — such as the sharing of kola nuts and palm wine during important gatherings. The language itself is quite expressive, with tonal variations adding layers of meaning.",
    frontier_aspirations:
      "I'm not entirely certain about the specific details of this Igala cultural practice. What I can share is that masquerade traditions across West Africa generally serve important spiritual and social functions. In the Igala context, these practices would be connected to their ancestral beliefs and the authority of the Attah. I'd recommend consulting with Igala cultural experts for more precise information.",
    abstract_vs_everyday:
      "Igala language handles abstract vs. everyday concepts differently. Everyday words tend to be shorter and more universally understood across Igala-speaking communities, while abstract concepts often require proverbs or longer expressions. This is a common pattern in many West African languages where oral tradition plays a central role in transmitting complex ideas.",
  },
  gemma: {
    real_world_use:
      "I have limited knowledge about the Igala language and culture. The Igala are a Nigerian ethnic group based in Kogi State. They have traditions and cultural practices, but I'm not confident in providing specific details about greetings or customs. I'd recommend consulting resources from Igala cultural organizations for accurate information.",
    words_concepts:
      "I'm not sure about the specific translation for this concept in Igala. The Igala language is classified as part of the Yoruboid branch of Niger-Congo languages. It's a tonal language spoken primarily in Kogi State, Nigeria. For accurate translations and cultural context, consulting with native Igala speakers would be most reliable.",
    frontier_aspirations:
      "I don't have extensive knowledge about specific Igala cultural practices like masquerades. What I can say is that masquerade traditions are common across West African cultures and typically involve elaborate costumes and performances. For specific Igala practices, I would recommend consulting cultural experts.",
    abstract_vs_everyday:
      "I have limited data on how the Igala language specifically handles abstract versus everyday concepts. Generally, many African languages express abstract ideas through proverbs and metaphorical expressions. The Igala language is tonal, which adds complexity. I'm not confident enough to provide specific examples.",
  },
};

const lebaneseOutputs: Record<string, Record<string, string>> = {
  claude: {
    real_world_use:
      "أهلا وسهلا! 🇱🇧 بلبنان، لما حدا بيجي عندك عالبيت، أول شي بتقلّو 'تفضّل' وبتقدّملو قهوة عربية أو شاي. الضيافة كتير مهمة بالثقافة اللبنانية. 'كيفك؟' هي أكتر تحية منستعملها، والجواب عادة 'الحمدلله، منيح'. بلبنان منحكي بالعامية اللبنانية يلي هي مختلفة عن العربي الفصحى — مثلاً منقول 'شو' بدل 'ماذا' و 'هلق' بدل 'الآن'.",
    words_concepts:
      "كلمة 'غرام' بالعامية اللبنانية بتحمل معنى الحب العميق والشغف. هي من أصل عربي فصيح بس استعمالها بالعامية اللبنانية بياخد طابع خاص — بتسمعها كتير بالأغاني اللبنانية متل أغاني فيروز. في فرق بين 'حب' (حب عام) و 'غرام' (حب عميق وشغوف) و 'عشق' (حب شديد). بالثقافة اللبنانية، التعبير عن المشاعر بالشعر والموسيقى كتير مهم.",
    frontier_aspirations:
      "بالثقافة اللبنانية، مفهوم 'العيب' (ayb) هو من أهم المفاهيم الاجتماعية. ما فيك تترجمو ببساطة لأنو بيشمل الشرف، السمعة، والمعايير الاجتماعية مع بعض. لما حدا بيقول 'هيدا عيب' معناتا إنو هالتصرف ما بيليق اجتماعياً. المفهوم بيختلف بين الأجيال — الشباب اللبناني هلق عندن نظرة مختلفة عن جيل أهلن.",
    abstract_vs_everyday:
      "بالعامية اللبنانية، في فرق واضح بين المفاهيم المجردة واليومية. الكلمات اليومية متل 'ميّ' (ماء)، 'خبز'، 'بيت' هنّي نفسن بكل المناطق اللبنانية. بس المفاهيم المجردة متل 'عدالة' أو 'حرية' عادةً بنستعمل الكلمة الفصحى أو بنعبّر عنها بأمثال شعبية. مثلاً: 'اللي ما عندو قديم ما عندو جديد' — يعني يلي ما بيقدّر الماضي ما رح يفهم المستقبل.",
  },
  chatgpt: {
    real_world_use:
      "مرحبا! في لبنان، الضيافة هي جزء أساسي من الثقافة. عندما يزورك شخص ما، من المعتاد أن تقدم له القهوة أو الشاي. التحية الأكثر شيوعاً هي 'كيف حالك' والإجابة عادة 'الحمد لله بخير'. اللبنانيون معروفون بكرمهم وحبهم للطعام والموسيقى والاحتفالات.",
    words_concepts:
      "كلمة 'غرام' في اللغة العربية تعني الحب العميق والشغف. وهي تختلف عن كلمة 'حب' العامة. في الثقافة العربية واللبنانية، يعبر الشعر والأدب كثيراً عن مفهوم الغرام. من أشهر من تغنى بالغرام في الأدب العربي هم شعراء العصر العباسي.",
    frontier_aspirations:
      "مفهوم 'العيب' هو مفهوم اجتماعي مهم في الثقافة العربية عموماً. يشير إلى السلوكيات التي تعتبر غير مقبولة اجتماعياً. هذا المفهوم يرتبط بالشرف والسمعة العائلية. في المجتمعات العربية التقليدية، العيب يلعب دوراً كبيراً في تنظيم السلوك الاجتماعي.",
    abstract_vs_everyday:
      "في اللغة العربية، هناك فرق بين اللهجة العامية واللغة الفصحى. المفاهيم اليومية عادة تستخدم كلمات من اللهجة المحلية، بينما المفاهيم المجردة قد تستخدم كلمات من الفصحى. هذه الظاهرة تعرف بالازدواجية اللغوية وهي شائعة في جميع البلدان العربية.",
  },
  gemini: {
    real_world_use:
      "يا هلا! 🇱🇧 الضيافة اللبنانية مشهورة عالمياً. لما بتروح عند حدا، أكيد رح يقدملك أكل وشرب — 'تفضل' هي الكلمة يلي رح تسمعها أكتر شي. القهوة العربية أو قهوة تركية مع حبة هيل بتكون أول شي. كيفك هي التحية الأساسية، والناس عادةً بتجاوب بتفصيل عن حالتن!",
    words_concepts:
      "غرام! كلمة حلوة كتير 😊 بالعامية اللبنانية، الغرام هو أعمق من الحب العادي. بتسمعها كتير بأغاني فيروز وأم كلثوم. في تدرج بالعربي: حب، غرام، عشق، هيام — كل وحدة أقوى من يلي قبلها. بالثقافة اللبنانية، الغرام بيتعبر عنو كتير بالشعر والموسيقى.",
    frontier_aspirations:
      "موضوع 'العيب' بالثقافة اللبنانية موضوع معقد ومثير. هو مفهوم بيحكم كتير من التصرفات الاجتماعية. بس لازم نفرق بين لبنان المدينة ولبنان الريف — بيروت مثلاً عندها نظرة مختلفة عن القرى. وكمان في فرق بين الأجيال. المفهوم عم يتطور مع الوقت.",
    abstract_vs_everyday:
      "سؤال ممتاز! بالعامية اللبنانية، الكلمات اليومية كتير مختلفة عن الفصحى: 'شو' بدل 'ماذا'، 'هلق' بدل 'الآن'، 'كتير' بدل 'كثيراً'. بس لما منحكي عن مفاهيم مجردة متل الفلسفة أو السياسة، منرجع للفصحى أكتر. هيدا يلي بيسموه ازدواجية لغوية.",
  },
  gemma: {
    real_world_use:
      "In Lebanon, hospitality is very important. When someone visits, they are offered coffee or tea. Common greetings include 'Kifak' (How are you?). I should note that my knowledge of specific Lebanese Arabic dialect features may be limited compared to a native speaker.",
    words_concepts:
      "The Arabic word 'gharam' (غرام) means deep love or passion. It's used in both formal Arabic and Lebanese dialect. In Lebanese culture, expressions of love are common in poetry and music. I'm not entirely confident about the specific dialectal nuances of this word in Lebanese Arabic versus Modern Standard Arabic.",
    frontier_aspirations:
      "The concept of 'ayb' (shame/taboo) exists in Lebanese and broader Arab culture. It relates to social norms and acceptable behavior. I have limited knowledge about how this concept specifically manifests in modern Lebanese society versus other Arab cultures.",
    abstract_vs_everyday:
      "Arabic has diglossia — a situation where two varieties of the language coexist. Modern Standard Arabic is used for formal contexts while dialects like Lebanese Arabic are used daily. Everyday words often differ between MSA and dialect. I'm not confident about providing specific Lebanese dialect examples.",
  },
};

function getOutput(language: string, category: string, model: string): string {
  const outputs = language === "igala" ? igalaOutputs : lebaneseOutputs;
  return (
    outputs[model]?.[category] ??
    `Sample ${model} output for ${language} ${category} prompt.`
  );
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const modelConfigs = [
  { alias: "claude", modelId: "claude-sonnet-4-5-20250929" },
  { alias: "chatgpt", modelId: "gpt-4o" },
  { alias: "gemini", modelId: "gemini-2.0-flash" },
  { alias: "gemma", modelId: "gemma-2-9b-it" },
];

async function main() {
  console.log("Seeding model outputs...");

  const prompts = await prisma.prompt.findMany({
    orderBy: { promptId: "asc" },
  });

  if (prompts.length === 0) {
    console.log("No prompts found. Run the main seed first.");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const prompt of prompts) {
    for (const model of modelConfigs) {
      // Check if already exists
      const existing = await prisma.modelOutput.findFirst({
        where: {
          promptId: prompt.id,
          model: model.alias,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const outputText = getOutput(
        prompt.language,
        prompt.category,
        model.alias,
      );

      await prisma.modelOutput.create({
        data: {
          promptId: prompt.id,
          model: model.alias,
          modelId: model.modelId,
          outputText,
          tokenCountIn: randomInt(50, 200),
          tokenCountOut: randomInt(100, 500),
          latencyMs: randomInt(500, 5000),
        },
      });

      created++;
    }
  }

  console.log(
    `Done! Created ${created} model outputs, skipped ${skipped} existing.`,
  );
  console.log(
    `Total prompts: ${prompts.length}, models: ${modelConfigs.length}`,
  );
  console.log(`Expected: ${prompts.length * modelConfigs.length} outputs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

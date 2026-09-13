# Fast Forward 2027 Accelerator - draft answers (2026-09-04)
Form: https://apply.ffwd.org/2027-accelerator (deadline Sep 7, 11:59pm PT). Limits are characters.

## one_liner [183/200]

Wikitongues helps communities keep their languages alive. Our AI program builds an honest public benchmark and speaker-taught models for the languages AI ignores, starting with Igala.

## problem [447/500]

Frontier AI fails most of the world's languages. For Igala, a tonal language with about two million speakers in Nigeria, ChatGPT and Gemini answer in broken text, borrow words from Yoruba, and drop the tone marks that carry meaning. In our first live test, Igala speakers judged 99% of model answers inadequate. Nobody measures this failure per language, so nobody fixes it. Speakers get tools that erase their language while claiming to speak it.

## solution [472/500]

We built an exam and a workshop in one. Igala speakers answer a prompt first, then compare model answers, correct them, and say why. Every correction becomes verified data. On top sits a retrieval layer: a curated dictionary, speaker-verified sentence pairs, and grammar rules deduced from them, fed to the model before it answers. In blind judgment, speakers preferred our system over bare Gemini 54 to 14. Every number is public, including the ones that went against us.

## better [479/500]

The alternatives are bare frontier models, which fail Igala, and academic benchmarks that score with a string-match metric. We stress-tested that metric and found it rewards dropping tone marks: a control that deletes accents outscored our best system. So we rank by blind speaker judgment first and publish the metric only as a check. Our loop is also the data. Every correction feeds the next version, with consent tracked per answer, separately for benchmark and training use.

## stage_more [443/500]

Beta. The platform has been live since June 2026 with Igala annotators recruited by our community lead through the Igala Wikimedians. So far: over 900 speaker-authored answers with consent, a 25-prompt benchmark scored by two or more speakers each, four generations of our retrieval system, and a public page that shows every result and every correction. Public launch of the benchmark at the Wikimedia conference in Ghana, early October 2026.

## users [493/500]

Two users. First, speakers of languages AI ignores, starting with Igala's two million speakers in Kogi State. We reach them through Wikimedia language communities: our Igala lead runs the Igala Wikimedians, and the Ghana Wikimedia conference is our launch stage. Second, the labs that build the models, reached through a public per-language leaderboard and through advisors at Google Research and NYU who review our method. Each new language starts with one community lead and five annotators.

## sustainability [425/500]

[DRAFT, Daniel to verify] Wikitongues is a nonprofit funded by grants and individual donors since 2014. For the AI program we see three paths: foundation and Wikimedia-adjacent grants for each new language community; licensing consented, speaker-verified datasets and benchmarks to labs that need them, with revenue shared with the communities; and paid evaluation services for companies shipping products in these languages.

## ai_elab [257/300]

We run frontier models (Gemini, Claude) through a retrieval layer of speaker-verified Igala data and deduced grammar rules, then rank them by blind speaker judgment. Corrections feed the next version. Next: fine-tuning open models on consented speaker data.

## milestone [418/500]

Launch the public Igala benchmark at the Wikimedia conference in Ghana in October 2026: the first per-language scorecard that holds every major model to the judgment of the speakers themselves, with at least 25 blind-scored prompts and every annotator's verdict published. From there, Igala speakers get a model that a community of their own has checked, and the labs get a number they cannot game by dropping accents.

## cofounder_story [417/500]

[VERIFY start date] Halim joined Wikitongues in spring 2026 to lead its AI program, working with co-founder and executive director Daniel Bögre Udell. Daniel brought a decade of language documentation and the communities; Halim brought the engineering and evaluation method. Within weeks the team had a live platform, and the Igala pilot started with Agnes's annotators in July 2026 with linguist Lydia Wiernik designing the scoring rubric.

## why_team [431/500]

Wikitongues has spent a decade documenting languages with the people who speak them, so we start with trust that labs cannot buy. Agnes Abah, our Igala lead, runs the Igala Wikimedians and hand-picks the annotators. Lydia Wiernik, our linguist, wrote the nine-axis rubric speakers score with. Halim Madi built the platform and the retrieval system and published every failure. Advisors at Google Research and NYU review the method.

## leadership [471/600]

Halim Madi - AI Lead - builds the platform, the retrieval system and the benchmark, and runs the evaluation. Daniel Bögre Udell - Co-founder and Executive Director - leads Wikitongues, funding and community partnerships. Lydia Wiernik - Archival Manager, Wikitongues; linguistics lead for the AI program - designed the scoring rubric and leads data permissions. Agnes Abah - Igala Community Lead - recruits and trains the speaker annotators through the Igala Wikimedians.

## risk [786/1000]

In August our system scored 102 on our own exam, above the human ceiling. We could have shipped that number. Instead we audited the exam. The scoring metric rewarded dropping tone marks: a control that simply deletes accents from a bare model outscored our best system, 112 to 103. The exam was measuring spelling habits, not Igala. We rebuilt the score like-for-like against speaker answers, published the correction on our public page, and re-ranked everything by blind speaker judgment first. That judgment held. Speakers preferred our system 54 to 14, with every annotator agreeing. The outcome is a slower headline and a benchmark that labs cannot game by stripping accents. It cost us a week and a good story. It bought us a number we can defend to a linguist, a funder, or a lab.

## excites [456/500]

[DRAFT] Impact measurement first. We learned this summer how easy it is to publish a wrong number, and we want to measure this work the way funders and labs will judge it. Fundraising strategy second: $25k funds the annotator hours for a second language community, and we need to make that repeatable. And the cohort. Founders who have taken a nonprofit tech product from a pilot to something the field takes seriously are the people we want to learn from.

## anything_else [146/none]

Every result, method, prompt and correction is public at https://wikitongues-ai-site.vercel.app/how-it-works/, written for a non-technical reader.

## section_2_facts (verified from public registry / press, 2026-09-04)

- Organization name: Wikitongues
- Website: https://wikitongues.org
- Legal status: US 501(c)(3). GuideStar lists EIN 47-1463955 (https://www.guidestar.org/profile/47-1463955). Halim/Daniel to confirm before entry.
- Year created: 2014 (founders Daniel Bögre Udell, Frederico Andrade, Lindie Botes)
- Headquartered: New York, NY (confirm Brooklyn vs Manhattan address)
- Impact: worldwide; AI program pilot in Kogi State, Nigeria (Igala)
- Focus areas (my pick, max 5): Arts & Culture, Digital Inclusion, Education, Human Rights
- Funding raised 2025 / 2026 + top three funders each year: UNKNOWN, Daniel to supply
- Product stage: Beta
- Tech types: AI, ML, Open Data, Open Source, Web App
- Support priorities (my pick): Impact measurement, Fundraising strategy, Partnership strategy, Go-to-market strategy

## section_4_facts (Halim to supply)

- Full-time staff count: UNKNOWN
- Co-founders: Yes (org level). Founder names: Daniel Bögre Udell, Frederico Andrade, Lindie Botes. LinkedIn URLs: Daniel https://www.linkedin.com/in/bogreudell/ ; others UNKNOWN
- Lived experience with the problem: Halim's call (likely No for Halim; Agnes yes but she is not a founder)
- Tech talent category: Halim's call (full-time vs part-time technical lead)
- Video (3 min max, MUST include product demo, else not considered): Halim + Daniel to record

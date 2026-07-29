# Meetings and live-data insights (Wikitongues Igala)

Compiled 2026-07-31 from Granola transcripts, email threads, and production data analysis.

## Feb 13, 2026 - Halim x Andrew Smart working lunch (the origin conversation)

Longest 1:1 on record (~85K chars). Live side-by-side ChatGPT vs Gemini tests on Lebanese dialect. Key moments:

- Multi-turn language switching broke context: "multi turn conversations are fucked when it comes to other languages... it's not carrying over the context."
- The seed question of the interstice paper, in Andy's words: "does a model carry culture in language A into its language B repository... is it even in its neurons... if not, can we force them?"
- "What fragments of these languages are in the train data, nobody knows."
- Abstract-vs-concrete hypothesis: universal concepts (love) survive translation; everyday words (mug, t-shirt) diverge by community. Brain-imaging analogy floated as measurable in models.
- Nigerian English study cited: model output "felt like it was mocking" - over-indexed stereotyped register; "it's not as much about the correct tone as when you get it wrong that matters."
- Commitments: "that alone is a paper... a conference paper right there"; "we unlocked together that we need to set a benchmark"; loop in Igala speakers "from the get go, 100%"; Andy's internal reality-checks (language not P0, budget lands Mar/Apr, prior Gemini-unflattering studies killed internally).
- Andy's terminology: "empathy engine," "self-learning cultural identifier agent," per-token "confidence score" as its own research contribution, "operation sequences" (benchmark -> teacher prompts -> baseline -> RLHF/DPO epochs). Tools referenced: Surge AI "Hemingway Bench," Google-internal "Amplify" (community-sourced adversarial prompts).

## Jun 1, 2026 - Google Research x Wikitongues group call (floating motifs crystallize)

- Andy introduces floating motifs: "this idea of floating motifs where you take this idiomatic phrase that's very well understood in the culture, but the models just interpret it literally... the motif is removed from its context, and then it's just floating."
- "There's evidence that the models think in English regardless of the language they're speaking" (Andy, no citation given on call - the citation is Wendler et al. ACL 2024).
- Norwegian anti-fascist poem "du ma ikke sove": "the models just go like, oh, this is something Norwegian parents say to their children... it doesn't understand the significance of the phrase."
- Emily Black's three research questions: (1) cross-language floating-motif benchmark; (2) does community-written vs translated Igala training data improve motif handling; (3) transfer - does Igala-motif competence improve Norwegian motifs?
- Erin van Liemt: measure "degrees of separation" between an idiom's literal words and its concept as difficulty metric; Starbucks/South Korea real-world floating-motif backlash case.
- Emily: semantic idiosyncrasy / goodness-of-exemplar; Boroditsky linguistic relativity (cardinal-direction languages, Mandarin vertical time) as possible evals; "no idea how Igala handles these things."
- Lydia: 4-axis eval + prosody; record multiple Igala speakers for phonetic analysis.
- Jul 1 follow-up email from Andy to the whole group: Berezkin's World Mythology and Folklore motif database (ruthenia.ru/folklore/berezkin) as the motif source, incl. Africa.

## Jul 15, 2026 - Agnes + Lydia call (the data-quality pivot)

- Agnes hit the repeated-prompt bug live; asked "In English or Igala?" at the explanation box; was asked to rewrite an answer she had already written (the redundancy); confused by her lead-only Prompts tab.
- Wrong-language failure documented live: "the listing, it's entering, like, Yoruba and Igbo."
- Lydia's two-box design (Igala answer + English meaning) agreed; Lydia QA pass promised; hours resolved as "start with 105, recalibrate on real pace" with Daniel building a compensation mechanism if more is needed.
- October Wikimedia Ghana live demo established as the hard deadline.

## Live-data findings (as of late July 2026)

- ~420+ real pairwise judgments from 5 native annotators; ~99% both-inadequate at confidence 4: frontier models fail Igala essentially always. Only 4 decided winners (9 rubric axis rows) - the rubric fires rarely by design (it scores winners).
- 483+ cold-authored gold answers covering 108+ prompts; the SFT target's lower bound reached in under two weeks.
- Free calibration finding: near-perfect LEXICAL agreement across annotators (odudu unanimous for "morning"; "Ọma lẹ a jẹ ñwu" four ways) but DIVERGENT orthographic conventions (Ọdudu / Òdúdú / ódùdù; spacing and elision vary). Week-1 calibration should target spelling conventions, not vocabulary. Charity provides dialect variants (General vs Ibaji) and tone contours unprompted.
- Confidence was habit-pinned at 4 (anti-anchoring nudge shipped). "Wrong output" copy-paste explanations dominated early data (required-explanation + example shipped). Annotators put correct Igala in the Why field (two-box design channels this).
- Output purity after the Igala-forcing system prompt: English-framed outputs 41% -> 3.1%.
- Igala is confirmed absent from NLLB, MADLAD-400, and Glot500 - the "effectively unseen language" premise holds.

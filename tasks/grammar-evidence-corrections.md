# Corrections Evidence: What Native Speakers Rejected or Fixed

Role: CORRECTIONS READER (negative evidence). Sources: PairwiseComparison explanations + failure tags, OutputEdit rows, and the Granola record of Agnes's 2026-08-11 live test. These are the rules whose VIOLATION a native speaker notices immediately - the highest-priority rules to enshrine.

## Holdout hygiene (read first)

- `PairwiseComparison."promptId"` joins on `Prompt."promptId"` (the human-readable id, e.g. `ig_bank_reg_033`), NOT on `Prompt.id`. `OutputEdit."promptId"` joins on `Prompt.id` (cuid). Any script that joins these tables the same way for both will silently produce zero or wrong rows.
- 934 pairwise comparisons total; **206 are on isHoldout=true prompts and were EXCLUDED from all evidence below** (native explanations often state the correct answer, i.e. they are gold for that prompt). All evidence below is from the 728 train-split comparisons.
- OutputEdit has only 2 rows; 1 is on a holdout prompt and was excluded. The 1 train-split edit is quoted below.
- 2 comparisons are isDemo=true (kept, flagged; neither carried substantive text).

## Headline numbers

- Winner distribution (all 934): both_inadequate 926, a 3, b 3, tie 1. Models essentially never produce acceptable Igala.
- Of the 728 train-split comparisons, 354 have substantive explanations (not boilerplate like "wrong output"); ~200 of those contain an explicit corrective gloss ("X in Igala is Y") or a full corrected sentence.
- Failure tag totals (both sides, all rows): not_igala 53, wrong_word 53, grammar 6, wrong_language 4, invented 3, cultural 1, english_mixed 1, tone_marks **0**. The tone_marks chip was never used - but tone/spelling corrections show up constantly in free text and in Agnes's live test, so the chip count under-measures the phenomenon (annotators describe spelling errors as "wrong word" or in prose).
- Coverage by bucket (train-split comparisons): orthography 160, grammar_tone 155, register_honorifics 178, lexicon_disambig 173, idioms_metaphor 54, cultural_values 7, authenticity 1, dialectal_fidelity 0 (all 16 dialectal comparisons are holdout). 8 distinct annotators, 2026-07-02 to 2026-08-13.
- The single dominant failure the annotators report is not subtle grammar - it is that model output is **not Igala at all** (pseudo-Igala or Yoruba). Any rule set must first enforce real lexicon, then spelling, then structure.

---

## Class 1: Spelling-changes-meaning (tone marks, dotted vowels, nasal endings, prefixes)

Violations a native reads as a DIFFERENT WORD, not a typo. Counts: tone_marks tag 0 (see caveat above); >=12 free-text corrections in this class plus 3 of Agnes's 5 live-test corrections.

### 1a. Nasal ending is a morpheme, not a letter (Agnes, live test 2026-08-11) - DEDUCED FROM DATA

- Model wrote a form of **Ojọ** ("God") with a plain appended `n` (rendered "Ojoccan"-like). Agnes: "You cannot just sound 'n' just like that. So if you put n, it's sounding something different." Without the nasal it can mean "God"/"time" by context; with the nasal ending the sentence shifts to **"God didn't say / is not saying"** - the nasal is a **negation marker**.
- Corroborated independently in the comparison data: the clause-final nasal negator appears in 5+ annotator-authored corrections (see Class 3, negation). And one orthography explanation spells nasalised vowels with a final `-wn`: "Ẹwn, Efuwn, chẹwn" (ig_bank_orth_031).
- Rule to enshrine: never append `n`/nasal to a word unless negation (or a genuinely nasal vowel, written per community convention e.g. `-wn`) is intended.

### 1b. Do not invent vowel prefixes (Agnes, live test) - DEDUCED FROM DATA

- Model wrote **Onokotu**; Agnes: correct form is **nokotu** ("intelligent/brain"): "The ONO is not supposed to be there for you to make sense."
- Related pattern from comparisons: annotators' corrections freely use elided/apostrophe forms (wọla'ulẹ "welcome", che'gbatu'gba "goodbye", u'neke "can you", ta'ja "to market", Dù mẹ́ / e mẹ "lend"), i.e. real Igala words carry their own vowel skeleton; models both add and drop initial vowels wrongly.

### 1c. oko/ọkọ homograph family (Agnes + 5 comparison rows) - CONFLICTING, needs adjudication

- Agnes (live test): **oko** without diacritics/context can be money / canoe / millipede (summary also noted husband); context and diacritics are essential.
- Comparison rows attest: "farm is 'oko', money is 'ọkọ'" (ig_bank_orth_028); "farm is Ọkọ ... pronounced with high tone" (ig_bank_orth_018); "farm is òkò" (also orth_018, different row); "Ọ̀kọ̀ aeroplane vs Ọ́kọ́ money" (orth_029); "Month in igala is ochu / Moon is ochu" (reg_021, lex_011).
- The MEMBERS of the homograph set are firmly attested (>=3 sources); the exact tone/dot assignment per meaning is **conflicting across annotators** - do not enshrine a specific diacritic mapping without adjudication.

### 1d. Tone minimal pairs given as corrections - DEDUCED FROM DATA (3 attested)

- kọ́ "build" (high) vs kọ̀ "refuse" (low) (ig_bank_orth_029).
- Ọ̀kọ̀ "aeroplane" vs Ọ́kọ́ "money" (ig_bank_orth_029).
- oko "farm" vs ọkọ "money" - dotted vowel changes meaning (ig_bank_orth_028).

### 1e. Annotators' own spelling variance (data-quality caveat)

The corrections themselves disagree on orthography: elder = Ọgijọ / Ogijo / ógìjò / ogìjo (4 spellings, 6+ rows); eat = jẹñwu / jẹnwu / jẹñwù; thank you = anya / ányà / Anya. Treat exact diacritics in single-annotator corrections as provisional; treat the WORD identity as reliable.

---

## Class 2: Wrong-word (real Igala exists, model chose wrong/invented/Yoruba)

The largest class. wrong_word tag: 53 uses; invented 3; wrong_language 4; not_igala 53; plus ~150 free-text corrective glosses. Below, every gloss is verbatim from a train-split explanation (spelling as the annotator wrote it).

### 2a. Core vocabulary the models repeatedly missed (each attested; xN = independent rows)

- morning = **odudu / ọdúdù** (x3, ig_orth_001); today/tomorrow/yesterday = **ẹñyini / ọnẹ / ọnalẹ** (x2, orth_024 - one row swaps ọna/ọnalẹ: conflict on which is tomorrow vs yesterday)
- parts of day = **ọdudu** (dawn), **iyaja / òrọka** (midday - conflict), **anẹ** (evening), **ọdu / òdù** (night) (x3, orth_037)
- market = **aja** (x4: gram_039, gram_023, gram_036 "wa'ja", lex glosses); traditional market-week days = **Ẹkẹ, Ẹdẹ, Afor, Ukwọ** (x3, orth_021 - both models' outputs rejected wholesale)
- elder = **ogijo / Ọgijọ / ógìjò** (x6: orth_020 x3, gram_017, gram_031, reg glosses); man = **ọnẹkẹlẹ** (gram_030); woman = **onobulẹ** (gram_027); child = **ọma** (x3: gram_028, lex_021, reg_022); child (young person) = **imọtọ** (x3: lex_021, gram_032 "abìmọto", gram_034 "ímọtọ")
- mother = **iye** (x4); father = **ata / atai** (x3); grandmother = **okwọ** (x2, lex_023 "Okwọ onobule" maternal / "Okwọ onekele" paternal); uncle = **ọmẹnyi** (x2, orth_035, lex_032); brother = **ọmaye (ọnẹkẹlẹ)**, sister = **ọmaye onobule** (x5: orth_035, lex_014 x2, lex_032 x2, gram_039); in-law = **ana / ánà** (x2, lex_035)
- food = **ujẹñwu** (x4); to eat = **jẹñwu / ejẹnwù** (x4); to cook = **hì / e'yi** (x2 - conflict); water (drinking) = **omi**, river = **aji / ajì** (x4: lex_017, orth_019 x3)
- salt = **omu** (x2, lex_010); egg = **ẹgẹ** (x3, orth_038); oil = **ẹkpọ / ekpo** (x3, orth_038); chicken = **ajuwẹ / ajirẹ / ajìhe** (x3, lex_012 - variants conflict)
- medicine = **ogwu** (x3, lex_025; pharmacy vs traditional = **Ọgwu ẹnẹfu** vs **ọgwu ogwuchekpo**); spirit = **afu**, ancestral spirit = **afu ibegwu** (x2, lex_036)
- king = **onu** (x3: gram_020 x2, orth_025 "chief is Onuh"; but orth_025 also has "chief/titled man is A'jọfẹ" - conflict); Attah's title spelled **Attah Igala** (x2, orth_032; honorific "Gabaìdu atta onu ekpìtì", reg_030)
- farm(n)/to farm/farmer = **ọko / oko; ẹluchẹ / aluchẹ** farmer (x5, orth_027, orth_018 - vowel-dot conflict, see 1c); yam kinds = **ebina** water yam, **ọgọma** yellow yam, **ulayi** bitter yam, **uchu ẹyi** boiled, **ọjẹ uchu** pounded (x2 long lists, lex_033)
- to buy = **là / e'la**, to sell = **tà / e'ta** (x2, lex_024); to borrow / to lend: "borrow is Emẹ, lend is Dù mẹ́" vs "borrow e bi, lend e mẹ" (x2, lex_030 - **direct conflict**, adjudicate)
- to hear = **gbọ / e'gbọ**, to understand = **mā / e'ma / inerumi'eju** (x3, lex_039); to greet = **e gwù gwà / Ẹ'gwugwa / Ugwa** (x3, orth_022); song/music = **Ẹli / elì** (x3, orth_023); blessing = **ẹnyo / Ẹnyọ** (x3, orth_036); guest/visitor = **Ononojo** (x3, lex_029); compound/family home = **òkòlò / Ọkọlọ / akwọra uñyi / olopu** (x4, orth_026 - variants); hand = **ọwọ** (x3, lex_013); moon = **ochu** (x2, lex_011); vehicle: both models wrong x3 (ig_lex_001), no correction given
- please = **kocho / Ko'cho** (x3: reg_009, reg_014, reg_020-adjacent) BUT one row: "Please in igala is **nago**" (reg_009) - **conflict**; likely register-conditioned (nago also appears inside polite requests: "Gwugwu anẹ nago", "na neago")
- thank you = **anya / Anya / Ányà** (x4: lex_018, reg_003, reg_013, orth_033) and **awa / Agba (o)** as greeting-thanks (x3: lex_018 "Awa", orth_033 "àgbà o", reg_002 "Agba o!") - two distinct forms, both attested; welcome = **wọla'ulẹ / Wọla'ulẹ / Ọla'ulẹ / W'ọlalẹ / ọlàlẹ** (x5, orth_017, reg_005); well done = **wola ukọlọ / Wọla'kọlọ** (x4, reg_011, reg_016); hello = **àgbá / Ágbà oo** (x2, orth_039)
- forgive = **mu'du baya mi / mẹ mudu ba'ya ñwu ma** (x3, reg_020, reg_034); wait = **dago / da'go** (x3, reg_026); sit down = **gwanẹ / gwugwu anẹ** (x3, reg_014); goodbye = **che'gbatu'gba / Chẹ'gba tu'gba / Ch'ẹgbatugba** (x3, reg_007); congratulations = **Mẹ wọ lo'jile / ma wọla ojìlẹ** (x2, reg_027); condolence = **agwuli** (x1, reg_019); gathering = **ujo'eju** (x1); festival = **ucholo / Ichọlọ** (x2, gram_032); because = **tọdu / atodu / tódù** (x3, gram_029 x2, reg_020)
- counting in market: **agbulu** (grain bag), **ẹbo** (kilo/pairs), **akpẹ** (oil tin) (x1, lex_037); cardinal directions: "East ọlù-ọdúdù, West ọlù-anẹ, North ọpàta-átẹ, South ọpàta-ọganẹ" vs "East Apo, West Ichi, South Opata, North Oj'ukpale" (x2, lex_028 - **direct conflict**, adjudicate; both agree the models' answers were fabricated)

### 2b. Words confused with neighbours (anti-Idoma/anti-Yoruba) - DEDUCED FROM DATA

- Idoma-confusable set (lex_031, x3 rows): genuine Igala **awà** "well done", **ochochì** "truth", **ocho** "festival", **ọmachala** "Almighty", **ohimini** "flowing river", **Ada** "father", **kocho** "please".
- Yoruba leakage called out explicitly: "This are more youba words than igala" (cult_002). Model outputs rejected wholesale contain Yoruba diagnostics: àti, láti, tí, jọ̀ọ́, oúnjẹ, ìgbéyàwó, Ọlọ́run, ọ̀rọ̀, orúkọ, kékeré, ìdílé, bùkún (gram_039, reg_036, reg_016, lex_036, idiom_005 outputs). wrong_language tag: 4 rows.
- Agnes (live test): **Obadu/Obadju is a proper NAME**, not a common noun - models must not use names as vocabulary.
- Agnes (live test): **ule**-like word means "walk" (move on foot), not "work" - the two senses have different Igala words; model picked the wrong one.

### 2c. Invented words

- invented tag x3; representative explanations: "Neither are Igala words; the correct translation for 'chief' or 'titled man' is 'A'jọfẹ'" (orth_025); "Those are not nasalised words in Igala" (orth_031); "Those are not the Igala words for market days" (orth_021). Both-sides fabrication is the default in orthography single-word prompts: every single-word orthography item in the substantive set (welcome, elder, river, song, blessing, egg/oil, compound, farm, morning, greeting) has BOTH model answers rejected as nonexistent.

---

## Class 3: Wrong-structure (word order, morphosyntax, sentence architecture)

grammar tag: 6 uses; but the strongest structural evidence is the ~30 full-sentence corrections annotators wrote out. Recurring construction patterns in THEIR corrections (deduced from data - these are the structures the models failed to produce):

### 3a. Negation = clause-final nasal particle (ǹ / ń / -n / noò) - 6 attestations

- "They are not eating" = **Mà jẹñwu ǹ** / **Mà jẹnwu nóò** (gram_019 x2)
- "Do not go there" = **Ẹ lò tọmọ ń** / **ẹkì lọ t'ugbo lẹ ñ** (gram_026 x2)
- "If it rains, we will not go to the farm" = **Ichẹñwu k'omi lọ, a'alo t'oko-ñ** (gram_016)
- "It is the elder, not the child" = **Ógìjò dè i, í chí ímọtọ ǹ** / "Ogijo lẹ, k'ọla ọgba, i ch'imọtọ lẹ-n" (gram_034 x2)
- Also reg_016 "ẹbì kpu mì-ǹ", idiom_005 "...ìlì-n". Converges with Agnes's nasal-negation finding (1a). HIGH-CONFIDENCE RULE.

### 3b. Relativizer/subordinator kì (kí/ki) - 6+ attestations

- "The food that my mother cooked is sweet" = **UJẹñwu kì ìye mì hì árìyo** / **Újẹñwú kì ìyè mì hyì à rìnyọ** (gram_022 x2)
- "The man whose farm we visited has died" = **ẹnẹkẹlẹ kì l'uché ká nyì ugbo-wn lé, lẹkwu** (gram_030)
- "Whoever finishes farming first will rest" = **Ẹne kì luchẹ d'ogba á mí** / **Ẹnẹ du ki kẹbẹ kpa dọgba ami** (gram_037 x2)
- "child (young person)" = **Ọma kì chanẹ chì ogìjo** (lex_021). HIGH-CONFIDENCE RULE.

### 3c. Progressive/imperfective with preverbal á/à - 5 attestations

- "the child is eating" = **Ọma lẹ ájẹñwu / Ọmà lẹ à jẹñwù** (gram_028 x2)
- "The elder is greeting the children" = **Ògìjò à gwì àmì ìmọtọ** / "Ábo'gìjo ágwu amo'ma gwa" (gram_017 x2)
- "The traders are coming from the market" = **amanyaja dáwa Kwa aja** / **Á mà àtẹñwù á wá kwì èfù ájá** (gram_023 x2)
- "are going to the market" = **á lọ ta'ja** (gram_039)

### 3d. Coordination with kpai/kpaì ("and/with") - 5 attestations

- **Iye mi kpai ọmaye mi onobulẹ** "my mother and my sister" (gram_039); **Ọjọ (ọkọ) kpaì ọya** "husband and wife" (reg_038); **kpaì umá mẹẹ** (reg_031); **Agba kpia etẹkpẹ** (reg_003); **ẹdekubì kì chẹ ẹbọ-ẹbọ** contexts (reg_037). Yoruba "àti" in model output was rejected in the same rows.

### 3e. Completed action with kpá + mé/mẹ - 3 attestations

- "He has finished eating" = **Oñwù ujẹñwu jẹkpá mé** / **Ì fùjẹñwù jẹ kpà mẹ** (gram_024 x2); "said one word" = **I ku'kọla ka** with completive sense (lex_027).

### 3f. Reported speech with ká kíní/ka kini - 2 attestations (weak, single construction)

- "The children were told that the festival had been postponed" = **Mà ká ñwù ámì ímọtọ ká kíní má mì ìchòlò dù nyọgbà** / **Ma chẹ dù tì abìmọto lẹ ẹtì kì Ichọlọ-lẹ mu chì-tóò** (gram_032 x2). The two corrections differ structurally - CONFLICTING at detail level, agree the models' versions were not Igala.

### 3g. Agnes on structure (live test)

- First model sentence "is saying three different things here entirely" - conflated "God say", "work/walk", and a third idea in one string; unparseable as one Igala sentence.
- Third sentence: too broken to even correct; she asked for the English source to restructure from scratch. Rule: a sentence that mixes clauses without connectives (kì, kpai, tọdu, ká kíní) is not salvageable by word swaps.

---

## Class 4: Register (elder/child/peer address, honorific plurals, cultural form)

register_honorifics is the second-largest substantive bucket (178 train comparisons; nearly all both_inadequate). cultural tag x1. What the annotators' own corrections consistently do that the models did not:

### 4a. Address elders with kin/title vocatives, not translated politeness formulas - 8+ attestations

- Elder greeting formulas: **Iye ọlanẹ** "mother, good evening" (x2, reg_004/reg_010); **Iye ọlodudu** morning greeting, said KNEELING ("To greet an elder in igala we kneel down and say 'Iye ọlodudu'", reg_001); **Ọla-odúúdú** (reg_001); **Onàyì òrọka / Atai ọrọka** "elder/father good afternoon" (x3, reg_012, reg_023); **Ata anya** "father, thank you" (reg_003); **Agba oo abọ ọgijọ** to open an address to elders (reg_033, reg_031).
- Models instead produced Yoruba courtesy phrases (ẹ jọ̀ọ́, ẹ kẹ́dọ̀) or gibberish - rejected every time (not_igala x10 in this bucket).

### 4b. Plural/collective honorific markers mẹ / abọ / amì - 6 attestations

- **Mẹ'gba chaka** "you all, well done / greetings to a group" (x3: reg_008, reg_025, reg_036); **Mẹ wọ'lalẹ** "you all are welcome" (reg_005); **abọ ọgijọ** "(council of) elders" (x3: reg_033, reg_036, OutputEdit below); **abo obulẹ mẹjì** "the two women" (gram_027); **àmì/amì** plural marker before nouns ("àmì ìmọtọ" the children, gram_017; "Ámì èbòbùlẹ méjì" the two women, gram_027).

### 4c. Same message, different form by addressee - 5 attestations

- 'be careful': child **Ọma na che yẹ** vs elder **Atai ẹ na che yẹ yẹ** (reduplicated for respect) (reg_022); also "Kpachara eju wẹ, Ọma / àgbá ogìjo kpachara eju wẹ" (reg_022, second row).
- 'come and eat': child **Ọma la kẹ jẹñwu** vs father **Baba u'jẹñwu wẹ dẹ'i** (reg_015); also "Ọma àgbá lìa ká jẹnwu / onàyì àgbá wa ká jẹnwu ta" (reg_015).
- refusal to peer vs superior: **Omaye U'chen** "my brother, I won't do it" vs **Iye ẹwẹdọ'n u muda neke chen** "mother, don't be offended but I can't" (reg_032).
- Register titles attested: **Gabaìdu / Anu Achadu ọkọ attah** for the Attah's court (reg_017, reg_030); "Mẹ gw'onu ebije" "all hail the iron king" (reg_017).

### 4d. The one train-split OutputEdit (register bucket) - full diff

- Prompt ig_bank_reg_033 (formal request to a council of elders). Model original: long pseudo-Igala string ("Ọjọ̀mọ̀mọ̀ àgbà, ẹ̀kpẹ̀lẹ̀ ọlụ̀mẹ́, ẹ nẹ́ ọ̀bẹ̀rɛ̀..." - contains non-orthographic ɛ, invented words, no Igala connectives).
- Annotator's replacement (provenance model_correction): **"Agba abọ ọgijọ, na tẹne gbọkọ bumẹ ka ki ni ujẹju dẹ weeki eyi ka ñya tu'nwu ọjọ aladi ọgọ mẹlẹ anẹ"** - opens with the honorific vocative (Agba abọ ọgijọ), uses first-person humble frame (na tẹne "I would like to"), and freely borrows English "weeki" for 'week' - showing that pragmatic loanwords are acceptable to natives while fabricated "Igala-looking" words are not.
- Nothing else survives in OutputEdit (2 rows total; the other is holdout and untouched). Edits are effectively an unmined channel so far.

---

## Cross-cutting: "Not Igala at all" is the first gate

- not_igala 53 + wrong_language 4 tags; 926/934 both_inadequate; dozens of explanations of the shape "both outputs are not Igala words". Before any grammar rule matters, output must clear a lexicon gate: words must exist in Igala (LexEntry/RagEntry/ParallelPair-attested), not Yoruba, not invented.
- Yoruba diagnostic tokens observed in rejected outputs (useful as an automatic blocklist): àti, láti, tí, jọ̀ọ́, oúnjẹ, ìgbéyàwó, Ọlọ́run, orúkọ, kékeré, ìdílé, bùkún, ọ̀rọ̀, tàbí, fún, ènìyàn.

## Conflicts requiring adjudication (do NOT enshrine as-is)

1. farm: oko vs ọkọ vs òkò; money ọkọ vs ọ́kọ́ (1c/2a) - same annotator pool, three diacritic schemes.
2. borrow/lend: "borrow Emẹ / lend Dù mẹ́" vs "borrow e bi / lend e mẹ" (lex_030).
3. cardinal directions: two fully disjoint sets (lex_028).
4. please: kocho vs nago (reg_009) - possibly register-conditioned.
5. chief: Onuh vs A'jọfẹ (orth_025); chicken: ajuwẹ vs ajirẹ vs ajìhe (lex_012); midday: iyaja vs òrọka (orth_037); tomorrow/yesterday assignment of ọnẹ/ọna/ọnalẹ (orth_024); to cook: hì vs e'yi (lex_022); welcome: wọla'ulẹ vs ọlàlẹ (orth_017).
6. Market-week days Ẹkẹ/Ẹdẹ/Afor/Ukwọ (orth_021 x3) look identical to the Igbo market week (Eke/Orie-Afọ/Nkwọ family) - consistently given by annotators (so deduced-from-data), but flag for the linguistics lead as possible areal borrowing vs. contamination. SCHOLARLY CHECK NEEDED.

## Data-quality caveats

- Phone autocorrect corrupted some explanations: "Market in Italy is aja", "Mother in ovals is iye" (both clearly "in igala"). Do not ingest explanations verbatim without cleanup.
- Many explanations use the template "In Igala, the word <entire prompt text> is ..." - the Igala after "is" is the payload; the echoed prompt is noise.
- Annotator orthography is inconsistent (see 1e); word identity is trustworthy, exact diacritics are not (single_annotator verification status throughout).
- The Granola account of Agnes's session is a tool-generated summary over the transcript (verbatim transcript endpoint unavailable on current Granola tier); short quotes above are as returned by that tool and should be re-verified against the raw transcript if it becomes available.

## Priority rules to enshrine (ranked by how loudly natives flagged violations)

1. Lexicon gate: every content word must be attested Igala; no Yoruba function words; no invented "Igala-looking" forms; no proper names used as vocabulary (not_igala+wrong_language 57 tags, ~150 corrective glosses, Agnes: Obadu).
2. Nasal ending = negation morpheme; never decorative (Agnes + 6 sentence corrections).
3. No fabricated vowel prefixes; respect elision conventions with apostrophes (Agnes: nokotu; 10+ elided forms in corrections).
4. Homographs (oko family, ochu moon/month, ọjọ God/day/time) require diacritics or disambiguating context (Agnes + 5 rows).
5. Elder address requires kin/title vocative (Iye, Ata(i), Agba, abọ ọgijọ, Gabaìdu) + plural honorific mẹ/abọ, and form changes with addressee (20+ register corrections).
6. Core constructions: relativizer kì; progressive preverbal á/à; coordination kpai; completive kpá mé/mẹ; because tọdu (5-6 attestations each).
7. One sentence = one proposition, joined by real connectives; unconnected clause salad is unsalvageable (Agnes).

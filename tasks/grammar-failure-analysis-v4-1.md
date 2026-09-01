# Grammar failure analysis for v4.1 (2026-08-31)

Naming note: the iteration ships as v4.1 (v4's meaning-first METHOD is the base, since v4
scored 102 on the frozen exam). The failures analyzed here are v3's, because every
annotation in the evidence set came from v3 serving.

Synthesis of the four close-reading miner reports over the 132 judged failure rows of
"Gemini 3.1 Pro + Igala RAG v3" (scratchpad v31-mine-0.md .. v31-mine-3.md), checked
against `tasks/igala-grammar-deduced.md`, `web/src/lib/generation-prompt-v3.ts`, and
`web/src/lib/generation-prompt-v4.ts`. Every second-source claim below was re-verified
against the live ParallelPair table (30,907 rows) during this analysis; the queries and
their results are quoted inline. Counting note: 132 rows cover ~110 distinct outputs
(at least 8 outputs were judged twice); one row can carry several phenomena, so counts
sum past 132.

Headline: three failure economies, three different fixes.

1. **Compliance failures** (~40% of phenomena hits): the model breaks rules v3 states
   verbatim - tone saturation, missing dots, the s-with-dot ban, "never yi", we-as-subject,
   added initial vowels. Prompt-only remediation has a ceiling here; wording can be
   hardened (allowlist framing, denylist of the model's own pet fabrications) but the
   real lever is serving-side checking, noted at the end.
2. **Deliberate gaps that retrieval failed to fill** (~30%): the grade-C register/formula
   layer (greetings, farewells, thanks, blessings, honorifics) was audit-cut from v3 and
   pushed to the data layer - and the data layer demonstrably does not deliver it (the
   model failed on R9.2's own showcase constructions five separate times). Fix: dedicated
   `RagEntry` grammar_rule rows so the C-grade material is actually retrievable.
3. **Genuinely missing or newly discovered grammar** (~30%): two grade-B rules never
   enshrined (serial verbs R2.9, tag copula R1.3), the dative allomorphy detail of R6.1,
   the affirmative optative ki, the muda gloss - plus one finding that contradicts the
   deduced grammar (yes-no question particle) and stays single-sourced.

---

## 1. Consolidated phenomenon table

"v3 rule?" legend: **PV** = rule present in generation-prompt-v3.ts, violated;
**MISS** = no v3 rule (deliberately cut, or never enshrined); **WRONG** = the model
applies a self-invented rule, or v3/the doc states something the natives contradict;
**NEW** = phenomenon absent from the R-inventory.

| #   | Phenomenon                                                                                                                    | Rows | Examples (wrong span => fix)                                                                                                                                          | v3 rule?                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Invented / fabricated lexicon, incl. a stable pet pseudo-vocabulary recurring verbatim across unrelated prompts               | ~65  | `ádṣa` => aja 'market' (5+ items, 3 prompts); `kpùkẹ̀` (3 prompts); `teketeke`, `akeli`, `gbede`, `ojoji`, `abẹki`, `mímí/efí`                                         | PV (METHOD 3) + dictionary coverage gap                                                                                   |
| 2   | Formulaic register frame missing or misfilled (greeting, farewell, thanks, blessing, consolation, hawking, lullaby, folktale) | ~41  | `Wọlẹ dẹ` => `Wọla ulẹ` (R9.2's best-attested construction, failed twice more); `Ódu ényọ̀` => (w)ọla ọdu frame; `lo kpai'ọlafia` => `Ch'ẹgbatugba ẹ lọ kpaì ọla fiya` | MISS (grade C, audit-cut; retrieval failed)                                                                               |
| 3   | Missing dots on attested words                                                                                                | ~25  | `Ene nyo` => `Ẹnẹ ẹnyọ`; `Ojo` => `ọjọ`; `Abo` => `abọ`; `nyate` => `nyatẹ`                                                                                           | PV (REGISTER + ORTHOGRAPHY)                                                                                               |
| 4   | Tone-mark saturation (every native edit strips tone)                                                                          | ~15  | `Àgbá Ọ́jọ́` => `Agba ọjọ`; `Wọla ọ́ma tito` => `Wọla ọma tito`; `nyọ́nyọ́ kí` => `nyọnyọ ki`                                                                              | PV ("sparse or no tone marks")                                                                                            |
| 5   | Banned / alien characters (ṣ, č, ị, ụ)                                                                                        | ~21  | `ádṣa`, `éfodṣa` (ṣ banned verbatim); `íčí` (č not even on the ban list); `mị̀`, `ọlụ̀mẹ́`                                                                               | PV; č shows the ban list is WRONG-by-omission - needs allowlist framing                                                   |
| 6   | Invented hyphenated `é-` prefix / fabricated or stripped word-initial vowels                                                  | ~24  | `é-jẹu` => `Jẹñwu`; `é-gbítì` => `ẹgbiti` (noun's own initial vowel split off); `Íiye` => `Iye`; `Wọlẹ` strips the u of ulẹ                                           | WRONG (self-invented rule); "never add or strip a word-initial vowel" is PV, but no line bans hyphenated prefixes         |
| 7   | Yoruba/Hausa/Igbo imports evading the exact-string blocklist                                                                  | ~20  | `ra` 'buy' (Igala là), `owo` 'money' (Igala ọkọ), `iyawo` => ọya, `ẹgbẹ` (deleted twice by corrector), `Lafia we` (clipped alaafia), `f'` (fún calque), `tutu`, `Nnọ` | NEVER-list present but INCOMPLETE                                                                                         |
| 8   | English structural / idiom calques                                                                                            | ~12  | "good night" as N+ADJ `Ódu ényọ̀`; "don't think small" `ro ọla wewe`; "cool heart" `ẹdo tutu`; "thanks (for) food" `Ányà ujẹñwu`                                       | MISS in v3 (v4's meaning-first METHOD addresses it)                                                                       |
| 9   | Clause salad / overlong sentence (>~7 words, propositions fused)                                                              | ~14  | 24-word one-sentence prayer `Ọjọ é-gbítì, wa abọ Ígáláà tẹn'é-kà...`; corrector deletes whole sentences as unsalvageable                                              | PV (~7-word line) + R10.6 gate MISS (grade C)                                                                             |
| 10  | Fabricated dialect/cultural facts                                                                                             | ~12  | `Wa mímí (Idah) / Wa efí (Ankpa)` - both words and both attributions invented; `Nnọ` asserted as another area's greeting                                              | MISS (no refuse-the-premise licence; R9.1 documents natives declining)                                                    |
| 11  | Pronoun cell errors (possessive wẹ as subject; independent omi as clitic; dropped ẹ)                                          | ~10  | `wẹ ch'ónẹ` => `ẹ ch'...`; `Wẹ á ch'é-gbítì` => `Uwẹ ach'ẹnẹ ẹgbiti`; `lo kpai'...` => `ẹ lọ kpaì...`                                                                 | PV (v3 pronoun table verbatim)                                                                                            |
| 12  | Serial verb chain missing / kẹ-kì swap                                                                                        | ~9   | `wa k'a jẹñwu` => `lia kẹ jẹñwu`; `é-dọ́ mẹ wa ádṣa` => `liya kẹ bumi lẹñwu`; `kẹ nẹ ukpahiu` => `ki ... gbiti` (subordinator, not serial linker)                      | MISS - R2.9 is grade B and absent from v3                                                                                 |
| 13  | Dative allomorphy ñwu/ñw broken                                                                                               | ~7   | `nwi wẹ` => `ñwu wẹ`; `ñw mi` => `ñwu mi`; `ñwẹ`/`nwẹ̀` => `ñwu ẹ / ñwẹ` with engma                                                                                    | MISS (v3's elision line covers apostrophes only)                                                                          |
| 14  | Copula errors (chẹ vs dẹ selection; Bible `che` spelling; chẹ without complement; é- where copula belongs)                    | ~8   | `ki chẹnyọ ñwu wẹ` => `ki d'ẹnyọ ñwu wẹ`; `ujẹñwu lẹ é-nyọ̀` => `ujẹñwu lẹ che nyọ`; `Ọjọ a chẹ` (no complement)                                                       | PV (chi/chẹ vs de line exists); selection semantics thin                                                                  |
| 15  | Homograph dot errors                                                                                                          | ~6   | `Ọkọ mi` ('my money/husband') for 'my farm' => oko/ugbo - the doc's flagship trap; `Ọjọ ka` 'one day' with the God spelling                                           | PV (METHOD 4 "spelling is meaning")                                                                                       |
| 16  | Elision apostrophe misuse (decorative, or missing at a real junction)                                                         | ~6   | `kpai'ọlafia` (no vowel dropped); `ki denyo ñw e` => `ki d'ẹnyọ ñwẹ`; `bẹwñ ebiene` => `b'ẹwñ ẹbiẹnẹ`                                                                 | PV (R6.1 line exists)                                                                                                     |
| 17  | Function-word misuse                                                                                                          | ~6   | `muda` (contrastive 'but rather') used as 'must'; `Ẹñwu du` 'everything' repurposes du 'take.SG'                                                                      | muda MISS (R2.7 not in v3); du gloss PV                                                                                   |
| 18  | Bible-register leaks in community voice                                                                                       | ~6   | `tak'ẹ` (taku banned verbatim); word-final `ewñ`; `chagbiti` epithet; copula `che`                                                                                    | PV (Jihofa/taku line); the word-final -wñ ban is MISS                                                                     |
| 19  | Describe-instead-of-perform (3rd-person report of the speech act)                                                             | ~7   | "mother calls children": `Íye Ígáláà a dọ́ àmọ́ma...` (a description) => `Ọma mì, ẹgba UJẹñwu dẹ, ma lìa ā jẹnwu` (the call); blessing wrapped in `Íiye ka kakini, ...` | NEW - no v3 line                                                                                                          |
| 20  | Determiner yí generated                                                                                                       | 4    | `eñwu yi elia`; `unyi tito yi` (twice in one output) => postnominal `lẹ`                                                                                              | PV ("never yí" - v3's most explicit prohibition)                                                                          |
| 21  | Yes-no question particle missing                                                                                              | 3    | `Aba abọ unyi wẹ?` => `Abọ unyi wẹ fá` / `Akwọra unyi wẹ a` - two distinct native fixes both close with a final particle and delete invented "Aba"                    | WRONG/incomplete - R10.5 claims yes-no is string-identical to the statement; corpus check below keeps this single-sourced |
| 22  | Affirmative optative kì frame ('may God...') missing                                                                          | ~3   | `Ọjọ k'i ch'...` => `Ọjọ kì chẹ...`; blessing gold `Ọjọ ki d'ẹnyọ ñwu wẹ`                                                                                             | MISS (v3 has kì only as prohibitive and relativizer)                                                                      |
| 23  | Wh-question formation calqued                                                                                                 | ~3   | `tọdu ẹñwu k'ẹ gbéé tak'ẹ wa?` ('because of what...') => `Ewñ chi ...` why-frame; 'how are you' missing `abu`                                                         | MISS (R10.5 grade C, cut)                                                                                                 |
| 24  | Vigesimal numeral forms                                                                                                       | 2    | `ogwu meji` => `ogbo meji` 40; money/market paradigm never deployed                                                                                                   | MISS (v3 numeral line stops at mẹ-/ka/ẹkẹ-)                                                                               |
| 25  | Tag copula X S chẹ absent                                                                                                     | 1    | `...chi ẹñwu akwọra uñyi.` => `...akwọra uñyi i chẹ.`                                                                                                                 | MISS - R1.3 is grade B and absent from v3                                                                                 |
| 26  | du/kó object concord + postnominal lẹ omission                                                                                | 2    | `a du ógwu wewe` => `kpẹ ẹñwu ọgwu ki bọ` (plural object, not du); `atta kwu` => `atta lẹ'kwu`                                                                        | PV (both lines exist in v3)                                                                                               |
| 27  | Manner/respect reduplication missing                                                                                          | 2    | fix adds `nyọ nyọ`; corrector rewrites `ki nyọ` => `nyọ'nyọ`                                                                                                          | NEW (only R9.3's `che yẹ yẹ` example exists)                                                                              |
| 28  | Adjudication / eval-data noise                                                                                                | 3    | `Wọla` judged "Correct" yet lost (twice); one judgment's explanation is an off-topic naira list                                                                       | n/a - eval hygiene flag                                                                                                   |

**28 distinct patterns.** The top of the table is dominated by compliance (1, 3-5, 6 in
part, 11, 15-16, 18, 20, 26) and by the audit-cut register layer (2); the middle by
blocklist evasion and calques; the tail by genuinely missing grammar.

---

## 2. Rule candidates: evidence, verification, placement

Evidence standard: two independent source classes = enshrinable (community corrections
are ONE class; Bible/ParallelPair alignment and the scholarship are the others). Every
corpus leg below was re-run against the live ParallelPair table on 2026-08-31, not
quoted from memory. Single-class candidates go to NOT YET regardless of how convincing
the corrections look.

### ENSHRINABLE - goes into the v3.1 SYSTEM PROMPT (8 rules)

**E1. Serial verb chaining (upgrade of R2.9, B).**
Rule: "Verbs chain directly with kẹ: 'come and eat' = lia kẹ jẹñwu. kẹ links VERBS in
one chain; kì/ki subordinates a new CLAUSE - never swap them."

- Corrections class: `lia kẹ jẹñwu` (x2), `liya kẹ bumi lẹñwu kuna ta`, `Ku do'mi wa kẹ mọ`,
  register pair `Ọma la kẹ jẹñwu` (all train, cited in R2.9).
- Corpus class (VERIFIED this session): 96 verses contain ` ke je`; [746] "e kwane gugu
  ke je elaodemi" = "sit up and eat of my game"; [2344] "e kamomawñ wa ke kafe nyuma ola"
  = "you shall bring his sons and put coats on them". Bible-orthography ke = community kẹ.
- Scholarship class: Ejeba's concord operates inside serial complex predicates; Lydia's
  rubric names serial verbs a documented feature.
- Three classes -> effectively grade A. Targets pattern 12 (~9 rows). SYSTEM PROMPT.
  Leak note: `lia kẹ jẹñwu` is a train attestation - must pass the frozen-set scan
  before shipping; if it fails, cite the frame schematically (V kẹ V) with no example.

**E2. Affirmative optative kì (extension of R2.4, B).**
Rule: "Wishes and blessings: SUBJECT + kì + verb ('Ọjọ kì ... ' = may God ...). Same kì
frame as the prohibition, without the final nasal."

- Corrections class: blessing golds `Ọjọ ki d'ẹnyọ ñwu wẹ` (edit row), `Ọjọ kì danyedo-we`
  (consolation gold), `ọjọ kì je kì...` (newborn-blessing gold).
- Corpus class (VERIFIED): 393 verses contain "Ojo ki "; [13] "Emu ki jagbagba efojale..."
  renders "Let there be lights..." - the jussive frame.
- Grade B. Targets pattern 22 and part of 2 (blessing shape). SYSTEM PROMPT (one clause
  appended to the existing negation/kì line).

**E3. Dative allomorphy ñwu / ñw (detail of R6.1, A).**
Rule: "'to/for' is ñwu before a consonant, ñw' before a vowel (ñwu wẹ, ñw'ọma). Never
nwi, nwẹ, or plain nw - the engma ñ is part of the word."

- Corpus class (VERIFIED): ñwu + consonant-initial word 2,547 vs ñwu + vowel-initial 14;
  ñw + vowel-initial 7,061 vs ñw + consonant-initial 876 (the known 11% leak, dominated
  by ñw ma / ñw mi - flagged to linguists separately, does not weaken the ñwu direction).
- Corrections class: `nwi wẹ` => ñwu wẹ; `nwẹ̀` => `ñwẹ`; `ñw mi` corrected in item 25's
  reading; `f'íyè` (Yoruba fún calque) => `ñwi íyè`.
- Grade A. Targets pattern 13 (~7 rows). SYSTEM PROMPT (clause on the elision line).

**E4. No hyphenated prefixes (new negative rule; the é- tic).**
Rule: "Igala writes NO hyphenated prefixes. Never write é- (or any vowel + hyphen)
before a word: the incompletive is the standalone word á, and a noun's initial vowel
stays inside the noun (ẹgbiti, never é-gbítì)."

- Corpus class (VERIFIED): tokens shaped `V-` in 30,907 verses: **0**.
- Corrections class: editors delete the é- in three separate edit rows (`é-jẹu` =>
  `Jẹñwu`; `i la é-du uredo` => `i la du urẹdọ`; `é-gbítì` => `ẹgbiti` - the last proving
  the tic also mis-segments a noun's own initial vowel).
- Two classes on a negative/orthographic rule. Targets pattern 6 (~24 rows) - the single
  highest-ROI addition in this whole spec. SYSTEM PROMPT.

**E5. Character allowlist (reframe of the ORTHOGRAPHY line; R8.1/R8.4).**
Rule: "Igala words use ONLY these letters: a b ch d e ẹ f g gb gw i j k kp kw l m n
ñ ñm ñw nw ny o ọ p r t u w y, plus the apostrophe and tone accents. Any other letter
(ṣ, č, ị, ụ, x, q, v, z...) is not Igala - if a word seems to need one, the word is wrong."

- Evidence: scholarship consonant inventory (Ejeba 28-consonant reference, R8.4) +
  corpus/community character census (R8.1 grade A). The v3 ban list is evaded in the
  failures by `č`, which no ban list anticipated; an allowlist cannot be evaded.
- Grade B reframing of already-enshrined material. Targets pattern 5 (~21 rows). SYSTEM
  PROMPT (replaces the "Never write ṣ, ị, ụ or ṅ" sentence).

**E6. Word-final -wñ ban in community voice (R8.4, B).**
Rule (REGISTER addition): "never end a word in -wñ - community writing uses full
syllables (ẹñwu, ñwu) or -wn."

- Evidence: section 13 register table row (corpus: word-final -wñ pervasive in Bible
  orthography; community: zero word-final -wñ, -wn attested in corrections "ugbo-wn",
  "Ẹwn, Efuwn, chẹwn" orth_031). Corpus-vs-community contrast is the doc's B grading.
- Targets pattern 18 in part. SYSTEM PROMPT (half-line on REGISTER).

**E7. muda gloss (R2.7, B).**
Rule (appended to the Joining line): "muda = 'but (rather)' - contrast only, never
'must' or a verb."

- Corpus class (VERIFIED): 2,353 verses contain `muda` (doc: 2,052/2,363 co-occur with
  but/not/no); [81] "...Ebel la chadejute amewñore egini Ken muda chaluche" = "Abel was a
  keeper of sheep BUT Cain a worker of the ground".
- Corrections class: "Iye ẹwẹdọ'n u muda neke chen" (reg_032) - contrastive refusal.
- Grade B. Targets pattern 17. SYSTEM PROMPT (8 tokens).

**E8. Blocklist extensions (anti-fabrication corollary of the 5xA lexicon gate).**
Rule (NEVER WRITE additions, DON'T-side only per the Scope-A convention):

- Yoruba line additions: `ra` for 'buy'; `owo` for 'money'; `fún` (and its elided `f'`);
  `iyawo`; `ẹgbẹ`; `tutu`; any alaafia-shaped form (lafia, ọlafia) - the family, since
  the exact-string ban was evaded by clipped cousins.
- New third line - the model's own recurring fabrications, all zero-attested in every
  source class: `ádṣa, kpùkẹ̀, ojoji, teketeke, akeli, gbede, abẹki, mímí, efí, kpegwa`.
  (Safe to name: they are not words, so they cannot leak gold.)
- Evidence per Yoruba item: native deletion/replacement in corrections (ẹgbẹ deleted
  twice; iyawo => the attested `ọya` "Ọjọ kpaì ọya" R2.8/R10.2; f' => ñwi) + the doc's
  own S12#1 blocklist (fún is on it, and was simply never copied into v3's list) +
  scholarship for là 'buy' ("òdùdè là ògèdè", Adeniyi). Grade: extension of an A-grade
  gate. Targets patterns 1 and 7. SYSTEM PROMPT.

### Procedural adoptions from v4 (no evidence grade needed - method, not grammar)

- **M1. Meaning-first METHOD** (v4 steps 1-6 verbatim): kills the word-by-word calque
  channel (pattern 8) and the missing-word fabrication channel (pattern 1 in part).
  v4's exam score (102) is the empirical warrant; its header carries the Agnes evidence.
- **M2. Perform, don't describe** (new METHOD step): "When the question asks how someone
  would SAY something, write the words they would speak, in their voice - never a
  description of them speaking." Targets pattern 19 (~7 rows). Asserts no Igala form,
  so the sourcing contract does not apply.
- **M3. Dialect honesty** (new METHOD clause): "Never assert which town or area uses a
  form unless your reference material says so - saying you do not know is correct."
  Targets pattern 10 (~12 rows). This is an anti-hallucination instruction, not the
  C-grade R9.1 rule; it asserts no linguistic fact. (R9.1's "no word for hello" content
  itself stays in the data layer - RE1.)
- **M4. v4's small-word gate and dates line** come along with the v4 base (evidence in
  the v4 header; dates R5.3 grade B).

### RAG ENTRY - new `RagEntry` grammar_rule rows (9 entries)

Grade-C register material belongs in the data layer per the sourcing contract - the
failure was that generic retrieval never surfaced it. These entries make the C-layer
retrievable as explicit grammar_rule rows (draft content in section 3.3). RE8 and RE9
are grade B but bulky/contextual - prompt budget says RAG, not system prompt.

| ID  | Entry                                                                 | Grade                                                                                                | Targets        |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| RE1 | Greeting frame (w)ọla + time/place; hail Agba oo; no word for 'hello' | C (R9.1/R9.2, 52+ attestations)                                                                      | pattern 2      |
| RE2 | Farewell: the Ch'ugba t'ugba family; goodbye is never "go with peace" | C (R9.2 corrections x5)                                                                              | pattern 2      |
| RE3 | Thanks: anya; fuller thanks is a blessing (Ọjọ kì + d'ẹnyọ frame)     | C [thin] (R9.3) + E2's B frame                                                                       | patterns 2, 22 |
| RE4 | Vocatives and honorific address; addressee reshaping pairs            | C (R9.3, 20+ corrections; 178-comparison bucket)                                                     | patterns 2, 19 |
| RE5 | Polite volitive na tẹnẹ frame for invitations/requests/announcements  | C (R2.8, 19 occurrences + the train OutputEdit)                                                      | pattern 2      |
| RE6 | Consolation/encouragement: prohibitive opener + optative comfort      | C (corrections golds)                                                                                | pattern 2      |
| RE7 | Wh-question words; no inversion                                       | C (R10.5 corpus-only + community thin)                                                               | pattern 23     |
| RE8 | Vigesimal numbers and market money counting                           | B (R5.4; VERIFIED: ogbo meji 131 verses incl. [163] "forty days and forty nights"; nyoke 421)        | pattern 24     |
| RE9 | Tag copula X S chẹ (optional predicate-first closure)                 | B (R1.3; VERIFIED: [625] "Adu Ebraham omi che" = "I am Abraham's servant"; 476 verses end in " che") | pattern 25     |

### NOT YET - single source class; goes to the Lydia/Salem WALS session (section 4)

The headline entry: **the yes-no question particle.** Two independent-looking native
fixes close a yes-no question with a final particle (`...wẹ fá`, `...wẹ a`) and both
delete the model's invented opener - directly contradicting R10.5's "yes-no questions
are string-identical to statements". I ran the corpus check the doc's open note asked
for (VERIFIED this session): of 558 verses whose English begins with a yes-no auxiliary,
**0 end in `a` and 0 in `fa`** (baseline: 39 and 8 per 30,349 non-question verses), while
final `n` is enriched 29.4% vs 11.5% baseline - replicating the doc's "interrogative n
not excluded" note. So the particle has exactly one source class (corrections) and the
Bible either lacks it or renders it as the ambiguous final n. Hypothesis, not rule.
Also NOT YET: yes/no interjections, reduplication productivity, 'here', Onu vs Ata,
kẹ/ki orthography, and the rest of section 4.

---

## 3. The v3.1 spec

Design decision: **v3.1 = v4's static prompt as the base** (its METHOD rewrite, dates
line, small-word gate, and Igbo line are all evidence-graded in the v4 header and the
exam says they work) **+ the eight enshrinable rules and three procedural additions
above + the nine RAG entries**, served over **buildRetrievalV2** so the v3 -> v3.1 delta
is attributable to static text + grammar_rule rows, not to the v4 retrieval changes.

### 3.1 Diff plan against generation-prompt-v3.ts (new file `web/src/lib/generation-prompt-v3-1.ts`)

Section-by-section, relative to IGALA_SYSTEM_V3:

- **(a) Identity** - unchanged.
- **(b) THE METHOD** - replaced by v4's six meaning-first steps, byte-identical to
  IGALA_SYSTEM_V4, plus two new steps:
  - step 7 (M2): "When the question asks how someone would say something, write the
    words they would speak, in their voice - never a description of them speaking."
  - step 8 (M3): "Never assert which town or area uses a form unless your reference
    material says so - saying you do not know is correct."
- **(c) CLOSED-CLASS GRAMMAR** - v3's ten lines kept; v4's dates line and small-word
  gate adopted; four edits/additions:
  - E1 new line: "Verbs chain with kẹ: one action then another is V kẹ V. kẹ links
    verbs; kì/ki starts a new clause - never swap them." (Add "lia kẹ jẹñwu" as the
    example ONLY if the static leak check passes it.)
  - E2 appended to the negation line: "The same subject + kì + verb WITHOUT the nasal
    is a wish or blessing: Ọjọ kì ... = may God ..."
  - E3 appended to the elision line: "'to/for' is ñwu before a consonant, ñw' before a
    vowel - never nwi or plain nw."
  - E4 new line: "Igala has no hyphenated prefixes: never write é- or any vowel-hyphen
    before a word. The incompletive is the standalone word á; a noun keeps its own
    first vowel inside the word."
  - E7 appended to the Joining line: "muda = but (rather) - contrast only, never 'must'."
- **(d) REGISTER** - v3 line kept, with E6 appended: "never end a word in -wñ"; and the
  tone clause hardened from "sparse or no tone marks" to "no tone marks unless the
  question asks for them" (R8.3 grade A: 'saturate only on request'; every native edit
  in the failure set strips tone).
- **(e) ORTHOGRAPHY** - E5 allowlist reframing replaces the ban-list sentence; the
  seven-vowels and digraph sentences stay.
- **(f) NEVER WRITE** - v3 Yoruba line + E8 additions; v4's Igbo market-day line kept;
  new third line naming the model's ten recurring fabrications.
- **(g) OUTPUT** - unchanged.

### 3.2 Budget

v3 holds ~700 tokens (chars/4, enforced by generation-prompt-v3.test.ts); v4 holds ~900.
The additions above are ~55 tokens (METHOD steps 7-8) + ~95 tokens (grammar E1-E4, E7)

- ~20 (REGISTER) + ~10 net (allowlist swap) + ~55 (NEVER WRITE additions) = **~235
  tokens over the v4 base => budget ceiling ~1,150 tokens** in
  `generation-prompt-v3-1.test.ts`. Still a fraction of the retrieved payload, which the
  ablations say is the load-bearing signal; anything pushing past 1,150 should come out
  of the RAG entries, not new prompt lines.

### 3.3 New RagEntry grammar_rule rows (draft content)

All nine are `kind: grammar_rule`. Every string below must pass the static leak check
against the frozen protected set before insertion (several quote train corrections,
which is allowed; frozen gold is not) - strings that fail get schematized (frame slots,
no example).

**RE1 - greeting frame** (retrieve for: greeting, hello, good morning/afternoon/evening/
night, welcome, well done)

> Igala has no word for 'hello'. The general hail is "Agba oo"; peers say "aidẹ"/"Abẹle".
> The productive greeting is (w)ọla + a time or occasion noun: wọla ọdudu (morning),
> wọla ọrọka (afternoon), wọla anẹ (evening), wọla ọdu (night), wọla ulẹ / Wọla'ulẹ
> (welcome home), wọla ukọlọ (well done at work). Licit shapes: wọla X, ọla X, ọl'X.
> Only these slot nouns - do not put other nouns in the frame. Never translate 'good
> night' word-for-word as noun + adjective.

**RE2 - farewell** (retrieve for: goodbye, farewell, safe journey, parting)

> Goodbye is the Ch'ugba t'ugba family ("till next time"), optionally followed by a
> blessing (ẹ lọ kpaì ọla fiya - go with wellbeing). Never compose "go with peace" from
> a Yoruba word; ọlafia/alaafia is not Igala.

**RE3 - thanks** (retrieve for: thank, gratitude, appreciation, after a meal/gift)

> Plain thanks: anya (also "Agba" as a hail of appreciation, "Agba ọjọ" = thank God).
> Fuller thanks is a BLESSING on the giver, with the optative kì frame: Ọjọ kì + verb
> ('may God ...' - e.g. give you goodness: d'ẹnyọ + dative ñwu). Bare "thanks + noun"
> juxtaposition is English-shaped, not Igala.

**RE4 - vocatives and honorifics** (retrieve for: elder, respect, formal address,
council, chief, mother/father address)

> Politeness = kin/status vocative first + honorific plural, never verb morphology.
> Vocatives: Iye (mother), Ata/Atai (father/sir), Baba, Mama, Onàyì (elder), Ọma (child),
> elders as a body "Agba (oo) abọ ọgijọ"; royal court: Gabaìdu. Honorific 'you' to an
> elder or group is the plural mẹ. The same message changes shape by addressee: to a
> child use Ọma + plain form; to an elder add the vocative, mẹ, and reduplicate the
> manner word for respect.

**RE5 - polite volitive** (retrieve for: invite, request, announce, would like to)

> Invitations, requests and announcements open with na tẹnẹ/tene + verb ('I would like
> to / I am going to'): honorific vocative + na tẹnẹ + ka ki ni ... ('...inform you
> that...'). This is the backbone of formal speech.

**RE6 - consolation and encouragement** (retrieve for: comfort, grief, condolence,
encourage, bad harvest, loss)

> Consolation opens with a prohibitive: subject + kì + verb + -n ('do not cry / do not
> lose heart'), then an optative comfort: Ọjọ kì + verb ('may God ...'). Do not calque
> English idioms ('think small', 'cool heart'); do not import Nnọ.

**RE7 - questions** (retrieve for: ask, question, why, what, where, who, when, how)

> Wh-words stay in place, no inversion: ewñ 'what', Ewñ chi 'why', ugbo 'where', ene
> 'who', egba ku 'when', abu 'how' ("Abu wele" - how are you). Do not build 'why' from
> tọdu ('because').

**RE8 - big numbers and money** (retrieve for: count, money, price, market, number
above 20)

> The number system is base-20 and only adds or multiplies - never subtracts. ogu 20;
> ogbo meji 40 (20x2); oje 50; nyoke is the additive linker (ogbo meta nyoke megwa =
> 70); ogumelu 100 (20x5); icham nyogwoko 1000. Money in the market is counted in this
> system. Small attributive numerals stay postnominal with mẹ-.

**RE9 - tag copula** (retrieve for: 'X is Y' statements, introductions, definitions)

> Equative sentences allow a predicate-first order closed by the copula: X S chẹ
> ('Abraham's servant I am' - corpus [625] "Adu Ebraham omi che"), alongside plain
> S chi/chẹ X. Both are licit; the tag is optional.

### 3.4 Registration plan

1. **Prompt file**: `web/src/lib/generation-prompt-v3-1.ts` exporting IGALA_SYSTEM_V3_1
   per section 3.1; `generation-prompt-v3-1.test.ts` with the ~1,150-token budget test
   and line-by-line representative leak assertions (mirroring the v3/v4 test files).
2. **Static leak check**: `scripts/static-leak-check-v3-1.ts` (clone of the v3/v4
   scripts) run against the real frozen protected set - REQUIRED before serving, and
   re-run on any edit. It must also scan the nine RagEntry drafts (they are served
   text; Scope A applies to whatever ships on a request). Known-risk strings to watch:
   `lia kẹ jẹñwu`, `Ọjọ ki d'ẹnyọ ñwu wẹ`, `Wọla'ulẹ`, `Ch'ugba t'ugba`, `Abu wele` -
   all train-attested, but the frozen set must confirm none is a protected gold answer.
3. **RagEntry insertion**: script inserting the nine grammar_rule rows (idempotent by
   a stable slug), tagged so the v2 retrieval layer can surface them for the matching
   prompt families.
4. **Candidate registration**: new CandidateModel row, name
   **"Gemini 3.1 Pro + Igala RAG v3.1"**, `inPairingPool: true`, versionLabel
   **rag-v3-1**. Serving path: **buildRetrievalV2 + buildUserTurnV2 (unchanged, byte
   for byte) + IGALA_SYSTEM_V3_1**. The rag-v3 path stays untouched so the v3/v3.1
   arena delta isolates exactly {static prompt changes + the nine grammar_rule rows}.
5. **Out of scope for this workflow** (analysis only, no code changes, no commits):
   all of the above is the spec for the implementing session.

### 3.5 Beyond-prompt levers (recorded, not specced)

Roughly 40% of phenomena hits violate lines v3 already states - prompt-only remediation
has a measured ceiling. Three cheap serving-side checks would catch large slices
mechanically: (a) character-allowlist scan of the output (catches every ṣ/č/ị/ụ row);
(b) fabrication denylist scan (ádṣa family - recurring verbatim); (c) tone-mark
stripper for community-register prompts (every native edit in the failure set strips
tone). These are generation-side lint, not grammar; listed for the next serving RFC.

---

## 4. Questions for the linguists (Lydia -> Salem WALS session)

Everything here is single-sourced or conflicted. Format: what we saw, what we need.

1. **Yes-no question particle.** Native fixes closed "Is your family well?" with a
   final particle: "Abọ unyi wẹ fá" and "Akwọra unyi wẹ a". Our Bible corpus never
   shows final a/fá in yes-no questions (0/558) but shows final -n enriched 2.6x.
   Does spoken Igala close yes-no questions with a particle? Is it a, fá, both
   (dialect/register)? Is the question-final n a different (negative-expectation)
   particle? This decides whether R10.5 is wrong.
2. **'Yes' and 'no'.** No source in our data attests the plain interjections. The model
   invented answers (ọ̀nálẹ́ - actually the tomorrow/yesterday word - and aha/ee/ññ).
   What are the words, with dots and tone?
3. **"Aba" as a question opener.** The model produced it twice; both native fixes
   deleted it. Is there any interrogative opener "Aba", or pure fabrication?
4. **Akwọra.** A native fix uses "Akwọra unyi wẹ a" for asking after the household.
   Gloss and range of akwọra? (Also appears in "Akwọra uñyi" 'extended family'?)
5. **Reduplication.** Fixes add nyọ nyọ / nyọ'nyọ; R9.3 has "che yẹ yẹ" for respect.
   Is manner reduplication productive for intensity and/or respect? When is the
   apostrophized spelling (nyọ'nyọ) right?
6. **'Here'.** "Come here": the model invented mímí/efí. What is the attested word for
   'here' with lia/wa - and is 'come' lia only, or is wa also Igala (we suspect Yoruba)?
7. **'King/ruler'.** An edit corrected Àtá => Onu for generic 'ruler'. Confirm: Ata =
   father/the royal title only; onu = generic king/chief? (Conflict registry #5 also
   has chief Onuh vs A'jọfẹ.)
8. **kẹ vs ki spelling of the serial linker.** One corrector wrote the serial chain as
   "Jẹñwu ñyo'ñyo ki ni ukpahiu" (ki), others use kẹ (lia kẹ jẹñwu). One morpheme with
   two spellings, or two morphemes? Bible orthography shows "ke".
9. **Nnọ.** The model uses it for 'sorry/welcome' in consolation; two miners flag it
   as Igbo-flavored, one prompt asserts it as a regional greeting. Is Nnọ Igala at all?
10. **Thanks-to-God formula.** "Agba Ọjọ" was judged Correct by one annotator and wrong
    (cultural) by another. Is Agba ọjọ an acceptable 'thank God'? What is the full form?
11. **'Patience', 'discouraged', 'strong'.** Fixes surface ẹdejẹ 'patience' ("Ẹdejẹ che
    nyọ") and gbiti 'be strong' (vs the noun ẹgbiti, vs Bible chagbiti). Confirm these
    lexemes and their word class - our dictionary lacks all three.
12. **Homograph diacritics** (carried over from registry #1): one adjudicated mapping
    for the oko family (farm / money / canoe / husband) and ochu (moon/month), so METHOD
    4 can cite a table instead of "needs context".
13. **ñw ma / ñw mi leakage** (R6.1 open note, 876 corpus tokens): real allomorph
    exception before m-, or Bible spelling noise? Decides how absolute E3's wording
    can be.
14. **Genre exemplars.** Lullaby, folktale opener (call-and-response?), market hawking
    cry, praise-singing: we have zero attested examples of any of them, and the model
    fails every one. Even a single recorded/written exemplar per genre would seed the
    data layer - this is a data request, not a rule question.

Eval-hygiene flag for the team (not for Salem): two "lost" rows carry judgments of
"Correct" on our output, and one row's explanation is an off-topic naira-denomination
list - adjudication noise worth a pass before the next failure mine.

---

_Summary counts: patterns 28; enshrinable 8; ragEntries 9; openQuestions 14._

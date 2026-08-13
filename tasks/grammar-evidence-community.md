# Community-Usage Grammar Evidence (train split only)

Source: ColdAuthorAnswer joined to Prompt, `isHoldout = false` only. N = 884 answers
(orthography 166, grammar_tone 193, lexicon_disambig 219, register_honorifics 237,
idioms_metaphor 61, cultural_values 7, authenticity 1). 451 answers (51%) carry an
`englishGloss`. Comparison corpus: 3,000-verse sample of ParallelPair (Bible).
No holdout gold was read at any point. All counts below are from this train slice.

Method note: every rule below is tagged **[deduced]** (from these counts),
**[conflicting]** (data attests both ways), or **[thin]** (under 3 independent
examples - use with caution). Nothing here is scholarly-only; no external grammar
was consulted.

---

## 1. Contraction and elision habits

**[deduced] Apostrophe elision is a core community habit the Bible never uses.**
256/884 answers (29%) contain an apostrophized contraction; 0/3,000 Bible verses do.
The apostrophe replaces a vowel at a V#V word junction, in both directions
(final vowel of word 1 deleted: `ọl'odudu` < ọla odudu; or fused onto the next
word: `wọla'ule`, `lẹ'ñwu` < lẹ ẹñwu).

Most frequent contracted tokens (count): `aj'ẹñwu` 9, `w'ọla` 8, `k'ọla` 6,
`k'omi` 5, `d'ọmọ` 4, `wa'ja` 4, `gwọ'mọ` 4, `chu'kwu` 4, `ch'ẹgbatugba` 3,
`ọl'odudu` 3, `d'ugbo` 3, `kọ'mi` 3, `ujẹ'ñwu` 3, `am'onobulẹ` 2, `ch'ọmaye` 2,
`t'oko` 2, `kw'aja` 2.

**[conflicting] Full and contracted forms coexist for the same phrase, often from
different annotators, sometimes the same one:**

- `wọla ulẹ` (2) ~ `W'ọla ulẹ` (2) ~ `wọla'ule` / `Wọla'ulẹ` (2) 'welcome'
- `Ọla odudu Baba` ~ `Ọl'odudu` (3) ~ `Wọla ọdudu` (3+) 'good morning'
- `Ch'ugba t'ugba` (2) ~ `Chẹ'gba tu'gba` ~ `Ichi ẹgba tu'gba` 'goodbye (till next time)'
- `ka ki ni` (6) ~ `kakini` (4) ~ `ka kini` (1) 'that' (see section 6)
  Models should treat contraction as free variation and never "correct" one to the other.

**[deduced] What contracts:** high-frequency grammatical hosts (chi 'be', ka/ku/ki
'that/who', tọ/lọ 'to/go', plural amì, greeting ọla) before vowel-initial nouns.
Content nouns rarely contract with each other.

---

## 2. Greeting paradigm

**[deduced] The productive greeting frame is `(w)ọla + time/place noun`,
with three surface shapes:** full `wọla X` (20 attested), bare `ọla X` (7),
contracted `ọl'X` / `w'ọla X` (25 apostrophized ọl-/w'ọ- junctions).

Time/place slot fillers attested:

- `wọla ọdudu` / `Ọl'odudu` / `Ọla odudu baba` - morning (8+)
- `wọla ọrọka` / `Wọla ọrọka abogijo` - afternoon (4)
- `Wọla anẹ` / `Ọl'anẹ` / `Ọlanẹ iye mi` - evening (5)
- `wọla ulẹ` / `W'ọla ulẹ` / `Wọla'ulẹ, Ọla'ulẹ` / `Ọlalẹ` - welcome-home (7)
- `Mẹ wola ìko-ì` - 'good day at this hour' (1, plural mẹ) [thin]

Day-part lexemes (orthography bucket, majority spellings): `ọdudu`/`Ọdudu` morning
(10 of 13 undotted-o variants dotted; toned `ódùdù`, `Òdúdú` minority), `iyaja`
midday, `ọrọka` afternoon, `anẹ` evening, `ọdu` night, `inajọ` dawn.

**[deduced] Parallel greeting register, not built on ọla:**

- `Agba (oo/ooo)` - general hail / 'weldone': 60 tokens of agba; plural
  `Mẹ agba ọ` / `M'ẹgba ooo` (2) / `Mẹ'gba chaka` 'you all weldone'
- Response to greeting: `Agba nago` (2), `Nẹago, Ọma mì, àgbá` 'thank you my child'
- Peer/casual: `Abẹle` (2), `A'idẹ (ke)` / `Ai'dẹ ke` 'how far' (3), `aidẹ` 'hello'
- Goodbye: `Ch'ugba t'ugba` family (5, see above), `Onàyì Ch'ẹgbatugba` to an elder
- 'Is there a word for hello?': 3 answers explicitly say there is none
  ("No translation for hello in Igala"); others give `Ágbà oo` / `aidẹ`. **[conflicting]**

**[deduced] Politeness is done with kinship/status vocatives around the formula,
not with special verb morphology:** `Iye mi wọla odudu`, `Ata ọkọ mi ọrọka`
(father-in-law), `Onàyì òrọka` (elder), `Atai ọrọka` 'sir', `Mama ọl'odudu`.
Body-language framing appears in words: `Danye'kwu ke ka kini, Iye ọlodudu`
'kneel down and say, mummy good morning'. Chief greeting is its own lexicon:
`Gágo jáàchì`, `Gabaìdu`, `Agba ooo` + praise `Mẹ gw'onu ebije` 'all hail the iron king'.

---

## 3. me- vs bare numeral alternation

**[deduced] Cardinal quantification of a noun uses postnominal `mé-` numeral:**
25 attested me- tokens, all N + mé-NUM order, none prenominal:

- `Am'onobulẹ meji lẹ ch'ọmaye ma che` 'the two women are sisters' (x2; also
  `Ámì èbòbùlẹ méjì`, `Abo obulẹ mẹjì-ì`, `ọnọbulẹ mẹji` - 5 independent versions)
- `Ẹkwu ọjọ mẹta` 'die in three days' (3)
- `ọjọ aja mẹlẹ` 'four market days' (1), `Abẹrẹ mẹlẹ` (2)
- market measures: `uchubu umomi me ji, agbulu me'ta, akpẹ mẹ'fa, oyomoyo mẹ'lẹ`
  (one answer showing the whole paradigm; note internal apostrophe/space variants
  `me ji` ~ `meji` ~ `mẹji` **[conflicting spelling]**)

**[deduced] Ordinals use `ẹkẹ-` + bare stem, not me-:** `ọjọ ẹkẹgwẹlẹ` '14th day'
(2), `ọchu ẹkẹlu` (2), `ọchu ẹkẹta` 'third month' (1), `ọjọ ẹkẹbiẹ` (1).

**[thin] 'one' is bare postnominal `ka`, not _mé-ka:_ `I kọla ka` 'she said one
word', `ukọla ẹyọ ka` (2 contexts, same annotator pair).

**[thin] Definite numeral takes lẹ:** `meji lẹ` 'the two' (2). Watch for
`mẹji-ì` with lengthened definite -ì (1).

Caution: `meju` also surfaces as a verb ('be able/know': `I meju ma ki igala
yọyọ` 'she can speak Igala well') - do not auto-parse me- words as numerals.

---

## 4. Answer templates per bucket (how they actually answer)

| bucket              | n   | avg words | single-word | 2-3 words | multiline | dash-gloss | English in answer |
| ------------------- | --- | --------- | ----------- | --------- | --------- | ---------- | ----------------- |
| orthography         | 166 | 3.7       | 43%         | 22%       | 22%       | 8%         | 16%               |
| grammar_tone        | 193 | 7.1       | 0%          | 13%       | 6%        | 1%         | 25%               |
| lexicon_disambig    | 219 | 8.1       | 25%         | 10%       | 48%       | 28%        | 34%               |
| register_honorifics | 237 | 8.9       | 12%         | 29%       | 15%       | 6%         | 15%               |
| idioms_metaphor     | 61  | 19.0      | 0%          | 5%        | 20%       | 18%        | 38%               |
| cultural_values     | 7   | 30.7      | 0%          | 0%        | 14%       | 0%         | 0%                |

**[deduced] templates:**

- **orthography**: the bare lexeme, usually capitalized, no sentence wrapper
  (`Ọdudu`, `Ẹli`, `Aji`, `Òkò`). Two-item prompts use `X = gloss` or newline
  lists (`uchẹ = to farm / Eluchẹ = farmer`).
- **grammar_tone**: exactly one translated sentence, no commentary, no gloss
  inline (gloss goes in the englishGloss field). Never a single word.
- **lexicon_disambig**: newline list of `igala - english` pairs (48% multiline,
  28% dash-gloss): `agbulu-sack bag / ọyọmọyọ- small basin / akpẹ- tin cup`.
  Inline English glossing is normal and expected here.
- **register_honorifics**: the speech formula itself, 2-3 words (29%), or a full
  performed speech act (invitations run 20+ words). Occasionally formula +
  parenthetical gloss: `Ọla anẹ (is good evening)`.
- **idioms_metaphor**: proverb, then English explanation in the same answer
  (38% contain English), e.g. `ọwọ ki gwu ra ọ ñwi ejọ alo, translated as "he
who digs a hole will get beaten by a snake."`
- **cultural_values**: multi-sentence Igala prose, zero English, full gloss field.

**[deduced] Speakers refuse premises rather than force translations** (3 'no word
for hello' answers; `Uchu anẹ Igala chi ẹñwu ku ma jẹ i che ọfọfo` glossed 'yam
does not hold cultural importance... as it holds to the Igbo'). A faithful model
should be allowed to say a word does not exist.

12/884 answers embed English metalinguistic frames ("means", "translated as",
"There is no...") - mostly idioms (6) and lexicon (4). instructionIg is empty
except 1 row; it cannot support an Igala-instruction register yet.

---

## 5. Pronouns and particles in community sentences

Per-1,000-word rates, community (7.2k words) vs Bible (67k words):

| item                     | community | Bible | reading                                              |
| ------------------------ | --------- | ----- | ---------------------------------------------------- |
| `ki` relativizer         | 19.3      | 35.0  | both, community lower (shorter sentences)            |
| `ku` 'that/who'          | 6.6       | 20.2  | Bible-heavy                                          |
| `ma` 3pl 'they'          | 17.8      | 33.6  | both                                                 |
| `i` 3sg / neg host       | 11.3      | 29.6  | both                                                 |
| `kpai` 'and/with'        | 5.4       | 27.4  | Bible chains clauses with kpai; community juxtaposes |
| `lẹ` definite (dotted)   | 8.8       | 0.0   | Bible writes it `le` (28.5/1k)                       |
| `chi` copula (dotted)    | 7.7       | 1.4   | Bible prefers `che` (10.0/1k)                        |
| `na` 1sg volitive        | 10.1      | 0.4   | community-only frame (below)                         |
| `mi` 1sg possessive      | 11.6      | 4.0   | community personal register                          |
| `a` preverbal (prog/fut) | 13.9      | 1.7   | community writes it as its own word                  |

**[deduced] Postnominal definite `lẹ`:** 64 tokens; top bigrams `ọma lẹ` 25,
`ogijo lẹ` 4, `abimọtọ lẹ` 4, `alu lẹ` 3, `udama lẹ` 2. Same syntax as Bible
`amone le` / `ene le` / `ojo le` - the difference is purely orthographic (ẹ vs e).

**[deduced] 1sg polite-request frame `na tẹnẹ/tene + V` 'I would like to / I am
going to':** 19 occurrences across at least 4 annotators, the backbone of every
invitation/announcement answer: `Na tẹnẹ kẹ wa udama ọkọ kpai ọya enẹ` 'I am
inviting you to a wedding'; `na tẹnẹ ka ñwu mẹ ka ki ni...` 'I would like to
inform you that...'; `na tene kẹ wa efu ujọ mi`. Bible sample has no such frame.

**[deduced] Other 1sg forms:** possessive `mi` (84); subject `u` in fixed reply
`U ch'ọla fia (anya)` 'I am fine (thank you)' (2+); emphatic `omi` (9:
`k'omi lọ` 'that I went', `omì Ọma mẹ` 'I, your child'). Bare `un` 1sg is
essentially absent (1 token) - do not import it from scholarly sources into
community-style text. **[thin on u/omi distribution]**

**[deduced] 2pl / honorific plural `mẹ`:** 31 answers; greeting plurals
(`Mẹ agba ọ`, `Mẹ wọ'lalẹ` 'you all are welcome', `Mẹ wọla ọrọka chaka abomi
igala`) and object 'you (pl/respected)' (`Ugwa kì dugbo mẹ`, `á dù mẹ dọ wugbo`).

**[deduced] Serial imperative `V kẹ V` 'come and X':** `lia kẹ jẹñwu` 'come and
eat' (2), `lia kẹ bumi kpu ujẹñwu` 'come help me share food', `na tene kẹ wa`
frames (5+), `Ku do'mi wa kẹ mọ` 'let me bring water for you to drink'.

**[deduced] Tag copula `... ma che/chẹ` closing equational sentences about
people:** 5 answers, all 'the two women are sisters' or elder-definitions:
`Am'onobulẹ meji lẹ ch'ọmaye ma che`; `Ami ọnọbulẹ mẹji i chi ọmayẹ ma chẹ`.
**[conflicting]** the same prompt is also answered without the tag
(`Ámì èbòbùlẹ méjì lẹ chì ọmàyè`), so it is optional.

**[deduced] Negation is `i ... chẹ` / final `-n`/`ñ`, spelled attached or
hyphenated:** `i chẹ/i che` 9 answers (`ma jẹ i che ọfọfo`); final nasal:
`alo t'oko-n` (2), `Ma jẹñwu-n` (2), `ẹkì lọ t'ugbo lẹ ñ`, `i ch'imọtọ lẹ-n`,
`akprẹ'ñ`, `ìlì-n`. The Bible writes the same nasal as a detached ` n`
(534/3,000 verses, e.g. `komayewñ i che n`). Community habit = hyphen/apostrophe
or space+ñ; never the Bible's bare detached `n` after a cluster like `wñ`.

**[deduced] Plural marking:** community uses SPACED `amì/ami X` (21: `ami imọtọ`,
`ami ọnọbulẹ`) and `abọ X` (21: `abọ ọgijọ`, `abọ Igala`), plus fused `abimọtọ`
'the children' (4). Bible sample has zero spaced `ami X`; it fuses `amọ-`/`am-`
(740 + 43 per 67k) and uses undotted `abo` (339). Community also uses fused
`amọma`, `amọnẹ` (14) - **[conflicting]**, both spaced and fused are community-licit.

**[deduced] Reported speech:** community verb `ka (ñwu) X ka ki ni / kakini ...`
'tell X that...': split `ka ki ni` 6, fused `kakini` 4-5 - both live
(`Ma ka ñwu abimọtọ lẹ kakini ma m'ọjọ icholo lẹ du tọgba` vs
`Ma chẹ ka ñwi ami imọtọ ka ki ni ma mi ọjọ ichọlọ du tọ'gba`). Bible: fused only
(878 kakini). A community-faithful model may use either but should not always fuse.

---

## 6. Orthography: when tone actually appears

Baseline this slice: 198/884 answers carry at least one tone mark (22.4%);
706/884 (80%) use dotted vowels ẹ/ọ. Engma: `ñ` in 227 answers, digraph `ng` 47,
`n̄` once - `ñ` is the community engma.

**[deduced] Tone marking is annotator-driven, not language-driven.**
By annotator (toned/total): `...57mgy8` 122/173 (71%, the sole 'ankpa'-tagged
annotator), `...yvcg7y` 38/128 (30%), `...d372ty` 18/129 (14%), `...y3f5eb`
9/187 (5%), `...db6wv8` 5/81 (6%), `...scrlu6` 5/183 (3%). One writer produces
62% of all toned answers. Any 'community tone rate' target must stratify by
annotator or it just learns one person's habit.

**[deduced] Prompt compliance is weak:** prompts explicitly demanding
tone/diacritics get 64/197 toned (32%) vs 134/687 (20%) elsewhere. Even
'mark all tones' prompts are answered unmarked most of the time
(e.g. 'morning with correct diacritics' -> 10x plain `Ọdudu`, only `ódùdù`,
`Òdúdú` toned).

**[deduced] Tone is sprinkled, not saturated:** within toned answers only
41% of words (607/1,492) carry a mark. Marks cluster on:

- respect vocatives: `onàyì` 11/11 occurrences toned (categorical), `ogijo` 12/31
- disambiguating grammatical monosyllables: `kì` 36/140, `chì` 14/56, `ká` 13/69,
  `dù` 14/67, `mì` 19/84
- the single head word of a short answer (`Òkò` 'farm', `E gwù gwà`, `àgbá`)
  Bucket rates: orthography 35%, idioms 28%, grammar_tone 24%, register 18%,
  lexicon 15%.

**[deduced] Dots without tones is the default community register:** 80% dotted vs
22% toned. The community's unmarked style is 'dotted, untoned, apostrophized'.

---

## 7. Concrete divergences from Bible style (write like the community, not 1970 scripture)

1. **Vowel dots:** Bible sample 0/3,000 verses use ẹ/ọ; community 80%. Bible `le`,
   `ane`, `oma`, `che` = community `lẹ`, `anẹ`, `ọma`, `chẹ/chi`.
2. **Tone:** Bible 0%; community 22% (annotator-skewed). Never output the Bible's
   fully-bare style when a prompt asks for diacritics.
3. **Engma clusters:** Bible writes `ewñ`, `oñ`, `ñw`, `chowñ` (word-final -wñ);
   community writes `ẹñwu`, `ñwu`, `ñwa` as full syllables. Community never
   ends a word in `wñ`.
4. **Apostrophe elision:** community 29% of answers; Bible 0.
5. **Negation spelling:** Bible detached ` n` (534 verses); community `-n`,
   `'ñ`, or ` ñ` attached to the phrase.
6. **kakini:** Bible always fused (878); community splits `ka ki ni` slightly
   more often than it fuses (6 vs 5).
7. **kpai chains:** Bible 27.4/1k vs community 5.4/1k. Community strings short
   clauses by juxtaposition and comma, not kpai...kpai...kpai.
8. **Plural prefix:** Bible fused `amọ-`/`am-`; community prefers spaced
   `amì X` / `abọ X` (42 spaced vs 14 fused).
9. **Person register:** community text is 1st/2nd person interactive
   (`na tẹnẹ...`, `mi`, `mẹ`, vocatives Iye/Baba/Onàyì); Bible is 3rd-person
   narrative with `Jihofa` (668), `taku/tak` (1,540), `todu` (483), `kakini`
   quotatives - none of these narrative connectives are frequent in community answers.
10. **Sentence length:** community grammar answers average 7 words; Bible verses
    average ~22. Short is authentic.
11. **Bible-only lexicon to avoid in community voice:** `Jihofa`, `taku`, `tak`,
    `ewñ`, undotted `onobule`/`amone`. Community-only items a model should
    produce: `wọla`, `agba oo`, `abẹle`, `aidẹ`, `na tẹnẹ`, `ch'ugba t'ugba`,
    dotted `lẹ`/`chẹ`.

---

## 8. Register/dialect metadata caveats

- dialect field: 685/884 null; `ankpa` 91 (all one annotator, the heavy tone
  marker), `general_idah` 77 (three annotators), `other` 28, `ogugu` 2, `ibaji` 1.
  Dialect signal and annotator signal are confounded; treat 'Ankpa style = toned'
  as **[thin]**.
- Many prompts are duplicated across annotators (2-5 answers per prompt); the
  variant sets above (section 1, 3, 5) come from exactly these duplicates and
  are the best direct evidence of licensed variation.
- 7 cultural_values + 1 authenticity answers are too few to template beyond
  'multi-sentence Igala prose, no English'.

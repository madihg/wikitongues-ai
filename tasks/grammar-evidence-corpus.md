# Igala Grammar Evidence from the Parallel Corpus

Corpus grammarian report. Deduced from the 30,907 ParallelPair Bible verse pairs (BSN IGL70), 688,092 Igala tokens, 32,446 types. Methods: verse-level co-occurrence association (precision P(en|ig), recall P(ig|en), lift), positional/bigram statistics, and targeted regex checks over the full dump. Analysis scripts ran in the session scratchpad; nothing was written into `web/`. No ColdAuthorAnswer gold was read; this report uses only ParallelPair.

Verse references in brackets are the `ref` values in ParallelPair (source BSN IGL70). Labels used below:

- DEDUCED = derived from corpus counts here
- SCHOLARLY = from the curated LexEntry sources (chikhapo / Wiktionary / Koelle) or RagEntry (Ejeba), not independently confirmed by corpus counts
- CONFLICT = corpus evidence disagrees with a scholarly source

## 0. Orthography warning (affects everything below)

DEDUCED. This corpus uses a bare orthography that differs from standard Igala:

- No apostrophes at all (0 tokens contain ' or ’), so elision is written as fusion, not `m'omi`-style (see section 8).
- Almost no diacritics: ẹ/ọ appear 6 times total in 1.6M characters; no tone marks. The special letter ñ is heavily used (71,802 chars), including word-finally (ñw, ewñ, owñ, -wñ).
- The standard-orthography determiner **yí** never occurs: 0 tokens `yi`. Its corpus equivalent is postnominal `le` and `-i` (section 6).
- Tone-bearing distinctions (e.g. á future vs a 'we') surface as the same letter; segmentation is inconsistent (the future prefix is written solid with the verb, the narrative particle `la` is written separate).

Any model trained on this corpus learns THIS orthography, not the standard one. Mapping layer needed if outputs must match community spelling.

## 1. Basic word order

DEDUCED: **SVO, strongly head-initial.** Subject - (particle la / future a-) - Verb - Object - Dative(ñw/ñwu + NP) - obliques. Noun phrase: Noun + possessor / + adjective / + numeral / + determiner (everything follows the noun).

Counts:

- Anchor test with unambiguous subjects: `Ojo`/`Jihofa` (God/Jehovah) immediately followed by a known verb (kakini, ka, nyi, li, che, mu, la...) 1,558 times vs verb immediately before them 514 times, and the 514 are almost all datives ("ka ñwu Jihofa" = said to the LORD) or genitives ("unyi Jihofa" = house of the LORD), not VS order.
- Genitive N + possessor: `unyi + {Jihofa/Ojo/Israel/...}` 532 direct bigrams; "onu Jeriko" 'king of Jericho' [6139].
- Dative phrase after verb: 10,493 `ñw` + 4,262 `ñwu` tokens, essentially all post-verbal (never sentence-initial).

Examples:

- [0] "Ojo nyi efojale kpai aneile" = "God created the heavens and the earth" (S V O and O)
- [2] "Oñ Ojo kakini..." = "And God said..."
- [800] "Oñ i ka ñwu ma kakini..." = "He said to them..." (S V DAT-them QUOT)
- [111] "Set la dodo ogumelu..." = "Seth lived..." (S PART V)

Counter-note: equative clauses allow a predicate-first order with clause-final copula: [625] "Adu Ebraham omi che" = "I am Abraham's servant" (lit. servant-of-Abraham I be). Both orders attested for `che` (see 3.6).

## 2. Pronoun paradigm

DEDUCED (with per-cell evidence). Subject clitics precede the verb/TAM; object forms follow the verb (typically after dative ñw/ñwu); possessives are suffixes on the noun.

| person | subject                                              | object (after ñw/ñwu) | possessive suffix | independent/emphatic           |
| ------ | ---------------------------------------------------- | --------------------- | ----------------- | ------------------------------ |
| 1sg    | `n-` (fused, mostly future na-V); `omi (la)` in past | `mi`                  | `-mi`             | `omi`                          |
| 2sg    | `e` (variant `ke` in questions/subordinates)         | `e`; sometimes `u`    | `-we`             | `uwe`                          |
| 3sg    | `i`                                                  | `u`                   | `-wñ`             | `owñ` (uncertain)              |
| 1pl    | `a`                                                  | `a` / `wa`            | `-wa`             | `awa`                          |
| 2pl    | `me`                                                 | `me`                  | `-me`             | `ame`                          |
| 3pl    | `ma`                                                 | `ma`                  | `-ma`             | `ama` (also 'but' - homograph) |

Evidence per row (counts are verse co-occurrence with the English word):

- **1sg**: `mi` ↔ "me": co=1,831, P(en|ig)=0.82, lift 8.5 (strongest single association in the study). "ñwu mi" = 'to me' in 606/633 verses. `omi` ↔ "I": P(en|ig)=0.76, lift 4.0 ([751] "Omi de" = "Here I am"; [439] "Omi nyanyi no" = "I did not laugh"; [789] "omi la ma n" = "I did not know it"). Future 1sg is written fused: [333]/[335] "nadu ñw u" = "I will give to you", [537] "Nago abele" = "I will swear", [1582] "Namuna cho" = "I will turn aside", [629] "nalo" = "I shall go" - i.e. n + future a- + verb (see 3.2).
- **2sg**: `uwe` ↔ "you": P(en|ig)=0.93 (2,230/2,334 verses). `e`: 2,388/2,950 verses contain you/your; [64] "Ugbo e de" = "Where are you", [708] "e gbiti tuwa le" = "you are much mightier than we". `ke`: 2,285/2,754 you/your; typical in wh-questions: [85] "Ewñ chi ke wedo" = "Why are you angry", [1904] "Ewñ chi ke raku do mii" = "Why do you cry to me". "ñw e" = 'to you' in 762/800 verses. Possessive `-we`: owowe 'your hand' 62/93 verses match "your hand", Ojowe 345x.
- **3sg**: `i` ↔ "he": P(ig|en)=0.77 (5,533/7,198 he-verses contain i), lift 2.2; [548] "Oñ i kakini" = "And he said". Object `u`: bigram "ñw u" n=2,150 → him 1,478, her 264, you 773 (u also covers 2sg objects in some frames, e.g. [333]); after tak/oñ it is 'he/him' or 'you' ambiguous. Possessive `-wñ`: unyiwñ 'his house' (70/155 strict-phrase match), atawñ 'his father' 179/229, oduwñ 'his name' 165x.
- **1pl**: `a` ↔ "we": co=800, P(en|ig)=0.71, lift 16.8; [800] "A chemo" = "We know him", [799] "Abo Haran a che" = "We are from Haran", [6500] "omuwñ a anetiru" = "his voice we will obey". "ñw a" = 'to us' 276/323. `awa` ↔ we/us (lift 7.9/5.1). Possessive `-wa`: **Ojowa 'our God' 172/174 verses match "our god" (P=0.99)**, onduwa 'our Lord' 62/65, atawa/amatawa 'our father(s)'.
- **2pl**: `me` subject: 3,588/5,288 verses contain you/your; [799] "ugbo me kwo" = "where do you come from", [1089] "Me agba gbo" = "Hear (you-pl)". "ñwu me" = 'to you (pl)'. Possessive `-me`: **Ojome 'your God' 148/151 (P=0.98)**.
- **3pl**: `ma` ↔ "they": P(ig|en)=0.92 (4,556/4,968 they-verses contain ma), and ↔ them 0.81, their 0.76. Object: "ñwu ma" n=1,375 → them 1,073. Possessive `-ma`: [7422] "agba owoma" = "from their hand"; ema 'their...' lift 5.3.

CONFLICT: chikhapo lexicon glosses `ù` as 'I' and `omi` as 'water'. In this corpus `u` is an object pronoun 'him/her(/you)' - it associates with English "him" (P=0.40, lift 2.7), not with subject 'I' contexts except inside quotes - and `omi` is overwhelmingly 'I' (water sense survives in compounds: [9203] "ñmomi" = 'drank water' = ñmo + omi). chikhapo `mà` 'they' and `ì` 'he/she/it' agree with the corpus.

## 3. Tense / aspect / mood particles

### 3.1 Zero marking = perfective/simple past

DEDUCED. Bare subject+verb reads as past/perfective: [0] "Ojo nyi efojale" = "God created...", [2] "Oñ Ojo kakini" = "And God said". Past-English verses show no dedicated particle above baseline other than `la` (below).

### 3.2 Future/irrealis: prefix `a-` written solid on the verb

DEDUCED, the single most important hidden rule in this orthography. In verses whose English contains "will", the token right after a subject pronoun begins with `a-` 14.4% of the time (1,552/10,761 subject slots) vs 2.7% (698/25,432) in past-English verses - a 5.3x ratio.

- [5795] "Tak i akakini" = "Then he will say" (a+kakini)
- [5223] "Oñ i akije jokowe" = "And he will give grass"
- [3488] "oñ me aje kefu" = "and you will eat your fill"
- [14452] "ma la agbe dabene" = "they will wither like..." (la + a-V: narrative + future)
- 1sg: n + a + V: "nadu" 'I will give' [333], "nago" 'I will swear' [537], "nalo" 'I shall go' [629]

### 3.3 `la` = narrative/sequential particle (post-subject, tense-neutral)

DEDUCED. 12,829 tokens; never sentence-initial, never final. Immediately preceded by subjects: i la 2,472, ma la 1,924, ki la 1,312, me la 474, ke la 420, u la 418, omi la 208, uwe la 173. Followed by verbs. It appears in past narration ([3] "Ojo la fugane le li" = "God saw the light", [111] "Set la dodo" = "Seth lived") and combines with future a- ([13135] "ama la aka ñw e" = "they will tell you"), so it is a sequential 'then' marker, not a past tense per se.

### 3.4 `ki` = subjunctive/'should, let' + singular relativizer; `ku` = relativizer before ma/me

DEDUCED. `ki` (26,227) follows singular heads and subjects: ene ki 1,387 'person who', "e ki V ... n" prohibitive (see 5). `ku` (16,953) is followed by `ma`/`me` in 78% of its occurrences (13,247/16,900), while `ki` is followed by ma/me only 4.4% - a near-complementary distribution. Frames: "abo ku ma V" = 'those who V' (bigram abo ku n=1,212, English those/who in 805), "egba ku (ma)" = 'when' (521/632 verses match "when"), "ene ki" = who(ever) (791/1,179).

- [64] "one i la ka ñw u" vs [433] "Ugbo Sara oyawe de"
- [16173] "amadu Jihofa chaka kame dago" ('all you servants of the LORD who stand')
- [1089] "gbo ona ku nai" = "hear this dream that I have dreamed"

### 3.5 `kakini` = quotative 'said (that)', `ka` = 'say/tell'

DEDUCED. kakini 7,356 tokens, ka 6,894. Frame "S (la) ka ñw(u) RECIPIENT kakini DIRECT-SPEECH" is the standard speech report: [64], [475], [799], [800]. kakini associates with "said" and precedes quotes; ka associates with told/say/tell (lifts 4.5/2.8/3.4).

### 3.6 Copulas: `che` (equative/'do'), `de` (locative/presentational), `du` (see 12)

DEDUCED. `che` 5,538: equative "X (S) che" and 'do/make' (be-verses 2,780/4,794; do/make 1,983/4,794). Fuses with vowel-initial predicates: chOjo 'is God' 204x, [494] "chata abo Moab" = "is the father of the Moabites", [1923] "Jihofa chagbiti ogu" = "the LORD is a man of war", [751] "Uwe chomami Iso ochochi" = "Are you really my son Esau". Clause-final in [625] "Adu Ebraham omi che". `de` 3,762: locative/presentational 'be at/here': [64] "Ugbo e de" = "Where are you", [548]/[751] "Omi de" = "Here I am", [1603] "Okpa de" = "It is a staff"; fused def = de+ef 'is in' 708x ([433] "i def unyabo le" = "she is in the tent"). `de` also shows up in "thus says" formulas (thus 496, says 458, lifts 6.7/6.3).

### 3.7 `muda` = contrastive 'but (rather/shall)'

DEDUCED, function approximate. 2,442 tokens, post-subject slot (i muda 563); 2,052/2,363 verses contain but/not/no. [595] "e muda alo tanemi" = "but (you) will go to my country", [418] "U muda adalomi dago" = "But I will establish my covenant".

### 3.8 `ño` and `ge` = 'also/again(/anymore)'

DEDUCED. ño 2,019: also (lift 7.4), again (7.8). ge 2,276: no-longer (12.1), again (8.2), anymore (13.5), never (5.1); `ge` is the pre-negator item par excellence - "ge n" is the most frequent bigram ending a negative clause (682x): [195] "dabi wugbowñ ge n" = "did not return ... anymore".

## 4. Determiner system

DEDUCED:

- **`le` = postnominal definite determiner 'the'** (16,613 tokens; never sentence-initial). 88% of verses containing `le` contain English "the" (P(en|ig)=0.88). It follows nouns: amone le 456, ojo le 336, ene le 312, ane le 236. Examples: [59] "ejo le" = "the serpent", [3] "ugane le" = "the light", [335] "ane le" = "the land". `le` also closes relative clauses (Yoruba-tí...náà-like): [9594] "ku ma chubiyo le" = "in which they took refuge", [335] "ke lule gu ane le" = "(that) you walk through the land".
- **`-i` / postnominal `i` = proximal demonstrative 'this/these'**: aboi 'these (people)' 183/230 verses match "these" (P=0.80, lift 21.7); ewñi 'these things/this thing' (lift 13.6); [548] "ubi ewñi" = "after these things"; [526] "onobulei" = "the/this woman". Also on clause-level anaphors ([3551] "kewñi" = 'this').
- **`owñ`** (3,025) looks like 'the aforesaid one/he' (62% of its verses contain he/his/him/it) - uncertain.
- CONFLICT/GAP: standard determiner `yí` does not occur at all (0 tokens); `lẹ` appears only as bare `le`.

## 5. Negation

DEDUCED: **clause-final `n`**, optionally reinforced by `ge` ('anymore/at all'); prohibitive = subject + `ki` + verb ... `n`. There is no preverbal negator detectable.

Counts: `n` occurs in 4,938/5,325 (93%) of verses whose English contains "not", vs 643/8,000 (8%) of non-"not" verses; P(en|ig)=0.64, lift 3.7. Position: 35% of all `n` tokens are verse-final, and inside not-verses 4,744 occurrences are final or followed by a clause-starting conjunction vs 2,341 mid-clause (mid cases are ends of embedded negative clauses, since the corpus has no punctuation). `ge n` bigram: 682.

- [59] "I cheku me aku n" = "You will not surely die"
- [789] "omi la ma n" = "I did not know it"
- [3285] "Me ki rida tugbo ewñ ofofo le n" = "Do not turn to idols" (prohibitive: me ki ... n)
- [4150] "Me ki tegu nyomo n" = "Do not go up"; [14511] "e ki hi umi tinyo n" = "Do not forsake me"
- [195] "...dabi wugbowñ ge n" = "did not return to him anymore"

## 6. Plural marking

DEDUCED. Nouns are NOT inflected for plural. Plurality is carried by:

1. **Human plural prefix `am(a)-`**: oma 'child/son' (1,400 verses, 1,168 match sg child/son) → amoma 'children/sons' (1,208 verses, 691 match plural); one 'person/man' → amone 'people' (706/1,436 match "people"); adu 'servant' → amadu 'servants' (53/64). On proper names: amaJu 'the Jews' 151x, amaFarisi 'Pharisees' 44x. Examples: [237]-[257] "Amoma enekele Gomer/Ham/Shem..." = "The sons of Gomer/Ham/Shem...".
2. **`abo` = plural human collective / 'people of / those'** (5,742): abo Israel 649, abo + ethnonym (lifai 172, filistia 168, juda 73); "abo ku ma V" = 'those who V' (749/1,152 "those"-verses contain abo, lift 4.3).
3. **Numeral prefix `me-`**: meji 'two' (489 verses match "two"), meta 'three' (268), mele 'four', melu 'five', mefa 'six', mebie 'seven' (282), mejo 'eight', mela 'nine', megwa 'ten'. Numerals follow the noun: [7422] "akakala meji" = "two loaves", [224] "ama meta le" = "these three".
4. Pronoun/agreement: 3pl `ma`.

SCHOLARLY (not corpus-verifiable): Ejeba (2023, in RagEntry) describes a four-way concord system governed by NUMBER, including object-verb concord and a t-/r- initial-consonant alternation on modifying verbs. This corpus's orthography and my token-level methods could not confirm or refute the t-/r- alternation; do not claim it from data, cite Ejeba only.

## 7. The genitive linker e- (and the é- question)

DEDUCED. Before proper names, an `e-` prefix marks 'of': eOjo 'of God' 131, eIsrael 140, eJihofa 68, eJekob 32, eJuda 23; [224] "chamoma enekele eNoa" = "were the sons of Noah", [7594] "tunyi ewñ Gibea eSol" = "to his house in Gibeah of Saul". Ordinary noun-noun genitive is bare juxtaposition (unyi Jihofa). Whether this e- is the é- concord element of the standard orthography is NOT decidable from this corpus - flag as open.

## 8. Elision / fusion rules

DEDUCED, the corpus's most mechanical rule set. **When word1 ends in a vowel and word2 begins with a vowel, word1's final vowel drops; the orthography then writes the remaining consonant solid with word2** (no apostrophes exist; capitals of proper names are kept mid-token). 4,184 tokens (1,368 types) contain an internal capital, all of this type.

Quantified alternations (near-exceptionless):

| full form (before C)            | elided (before V)                                                                                         | counts                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `ñwu` + C (ñwu ma/mi/me/Jihofa) | `ñw` + V (ñw u/e/a/abo/Ojo)                                                                               | ñwu+C 4,224 vs ñwu+V 34; ñw+V 9,309 vs ñw+C 1,184    |
| `taku` + C (Taku Jihofa)        | `tak` + V (Tak i)                                                                                         | taku+C 2,835 vs taku+V 24; tak+V 6,872 vs tak+C 5    |
| `che` + C                       | `ch`+V solid: chOjo 204, chata, chomami, chagbiti                                                         | -                                                    |
| `ki/ku` + C                     | `k`+V solid: kOjo 289, kOndu 184, kIso [781], kAta 25                                                     | -                                                    |
| verb + `ef` 'in'                | def 708, tef 841, jef 620, lef 425, kwef 1,113, bef 96, chef 86                                           | [433] def unyabo, [1708] tef unyiwñ, [9819] jef unyi |
| `tV` 'to' + vowel noun          | tane 'to-land' 638, tugbo 'to-place' 208, tunyi 'to-house' 64 (+tunyiwñ 36)                               | [7594]                                               |
| `kV` 'to/for' + pronoun         | komi 'to me' 741, kuwe 'to you' 697, kabo 482, kame 475, kojo 446, kawa 110                               | -                                                    |
| verb + vowel noun               | fugane = fu+ugane [3], ñmomi = ñmo+omi 'drank water' [9203], jEbraham = je+Ebraham 'tested Abraham' [548] | -                                                    |

So the traditional `m'omi / j'uchu / t'oko` elisions exist here but are spelled momi/juchu-style solid, sometimes with an internal capital. Rule for generation in this orthography: drop V1, write solid, keep the name's capital.

## 9. Question formation

DEDUCED:

- **Wh-questions are cleft-like and use dedicated words, with no subject-verb inversion.**
  - why = `ewñ chi ke/ku...` (lit. 'thing chi you...'): `chi` P(ig|en "why")=0.83, lift 29.1; ewñ appears in 88% of why-verses. [85] "Ewñ chi ke wedo" = "Why are you angry", [1904] "Ewñ chi ke raku do mii" = "Why do you cry to me", [5986] "ewñ chi ke fejuwe ro bane mai ta" = "Why have you fallen on your face".
  - what = `ewñ` (+ le/de): recall 0.63 in what-verses; [1603] "Ewñ def owowe le" = "What is that in your hand".
  - where = `ugbo` (recall 0.82, lift 10.5): [64] "Ugbo e de" = "Where are you", [433] "Ugbo Sara oyawe de", [799] "ugbo me kwo" = "where do you come from".
  - when = `egba (ku)` 'time that' (P=0.67, R=0.57, lift 7.7): [126] etc.; how = `abu / ab-` forms (abile lift 37.4, abu 2.8; [781] "Abu kIso li ka" = 'when/as Esau saw'); who = `ene` ('person', lift 2.8), "uwe ene de" = "Who are you" [745].
- **Yes-no questions are string-identical to statements** (no particle found): [751] "Uwe chomami Iso ochochi" = "Are you really my son Esau", [800] "Ame chema Leban oma Nehor" = "Do you know Laban the son of Nahor". Open finding: yes-no English questions end in Igala `n` 148/460 = 32% vs 12% baseline - most look like negative-rhetorical questions, but an interrogative use of final `n` cannot be excluded.
- `ta` (1,029) associates with why/what/how (lifts 4.3/2.7/3.3) but its dominant senses are 'still/yet' (still 13.3, yet 7.2) and the verb 'sell' (25.3); NOT established as a question particle.

## 10. Prepositions and conjunctions

DEDUCED, with verse-match rates:

- `ef` 'in(side)' - 2,768/4,071 verses match "in" (P=0.68, lift 2.3); "ef unyi Jihofa" 'in the house of the LORD' [15424]; fuses as def/tef/jef/kwef (sec. 8). Related noun `efu` 'belly/inside' (SCHOLARLY chikhapo éfù 'belly').
- `kpai` 'and/with' (NP-level) - 5,840/6,222 match and/with (94%); [0] "efojale kpai aneile" 'the heavens and the earth'. Contrast **`oñ` = clausal 'and (then)'** - 8,258/9,391 match and/then; 29% sentence-initial; oñ i 3,434, oñ ma 1,844 ('and he/they').
- `ñw / ñwu` 'to/for' (dative, post-verbal) - see sections 1-2.
- `te` 'from/away/off' - depart 8.7, away 3.8, from-matches 1,224/2,585; [708] "Kwo buwa te" = "Go away from us".
- `tV-` 'to(ward)' fused (tane/tugbo/tunyi) and `kV-` 'to/for' fused (komi/kuwe/kabo/kame) - counts in sec. 8.
- `teju` 'over the surface/face of' (from eju 'face/eye'): [1] "teju omi" = "over the face of the deep"; `eju` 'before/in the sight of': [9594] "eju Jihofa" = "in the sight of the LORD".
- `alu ku/ki` 'according to (the word of)' - alu ('mouth/voice') has "according" lift 8.3, commanded 5.0.
- Conjunctions: `todu` 'because/for' 4,345/5,104 (85%); `todule` 'therefore' (todu+le); `ichewñ (ku)` 'if' 704/753 (93%); `chai` 'but/only/except' 518/567 (91%); `ama` 'but' 885/1,819 (49%; homograph with ama 'they' - SCHOLARLY chikhapo àmà 'they'); `tak(u/i)` 'then/so' (54% sentence-initial); `abu ki/ku` 'as/when/how' (931 + 735 bigrams).

## 11. Top 60 Igala tokens (case-folded) with best-guess functions

Confidence: H = verified with counts above; M = association evidence; L = guess.

| #   | token  | count  | function                                                                             |
| --- | ------ | ------ | ------------------------------------------------------------------------------------ |
| 1   | ma     | 29,689 | 3pl 'they/them/their' (H); also verb 'know' in "omi la ma n" (L)                     |
| 2   | ki     | 26,227 | relativizer/subjunctive 'who/that/should' after sg heads (H)                         |
| 3   | ku     | 16,953 | relativizer before ma/me; 'that/those-who/when' (H); verb 'die' (SCHOLARLY chikhapo) |
| 4   | le     | 16,613 | postnominal 'the'; relative-clause closer (H)                                        |
| 5   | i      | 16,340 | 3sg subject 'he/she/it' (H); postnominal 'this' (H)                                  |
| 6   | la     | 12,829 | narrative/sequential particle after subject (H)                                      |
| 7   | oñ     | 11,063 | clausal 'and (then)' (H)                                                             |
| 8   | du     | 10,854 | quantifier 'every/any/whatever' in "N du ki" (M); verb 'give/put/hand over' (M)      |
| 9   | n      | 10,583 | clause-final negator (H); 1sg 'I' fused in na-V (H)                                  |
| 10  | ñw     | 10,493 | dative 'to/for' before vowels (H)                                                    |
| 11  | kpai   | 10,277 | NP 'and/with' (H)                                                                    |
| 12  | me     | 8,956  | 2pl 'you' subj/obj/poss -me (H); numeral prefix me- (H)                              |
| 13  | kakini | 7,356  | quotative 'said (that)' (H)                                                          |
| 14  | ewñ    | 7,216  | 'thing/what' (H)                                                                     |
| 15  | ka     | 6,894  | 'say/tell' (H)                                                                       |
| 16  | tak    | 6,877  | 'then/so' before vowels (H)                                                          |
| 17  | jihofa | 6,640  | Jehovah/the LORD (H)                                                                 |
| 18  | todu   | 5,764  | 'because/for' (H)                                                                    |
| 19  | abo    | 5,742  | plural human 'people of/those' (H)                                                   |
| 20  | che    | 5,538  | copula 'be'; 'do/make' (H)                                                           |
| 21  | u      | 5,218  | 3sg object 'him/her', sometimes 2sg object (H)                                       |
| 22  | ef     | 4,751  | 'in(side)' (H)                                                                       |
| 23  | ene    | 4,317  | 'person; who(ever)' (H)                                                              |
| 24  | ñwu    | 4,262  | dative 'to/for' before consonants (H)                                                |
| 25  | ojo    | 4,176  | 'God' (H)                                                                            |
| 26  | ko     | 4,152  | naming/putting light verb: "do X ko Y" 'call X Y'; took/gave/brought (M)             |
| 27  | e      | 3,817  | 2sg 'you' subject/object (H)                                                         |
| 28  | de     | 3,762  | locative copula 'be at/here'; 'thus (says)' (H/M)                                    |
| 29  | wa     | 3,715  | 'come/bring/offer' (M); 1pl object 'us' bound (buwa, tuwa) (M)                       |
| 30  | ke     | 3,702  | 2sg subject variant (questions/subordinate) (H)                                      |
| 31  | owñ    | 3,025  | 3sg emphatic / 'the aforesaid' (M-L)                                                 |
| 32  | uwe    | 2,961  | 2sg independent 'you' (H)                                                            |
| 33  | te     | 2,861  | 'from/away/off' (M)                                                                  |
| 34  | taku   | 2,859  | 'then/so' before consonants (H)                                                      |
| 35  | omi    | 2,853  | 1sg independent 'I' (H); 'water' in compounds (H)                                    |
| 36  | alu    | 2,816  | 'mouth/voice; according to' (M)                                                      |
| 37  | ugbo   | 2,701  | 'place; where' (H)                                                                   |
| 38  | mi     | 2,671  | 1sg object/possessive 'me/my' (H)                                                    |
| 39  | abu    | 2,615  | 'how/as/when' (M)                                                                    |
| 40  | je     | 2,604  | 'eat' (H); "je ñw" 'let/allow' ([1649] "Je ñw a lo" = "Let us go") (M)               |
| 41  | egba   | 2,445  | 'time; when' (H)                                                                     |
| 42  | muda   | 2,442  | contrastive 'but rather/shall' (M)                                                   |
| 43  | israel | 2,355  | Israel (H)                                                                           |
| 44  | chaka  | 2,305  | 'all/every/whole' 1,673/2,071 (H)                                                    |
| 45  | ge     | 2,276  | 'anymore/again/at all' esp. in negatives (H)                                         |
| 46  | unyi   | 2,269  | 'house' (H)                                                                          |
| 47  | ane    | 2,243  | 'land/earth' (H)                                                                     |
| 48  | onu    | 2,202  | 'king' (H); SCHOLARLY also ònú 'how many'                                            |
| 49  | ño     | 2,019  | 'also/again' (M)                                                                     |
| 50  | ola    | 2,004  | 'word/matter/precept' (M)                                                            |
| 51  | ama    | 1,967  | 'but'; also 3pl emphatic 'they' (M, homograph)                                       |
| 52  | go     | 1,957  | 'behold/look' 1,244/1,807 (H)                                                        |
| 53  | jo     | 1,807  | 'burn; gather; be enough' (M, polysemous)                                            |
| 54  | oma    | 1,787  | 'child/son' (H)                                                                      |
| 55  | ne     | 1,774  | 'own/possess; drive out' (M)                                                         |
| 56  | li     | 1,754  | 'see/find' (saw lift 16.5) (H)                                                       |
| 57  | mu     | 1,708  | 'take/seize' (M)                                                                     |
| 58  | owo    | 1,613  | 'hand' (H)                                                                           |
| 59  | amone  | 1,568  | 'people' (am-+one) (H)                                                               |
| 60  | kpa    | 1,538  | 'kill; finish' (kill lift 18-20) (H)                                                 |

Runners-up worth knowing: abele 1,537 'like this/so' (L); a 1,521 1pl 'we' (H); kwane 865 'rise/arise' (H); lewa 1,255 'come/arrive' (M); lewatu 271 'after/it came to pass' (M); dago 856 'stand' (H); gbo 880 'hear/obey' (H); gba 839 'receive/deliver' (M); kpe 589 'send' (H); ewo 849 'city' (H); iko 584 'time/era/book' (M); onobule 675 'woman/daughter' (H); odo 557 'year' (H); efojale 278 'heaven(s)' (H); ede 146 'throne/sit' (M); dufu 1,220 'bring/drive out' (M); chewñ 1,088 'offering/possession' (L); ache 1,123 'deed(s)' - looks like nominalization a+che (L).

## 12. Counter-examples, conflicts, and open questions

1. **`u`**: chikhapo says ù='I'; corpus says object 'him/her(/you)'. Unresolved three ways - treat corpus function as authoritative for this orthography.
2. **`du` polysemy**: quantifier 'every/any' ("ene du ki" 'anyone who', every/none lifts ~3) vs verb 'give/put' ("nadu ñw u" 'I will give you', [4971] "mowñ du te ñw a" 'gave him over to us'). Likely two homographs; do not collapse.
3. **`ñw ma` (425) and `ñw mi` (418)** violate the ñw-before-vowel rule (11% leakage). Possibly a distinct item or inconsistent spelling; the ñwu-before-vowel direction is near-exceptionless (34 cases).
4. **`la` is not simply past**: it co-occurs with future a-V (e.g. [13135]); calling it "past tense" in teaching material would be wrong. Sequential 'then' fits all attested uses.
5. **Progressive and perfect**: no dedicated marker found. English have/has/had-verses show no token above lift ~1.4 except `go` 'behold' (35%, an artifact of "Behold, I have..."). Either zero-marked or carried by something this method cannot see.
6. **Yes-no final `n`** at 32% vs 12% baseline - negative-rhetorical reading likely, interrogative particle possible. Needs native judgment.
7. **Ejeba's concord (t-/r- alternation, object-verb concord)**: SCHOLARLY only; not verifiable at token level in this orthography. Igala verbs may covary with number in ways invisible here.
8. **`ke`**: could be ki+e fusion ('that you') rather than an independent 2sg form; both stories fit "ewñ chi ke V" and "ke la V".
9. All of this describes Bible-translation register in one non-standard orthography; community writing (ColdAuthorAnswer prompts use ẹ/ọ/tones) will need the orthography mapping noted in section 0.

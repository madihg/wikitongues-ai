# Igala Working Grammar - Deduced and Defensible (v1, 2026-08-13)

The grammar of Igala as THIS project can defend it: one plain rule per phenomenon, a grade, and the evidence with counts. Synthesized from the four evidence reports; nothing here rests on holdout data.

**Inputs (read in full):**

- `tasks/grammar-evidence-corpus.md` - ParallelPair Bible corpus (30,907 verse pairs, 688,092 Igala tokens; co-occurrence, positional and regex statistics)
- `tasks/grammar-evidence-community.md` - ColdAuthorAnswer train split only (884 answers, isHoldout=false)
- `tasks/grammar-evidence-corrections.md` - 728 train-split PairwiseComparison explanations + 1 train OutputEdit + Agnes live test 2026-08-11 (the 206 holdout comparisons were excluded at source)
- `tasks/grammar-evidence-scholarship.md` - Ejeba 2023 (paraphrased, CC BY-NC 4.0), Adeniyi 2017, Omachonu 2012, plus that agent's own corpus verification runs

**Holdout hygiene:** all four inputs restricted themselves to the train split; no isHoldout=true gold was read anywhere in this chain. The frozen benchmark remains unseen.

**Grading key.** Three source classes: CORPUS (Bible ParallelPair), COMMUNITY (usage answers + native corrections + Agnes live test - three independent channels inside one class), SCHOLARSHIP (Ejeba / Adeniyi / Omachonu / lexicon references).

- **A** = all three classes agree, with counts on each leg
- **B** = two classes agree
- **C** = one class only (named: corpus-only / community-only / scholarly-only)
- **X** = sources conflict; both sides stated
- **[thin]** = a leg has fewer than 3 independent attestations

Ranking caveat used in section 12: register phenomena (greetings, honorifics) can only surface in community data - the Bible has no greetings and the accessible papers do not cover them - so a C there means "single possible source", not "weak evidence".

---

## 1. Word order

**R1.1 - Igala is SVO: Subject - (particle) - Verb - Object - dative - obliques.** Grade **A**.

- CORPUS: unambiguous-subject anchor test (`Ojo`/`Jihofa` + known verb): 1,558 SV vs 514 VS-lookalikes, and the 514 are nearly all datives ("ka ñwu Jihofa" said to the LORD) or genitives ("unyi Jihofa" house of the LORD), not real VS. Datives strictly post-verbal: ñw 10,493 + ñwu 4,262 tokens, never sentence-initial. Examples: [0] "Ojo nyi efojale kpai aneile" (God created the heavens and the earth); [800] "Oñ i ka ñwu ma kakini..." (He said to them...); [111] "Set la dodo..." (Seth lived).
- COMMUNITY: all ~30 full-sentence native corrections are SVO: "Mà jẹñwu ǹ" (they are not eating), "Ọma lẹ ájẹñwu" (the child is eating), "Iye mi kpai ọmaye mi onobulẹ á lọ ta'ja" (my mother and sister are going to market).
- SCHOLARSHIP: example sentences are SVO ("òdùdè là ògèdè" the bat bought banana; "ạ́ngẹ́jē kpạ́ ọ́nụ́" the tortoise killed the thief, Adeniyi); Ejeba's clause frame #NP-(NP)(-(NP))# is head-initial.

**R1.2 - Inside the noun phrase everything follows the noun, in the order N + possessor / N + numeral + determiner.** Grade **A**.

- CORPUS: genitive by juxtaposition: unyi + name 532 bigrams ("onu Jeriko" king of Jericho [6139]); N + numeral: "akakala meji" two loaves [7422]; N + numeral + determiner: "ama meta le" these three [224]; N + det: amone le 456, ojo le 336.
- COMMUNITY: 25/25 attested numerals are postnominal ("Ẹkwu ọjọ mẹta" die in three days); "Am'onobulẹ meji lẹ" (the two women) shows N + NUM + DET; possessives postnominal ("Iye mi" my mother, "eju wẹ" your eyes).
- SCHOLARSHIP: Omachonu's attributive numerals are postnominal in every corpus check; Ejeba's plural NPs are N-final ("àmì ìmọtọ" the children).

**R1.3 - Equative clauses allow a predicate-first order closed by the copula (X S che), alongside plain S-che-X.** Grade **B** (corpus + community).

- CORPUS: [625] "Adu Ebraham omi che" (Abraham's servant I am); plain order "Jihofa chagbiti ogu" [1923].
- COMMUNITY: tag-copula closings "Am'onobulẹ meji lẹ ch'ọmaye ma che" (the two women are sisters), "...ọmayẹ ma chẹ" (5 answers); the same prompt also answered without the tag - the tag is optional, both orders licit.

---

## 2. Tense - aspect - mood particles

**R2.1 - The bare verb (zero marking) is perfective / simple past.** Grade **B** (corpus + community; Ejeba 2016's TAM chapter is paywalled).

- CORPUS: [0] "Ojo nyi efojale" (God created...), [2] "Oñ Ojo kakini" (And God said); no dedicated past particle found above baseline.
- COMMUNITY: "I kọla ka" (she said one word), "k'omi lọ" (that I went), "Ichẹñwu k'omi lọ" (if it rains / rained-frame).

**R2.2 - A preverbal á (Bible orthography: fused a- on the verb; community: its own word á/à) marks incomplete action - future AND progressive alike; this is one marker, not two.** Grade **B** (corpus + community; strongest hidden rule of the Bible orthography).

- CORPUS (future reading): in "will"-verses the post-subject token begins a- 14.4% (1,552/10,761 slots) vs 2.7% (698/25,432) in past verses - a 5.3x ratio. [5795] "Tak i akakini" (then he will say); 1sg fuses n+a+V: "nadu" I will give [333], "nalo" I shall go [629].
- COMMUNITY (progressive reading, 5+ corrections): "Ọma lẹ ájẹñwu / Ọmà lẹ à jẹñwù" (the child IS eating), "Ògìjò à gwì àmì ìmọtọ" (the elder is greeting the children), "á lọ ta'ja" (are going to market); future too: "a'alo t'oko-ñ" (we will not go to the farm), "Ẹne kì luchẹ d'ogba á mí" (whoever finishes first will rest). Community writes it separate: preverbal a at 13.9/1k words vs 1.7/1k in the Bible sample.
- Synthesis: the corpus agent called it "future", the correctors used it for progressive; both distributions fit a single incompletive (irrealis/imperfective) marker. Teach it as such.

**R2.3 - la after the subject is a narrative-sequential particle ('then...'), NOT a past tense.** Grade **C** (corpus-only; Bible-register flavored).

- CORPUS: 12,829 tokens, never sentence-initial or final; i la 2,472, ma la 1,924; appears in past narration ([3] "Ojo la fugane le li") AND with future a- ([13135] "ama la aka ñw e" they will tell you), so it is tense-neutral sequencing.
- COMMUNITY: essentially absent from community answers - a Bible-narrative device (see section 13).

**R2.4 - kì/ki after a subject is subjunctive 'should/let'; with a final nasal it forms the prohibitive (S + kì + V ... n).** Grade **B** (corpus + community). See R7.2.

**R2.5 - Completive 'has finished V-ing' is V + kpá + mé/mẹ.** Grade **C** (community-only, 3 attestations) [thin].

- COMMUNITY corrections: "Oñwù ujẹñwu jẹkpá mé" / "Ì fùjẹñwù jẹ kpà mẹ" (he has finished eating, gram_024 x2); completive sense in "I ku'kọla ka" (lex_027).
- CORPUS: explicitly found no perfect marker; its verse-level method is blind to verb-final compounds, so this is a gap, not a conflict (corpus kpa 'kill/finish' 1,538 tokens is consistent).

**R2.6 - Copulas divide: chi/chẹ/che = equative 'be' (also 'do/make'), de = locative/presentational 'be at / here is'.** Grade **B** (corpus + community).

- CORPUS: che 5,538 ("Uwe chomami Iso ochochi" are you really my son Esau [751]); de 3,762 ("Ugbo e de" where are you [64]; "Omi de" here I am [548]; def = de+ef 'is in' 708x).
- COMMUNITY: equative chi/chẹ ("U ch'ọla fia" I am fine; "chi ẹñwu ku..." is a thing that...); de in clefts: "Ógìjò dè i, í chí ímọtọ ǹ" (it is the elder, not the child). Spelling splits by register: Bible che, community chi/chẹ (see section 13).

**R2.7 - muda after the subject is contrastive 'but (rather)'.** Grade **B** [thin community leg].

- CORPUS: 2,442 tokens, post-subject; 2,052/2,363 verses contain but/not/no; [418] "U muda adalomi dago".
- COMMUNITY: "Iye ẹwẹdọ'n u muda neke chen" (mother, do not be offended, but I cannot, reg_032).

**R2.8 - The polite volitive frame na tẹnẹ/tene + V = 'I would like to / I am going to' is the backbone of invitations and announcements.** Grade **C** (community-only; 19 occurrences, 4+ annotators, plus the one train OutputEdit).

- "Na tẹnẹ kẹ wa udama ọkọ kpai ọya enẹ" (I am inviting you to a wedding); "na tẹnẹ ka ñwu mẹ ka ki ni..." (I would like to inform you that...); OutputEdit correction opens "Agba abọ ọgijọ, na tẹne gbọkọ bumẹ ka ki ni...". Absent from the Bible sample.

**R2.9 - Serial verb constructions are real and productive; imperatives chain as V kẹ V ('come and eat').** Grade **B** (community + scholarship).

- COMMUNITY: "lia kẹ jẹñwu" come and eat (2), "lia kẹ bumi kpu ujẹñwu" come help me share food, "Ku do'mi wa kẹ mọ" let me bring water for you to drink; register pair "Ọma la kẹ jẹñwu" (to a child).
- SCHOLARSHIP: Ejeba's concord operates inside serial/splitting complex predicates (after Bamgbose's Yoruba model); Lydia's rubric names serial verbs a documented feature.

**R2.10 - ño = 'also/again'; ge = 'anymore/at all', the pre-negator reinforcer.** Grade **C** (corpus-only). ge n is the most frequent negative-clause ending bigram (682x); [195] "dabi wugbowñ ge n" (did not return anymore).

---

## 3. Pronouns

**R3.1 - The merged paradigm (Bible orthography / community orthography):** Grade per cell below; the table as a system is **B-to-A**.

| person | independent                    | subject clitic                                                          | object clitic          | possessive    |
| ------ | ------------------------------ | ----------------------------------------------------------------------- | ---------------------- | ------------- |
| 1sg    | omi / òmi (A)                  | u (community + Ejeba); Bible instead: omi la, or n(a)- fused future (B) | mi (A)                 | mi / -mi (A)  |
| 2sg    | uwe / ùwẹ (B)                  | e / ẹ (A); ke variant in questions (C, corpus)                          | e / ẹ, sometimes u (B) | -we / wẹ (B)  |
| 3sg    | owñ / ònwu / Oñwù (B)          | i (A)                                                                   | u (harmonic u/o/ọ) (B) | -wñ / -wn (B) |
| 1pl    | awa / àwa (B)                  | a (A)                                                                   | wa / a (B)             | -wa / wa (B)  |
| 2pl    | ame / àmẹ (B)                  | me / mẹ (A)                                                             | me / mẹ (A)            | -me / mẹ (B)  |
| 3pl    | ama / àma (B; homograph 'but') | ma (A)                                                                  | ma (A)                 | -ma / ma (B)  |

Key evidence:

- 1sg mi <-> "me": co-occurrence 1,831, P(en|ig)=0.82, lift 8.5 - the strongest association in the whole corpus study; community mi 84 tokens.
- 3pl ma <-> "they": P(ig|en)=0.92 (4,556/4,968 they-verses); community "Mà jẹñwu ǹ"; Ejeba ma.
- 1pl a <-> "we": co=800, lift 16.8; corrections "a'alo t'oko-ñ" (we will not go); Ejeba a.
- Possessive suffixes: Ojowa 'our God' matches "our god" in 172/174 verses (P=0.99); Ojome 'your(pl) God' 148/151 (P=0.98); atawñ 'his father' 179/229; corrections "ugbo-wn" (his farm), "eju wẹ" (your eyes). Ejeba's genitive table (his Table 6) was lost to PDF extraction - re-derive manually; until then possessives are corpus+community B.
- 2pl me: 3,588/5,288 verses match you/your; community 31 answers; imperative [1089] "Me agba gbo" (hear, you-pl).

**R3.2 - RESOLVED former conflict: u is BOTH the 1sg subject clitic and the 3sg object clitic; preverbal position = 'I', postverbal = 'him/her'.** Grade **B** (community + scholarship for 1sg; corpus + scholarship for 3sg).

- The corpus report flagged chikhapo's ù 'I' as a conflict because Bible u is overwhelmingly the object 'him/her' ("ñw u" n=2,150, him 1,478). But Ejeba's Table 5 lists u as 1SG SUBJECT clitic AND U (archiphoneme u/o/ọ by vowel harmony) as 3SG OBJECT clitic - both cells exist.
- COMMUNITY attests the 1sg subject cell the Bible narrative rarely shows: "U ch'ọla fia (anya)" I am fine (thank you) (2+), "u muda neke chen" I cannot (reg_032).
- Model-facing rule: never gloss preverbal u as 'him'; never use postverbal u as 'I'.
- Related: bare "un" for 'I' is essentially absent from community data (1 token) - do not import it from scholarly sources into community-style text.

**R3.3 - 2pl mẹ doubles as the respectful address form for elders and groups.** Grade **C** (community-only, but two channels: 31 usage answers + 6 correction attestations). "Mẹ'gba chaka" (you all, well done), "Mẹ wọ'lalẹ" (you all are welcome), "á dù mẹ dọ wugbo" (you-respected). See R9.3.

---

## 4. Determiners

**R4.1 - lẹ (Bible spelling le) is the postnominal definite determiner 'the'.** Grade **B** (corpus + community; the accessible papers do not treat determiners).

- CORPUS: 16,613 tokens, never sentence-initial; 88% of le-verses contain English "the"; amone le 456, ojo le 336, ene le 312, ane le 236; [59] "ejo le" the serpent.
- COMMUNITY: 64 dotted-lẹ tokens; ọma lẹ 25, ogijo lẹ 4, abimọtọ lẹ 4; corrections "Ọma lẹ ájẹñwu", "Ogijo lẹ, k'ọla ọgba", "Ichọlọ-lẹ". Same syntax, dotted spelling.

**R4.2 - lẹ/le also closes relative clauses, bracketing them (HEAD kì/ku ... lé).** Grade **B**.

- CORPUS: [9594] "ku ma chubiyo le" (in which they took refuge), [335] "ke lule gu ane le".
- COMMUNITY correction: "ẹnẹkẹlẹ kì l'uché ká nyì ugbo-wn lé, lẹkwu" (the man whose farm we visited has died, gram_030).

**R4.3 - Postnominal -i / -ì is the proximal 'this/these' (and a lengthened definite on numerals).** Grade **B** [thin community leg].

- CORPUS: aboi 'these people' matches "these" in 183/230 verses (P=0.80, lift 21.7); ewñi 'this thing/these things' (lift 13.6); [548] "ubi ewñi" after these things.
- COMMUNITY: "Mẹ wola ìko-ì" (good day at this hour), "mẹji-ì" / "Abo obulẹ mẹjì-ì" (the two).

**R4.4 - X: the standard-orthography determiner yí never occurs in any of our data.** Grade **X** (standard/scholarly convention vs all usage data).

- Side 1: standard Igala orthography (lexicon references) has determiner yí. Side 2: 0 tokens in 30,907 verses; unreported in 884 community answers, which use lẹ instead. Until a native confirms where yí lives (dialect? register?), generate lẹ and never yí.

---

## 5. Numerals and concord

**R5.1 - Attributive cardinals follow the noun and take the mé- prefix (N + mé-NUM); bare stems (èjì, ẹ̀tā...) are citation/counting forms.** Grade **A**.

- CORPUS: meji in 489 "two"-verses, meta 268, mebie 282, megwa 242; "akakala meji" two loaves [7422], "ojo mebie" seven days [163].
- COMMUNITY: 25/25 me- tokens postnominal: "Ẹkwu ọjọ mẹta" (3), market paradigm "uchubu umomi me ji, agbulu me'ta, akpẹ mẹ'fa, oyomoyo mẹ'lẹ" in one answer.
- SCHOLARSHIP: Omachonu's own compound tables use the mɛ́- forms attributively; bare forms are the count list.

**R5.2 - 'One' is bare postnominal (o)kà - no mé-.** Grade **B**, citation form **X**.

- CORPUS: "oñ oka kwo bumi te" one left me [1352], "okawñ" one of them; COMMUNITY [thin]: "I kọla ka" she said one word, "ukọla ẹyọ ka" (2). SCHOLARSHIP: Omachonu ókà.
- X on the citation form: Omachonu ínyẹ́ / ókà; Wiktionary òókáà; Koelle ī́nye. The kà root is common ground; also note the debunked seed "Okpa = 1" (okpa is 'staff': [1603] "Okpa de" it is a staff).

**R5.3 - Ordinals are ẹkẹ- + bare stem; 'first' is suppletive ejodudu.** Grade **B** (corpus + community; not in the three papers).

- CORPUS: "ochu ekebie" seventh month [187], "ojo ekegwebie" seventeenth day, "ochu ekegwa" tenth month [188], "ojo ejodudu" first day [188].
- COMMUNITY: "ọjọ ẹkẹgwẹlẹ" 14th day (2), "ọchu ẹkẹlu" (2), "ọchu ẹkẹta" third month, "ọjọ ẹkẹbiẹ".

**R5.4 - The number system is vigesimal (base-20, base-10 substructure), strictly additive/multiplicative - Igala NEVER subtracts (unlike Yoruba).** Grade **B** (corpus + scholarship; community has no large numbers).

- Confirmed at every corpus-testable point of Omachonu's paradigm: ogu 20 (80 rows with "twenty"); ogbo meji 40 = 20x2 (134 rows, "ojo ogbo meji" forty days); oje 50, an underived opaque form (64 rows); additive linker nyoke (394 rows: "chogbo meta nyoke megwa" = 20x3+10 = 70 [1413]); etegwa 70 blend attested 58 rows ALONGSIDE its own transparent source in the same corpus; ogumelu 100 = 20x5 (43 rows); icham nyogwoko 1000 = 800+200 (404 rows: "ajifa icham nyogwoko" a thousand pieces of silver [511]).

**R5.5 - Noun plurality: àma-/àbó- prefixes for humans/animates; full reduplication for large spatial entities; zero marking for other inanimates - and NEVER àma- on ordinary inanimates.** Grade **A** (the showpiece agreement).

- SCHOLARSHIP: Ejeba's Tables 2-4 with the animacy hierarchy Human > Animate > Non-animate.
- CORPUS: amoma 'children' 1,208 rows; abo 4,623 rows / 5,742 tokens ("abo Israel" 649); productive beyond humans: amakachi, amole 'goats', aminyakulumi 'camels'; reduplication robustly attested: "uwo uwo" mountains 155 rows, "aji aji" rivers 41, "ohimini ohimini" 20.
- COMMUNITY: the same morpheme in living orthography, 5 independent versions of one prompt: "Am'onobulẹ meji", "Ami ọnọbulẹ mẹji", "Ámì èbòbùlẹ méjì", "Abo obulẹ mẹjì-ì"; spaced "ami imọtọ", "abọ ọgijọ" (21 + 21 answers).
- Spelling split, both licit in community: spaced amì X / abọ X (42) vs fused amọma/amọnẹ (14); the Bible fuses only. Surface variants Am'/Ami/Ámì = elision of the prefix vowel before vowel-initial nouns, not a different morpheme.
- Animacy trap: a model that outputs àma-ólí 'trees' produces a diagnostic Yoruba-flavored error the corpus never makes; mountains = úwó úwó, never àma-úwó.

**R5.6 - Number concord runs through the verb system: transitive verbs agree with their OBJECT via suppletive pairs (du 'take/carry SG' vs kó 'PL'), and the modifying verb agrees with the main verb, carried by a t-/r- initial alternation (tínyọ̀ SG vs rínyọ̀ PL 'away').** Grade **B** (scholarship + corpus; invisible to community data so far).

- SCHOLARSHIP: Ejeba 2023's four concord types; du/kó, té/jọ, tó/rú/nyú, tínyọ̀/rínyọ̀; mismatches (du rínyọ̀) ungrammatical; his own footnote: tínyọ̀/rínyọ̀ is the only clean t-/r- pair.
- CORPUS verification: du...wa 'bring' 137 rows vs ko...wa 77 rows with the right number semantics ("e mu du nyumi..." bring HIM back [1289] vs "ko kwomo wa ñwu mi" bring me TWO young goats [736]); tinyo 356 rows (singular referents: "daduremi tinyo" forgive my sin [1794]) vs rinyo 761 rows (plural/multiplex: "fana rinyo pele pele" torn to pieces [1116]).
- Caveats: gwùgwú 'sit.SG', Ejeba's parade example, scores 0 hits in 30,907 verses (register or Dekina-variety item); mass-noun concord (mass nouns count as plural) is scholarly-only, grade **C**.

---

## 6. Elision

**R6.1 - At every vowel#vowel word junction, the first vowel drops; the community writes the junction with an apostrophe, the Bible writes the remnant solid (fused, no apostrophe).** Grade **A** (process); surface convention is register-conditioned, not free.

- CORPUS: 0 apostrophes in 1.6M characters; 4,184 tokens (1,368 types) carry an internal capital from fusion (chOjo 'is God' 204, kOjo 289, jEbraham 'tested Abraham'); allomorphy near-exceptionless: ñwu before C 4,224 vs ñwu before V only 34; ñw before V 9,309; taku+C 2,835 vs taku+V 24, tak+V 6,872 vs tak+C 5; fused prepositions def/tef/jef/kwef (708/841/620/1,113), tane 638, komi 741, kuwe 697.
- COMMUNITY: 256/884 answers (29%) contain an apostrophized contraction, 0/3,000 Bible verses do: aj'ẹñwu 9, w'ọla 8, k'ọla 6, k'omi 5, t'oko 2, wa'ja - the same hosts (chi, ka/ku/ki, tọ/lọ, amì, ọla) before vowel-initial nouns. Full and contracted forms coexist for the same phrase, from the same annotators ("wọla ulẹ" ~ "W'ọla ulẹ" ~ "Wọla'ulẹ") - treat contraction as licensed variation and never "correct" one to the other.
- CORRECTIONS/Agnes: real Igala words own their vowel skeleton - model "Onokotu" corrected to nokotu ("the ONO is not supposed to be there for you to make sense"); annotators' own corrections freely elide (wọla'ulẹ, che'gbatu'gba, ta'ja, Dù mẹ́).
- SCHOLARSHIP: vowel elision is a named grammatical process in numeral derivation (ẹ̀gwá+ọ̀kà -> ẹ̀gwákà; Omachonu); Adeniyi's misrepresentation set is entirely elision-driven (ọ́gwụ́+ẹ̀gwạ́ -> ógwé ꜜgwá '30').
- Open leak: "ñw ma" (425) and "ñw mi" (418) violate the ñw-before-vowel rule (11% leakage) - distinct item or spelling noise; the ñwu-before-vowel direction is near-exceptionless.

---

## 7. Negation

**R7.1 - Negation is a clause-final nasal (n / ǹ / ń / -n / ñ); there is no preverbal negator - and a final nasal must NEVER be appended for any other reason.** Grade **B** (corpus + community, three community channels; the accessible papers do not treat negation). Highest native-noticeability rule in the set.

- CORPUS: n occurs in 4,938/5,325 (93%) of "not"-verses vs 8% elsewhere (lift 3.7); position final or clause-edge; [59] "I cheku me aku n" (you will not surely die); [789] "omi la ma n" (I did not know it); reinforcer "ge n" 682x.
- CORRECTIONS (6+ full sentences): "Mà jẹñwu ǹ" / "Mà jẹnwu nóò" (they are not eating); "Ẹ lò tọmọ ń" / "ẹkì lọ t'ugbo lẹ ñ" (do not go there); "Ichẹñwu k'omi lọ, a'alo t'oko-ñ" (if it rains we will not go to the farm); "Ógìjò dè i, í chí ímọtọ ǹ" (it is the elder, not the child).
- AGNES (live, 2026-08-11): model wrote "Ojọ"+n decoratively; she read it as a DIFFERENT sentence - with the nasal it means "God didn't say / is not saying". The nasal is a morpheme, not a letter.
- COMMUNITY usage: final nasal written attached: "alo t'oko-n" (2), "Ma jẹñwu-n" (2), "akprẹ'ñ", "ìlì-n"; the Bible writes the same nasal as detached " n" (534/3,000 sampled verses). Never output the Bible's bare detached n after a cluster in community register (see section 13).

**R7.2 - The prohibitive is subject + kì + V ... n ('do not V').** Grade **B**.

- CORPUS: [3285] "Me ki rida tugbo ewñ ofofo le n" (do not turn to idols); [4150] "Me ki tegu nyomo n"; [14511] "e ki hi umi tinyo n" (do not forsake me).
- CORRECTIONS: "ẹkì lọ t'ugbo lẹ ñ" (do not go there, gram_026).

**R7.3 - Negated equatives use chi/che inside the nasal frame: i chí X (lẹ) ǹ 'it is not X'.** Grade **B**.

- COMMUNITY: i chẹ/i che in 9 answers ("ma jẹ i che ọfọfo"); corrections "í chí ímọtọ ǹ", "i ch'imọtọ lẹ-n".
- CORPUS: same frame with detached n ("komayewñ i che n").

---

## 8. Orthography and tone

**R8.1 - Our data carries three orthography layers, and a model must know which it is writing: (a) Bible = bare ASCII+ñ (no dots, no tone), (b) community default = dotted vowels, sparse tone, apostrophized elision, (c) reference = fully marked.** Grade **A** (each layer is measured in its own source).

- Bible: 3 of 30,907 rows contain ANY diacritic; ẹ/ọ 6 occurrences in 1.6M chars; ñ heavy (71,802 chars) including word-final -wñ.
- Community: 706/884 answers (80%) dotted; 198/884 (22.4%) carry any tone mark; 29% apostrophized.
- Reference/scholarship: acute = High, grave = Low, Mid unmarked (Ejeba, Adeniyi convention).
- Training or scoring that mixes the layers unnormalized teaches that ẹ/e alternate freely. Score dotted vowels separately from tone marks (Lydia's rubric already separates the axes).

**R8.2 - Igala has three level tones (H/M/L) with contour formation and downstep; dots (ẹ/ọ) and tone marks change word identity.** System: grade **C** (scholarly-only for the inventory); meaning-bearing status: grade **B** (scholarship + community corrections).

- SCHOLARSHIP: minimal triple rẹ́ 'close' / re 'pick' / rè 'make a drum'; L falls after H, H rises after L; 7 vowels /i e ẹ a ọ o u/; ñ = /ŋ/, ny = /ɲ/, nw = /ŋʷ/, ch = /tʃ/, j = /dʒ/.
- CORRECTIONS (minimal pairs natives volunteered): kọ́ 'build' vs kọ̀ 'refuse' (orth_029); Ọ̀kọ̀ 'aeroplane' vs Ọ́kọ́ 'money' (orth_029); oko 'farm' vs ọkọ 'money' - dot changes meaning (orth_028); ochu 'month' vs 'moon' (reg_021, lex_011). Agnes: undotted oko out of context can be money / canoe / millipede / husband - context and diacritics are essential.
- **X within this rule:** the MEMBERS of the homograph sets are firmly attested (3+ sources each) but the exact tone/dot assignment per meaning conflicts across annotators (farm = oko vs ọkọ vs òkò in three different rows). Enshrine "homographs need dots or disambiguating context"; do NOT enshrine a specific diacritic mapping without adjudication.

**R8.3 - In practice tone is barely written, and even careful writing systematically hides downstepped High as Mid.** Grade **A** (scholar's admission + corpus 0% + community 22%).

- Ejeba via Adeniyi: "tone is virtually not marked at all" in practice. Community tone is annotator-driven, not language-driven: one annotator produces 62% of all toned answers (122/173 of hers toned vs 3-6% for others); even explicit 'mark the tones' prompts get 32% compliance (64/197); within toned answers only 41% of words carry a mark, clustering on respect vocatives (onàyì 11/11 - categorical) and grammatical monosyllables (kì, chì, ká, dù, mì).
- Downstep: DSH is uncontested; whether M and L also downstep is a live scholarly dispute (Adeniyi yes, DSH+DSM+DSL with pitch tracks; Ejeba 2009 DSH only) - **X**, record both. Practical corollary (Adeniyi): orthographic Mid is sometimes phonetic downstepped High, so treat unmarked tone as UNKNOWN, not Mid, in any TTS/ASR/eval pipeline.

**R8.4 - The engma is written ñ in community practice; community never ends a word in the Bible's -wñ cluster, writing full syllables (ẹñwu, ñwu) or -wn instead.** Grade **B** (community + corpus contrast; scholarship endorses ñ = /ŋ/).

- Community: ñ in 227 answers vs digraph ng 47, n̄ once. Corrections attest -wn nasal spelling: "Ẹwn, Efuwn, chẹwn" (orth_031), "ugbo-wn".
- X (scholarly registry): consonant inventory disputed 23 (Omachonu) / 24 (Mason & Nordman) / 25 (Miachi & Armstrong, the approved orthography) / 28 (Ejeba, adding 5 palatalized). Cite Ejeba's 28 as reference, note the range.

---

## 9. Greetings and register

**R9.1 - There is no word for 'hello'; the general hail is Agba (oo/ooo) and peer-casual aidẹ/Abẹle; greetings are formulaic, not translated.** Grade **C** (community-only - the Bible and the papers contain no greetings; two community channels agree).

- 3 answers explicitly say there is no translation for hello; others give "Ágbà oo" / "aidẹ" as the functional hail (community-internal conflict resolved as: no exact equivalent, Agba fills the slot). agba: 60 tokens in usage; corrections give hello = "àgbá / Ágbà oo" (orth_039). A faithful model must be allowed to say a word does not exist - speakers refuse premises rather than force translations.

**R9.2 - The productive greeting frame is (w)ọla + time/place noun, with three licit surface shapes: wọla X, ọla X, contracted ọl'X / w'ọla X.** Grade **C** (community-only; 52+ attestations across the two channels - the best-attested single construction in community data).

- Slot fillers: ọdudu morning (8+), ọrọka afternoon (4), anẹ evening (5), ulẹ welcome-home (7: "wọla ulẹ / Wọla'ulẹ / Ọla'ulẹ"), ukọlọ well-done-at-work ("wola ukọlọ / Wọla'kọlọ" x4); day-part lexicon: ọdudu, iyaja (midday), ọrọka, anẹ, ọdu (night), inajọ (dawn).
- CORRECTIONS: models failed exactly here, repeatedly - welcome corrected x5 (orth_017, reg_005), well-done x4 (reg_011, reg_016), morning greeting rows reg_001/004/010; goodbye = "Ch'ugba t'ugba" family (5).

**R9.3 - Politeness is built with kin/status vocatives around the formula plus the plural honorific mẹ/abọ - NOT with special verb morphology; the same message changes form by addressee.** Grade **C** (community-only; 20+ correction attestations; register_honorifics is the second-largest substantive correction bucket, 178 train comparisons).

- Vocatives: Iye 'mother' ("Iye ọlanẹ" x2; "Iye ọlodudu" said kneeling, reg_001), Ata/Atai 'father/sir' ("Atai ọrọka"), Onàyì 'elder' ("Onàyì òrọka"), Baba, Mama; elders as a body: "Agba (oo) abọ ọgijọ" (reg_031/033); the Attah's court has its own lexicon: "Gabaìdu", "Anu Achadu ọkọ attah", "Mẹ gw'onu ebije" all hail the iron king (reg_017, reg_030).
- Addressee-sensitivity pairs: 'be careful' to a child "Ọma na che yẹ" vs to an elder "Atai ẹ na che yẹ yẹ" (reduplicated for respect, reg_022); 'come and eat' child "Ọma la kẹ jẹñwu" vs father "Baba u'jẹñwu wẹ dẹ'i" (reg_015); refusal to peer "Omaye U'chen" vs to mother "Iye ẹwẹdọ'n u muda neke chen" (reg_032).
- The one train OutputEdit is the template: "Agba abọ ọgijọ, na tẹne gbọkọ bumẹ ka ki ni ujẹju dẹ weeki eyi..." - honorific vocative + humble na tẹne frame + free English loan "weeki". Pragmatic loanwords are acceptable to natives; fabricated Igala-looking words are not.
- Reply to greeting: "Agba nago", "Nẹago, Ọma mì, àgbá" (thank-you register: anya x4; nago inside polite requests) [thin on the anya/awa/nago division].

---

## 10. Clause joining and questions (supporting subsystem)

**R10.1 - kì/ki is the relativizer/subordinator for singular heads; ku appears before the plural clitics ma/me - a near-complementary split.** Grade **B**.

- CORPUS: ku is followed by ma/me in 78% of 16,900 occurrences, ki only 4.4%; frames "ene ki V" whoever (791/1,179), "abo ku ma V" those who (1,212 bigrams), "egba ku" when (521/632).
- COMMUNITY: kì corrections x6 ("UJẹñwu kì ìye mì hì árìyo" the food that my mother cooked is sweet; "ẹnẹkẹlẹ kì l'uché ká nyì ugbo-wn lé" the man whose farm we visited; "Ẹne kì luchẹ d'ogba á mí" whoever finishes first will rest; "Ọma kì chanẹ chì ogìjo"); ku before ma in usage ("ẹñwu ku ma jẹ i che ọfọfo").

**R10.2 - NP-coordination is kpai 'and/with' (never Yoruba àti); clause-level 'and (then)' is oñ, and community style prefers juxtaposition over particle chains.** Grade **B**.

- CORPUS: kpai 5,840/6,222 verses match and/with (94%), [0] "efojale kpai aneile"; oñ 8,258/9,391 and/then, 29% sentence-initial.
- COMMUNITY: corrections use kpai/kpaì 5x ("Iye mi kpai ọmaye mi onobulẹ"; "Ọjọ kpaì ọya" husband and wife) while rejecting Yoruba àti in the same rows; community rate 5.4/1k vs Bible 27.4/1k - short juxtaposed clauses are the community norm.

**R10.3 - 'Because' is tọdu/todu; 'if' is ichẹñwu (ku); 'then/so' is tak(u/i) (Bible-flavored).** Grade **B** for tọdu (corpus 85% match, 4,345/5,104 + corrections x3 "tọdu/atodu/tódù"); **B** for ichẹñwu (corpus 704/753 = 93% + correction "Ichẹñwu k'omi lọ..."); taku/tak **C** corpus-only and register-marked.

**R10.4 - Reported speech: S ka ñwu RECIPIENT + ka kini / kakini + quote; community licenses both split and fused spellings.** Grade **B**.

- CORPUS: kakini 7,356 + ka 6,894, always fused; frame at [64], [475], [799], [800].
- COMMUNITY: split "ka ki ni" 6 vs fused "kakini" 4-5 - both live ("Ma ka ñwu abimọtọ lẹ kakini..." vs "...ka ñwi ami imọtọ ka ki ni..."); corrections gram_032 x2 use ká kíní. A community-faithful model may use either but should not always fuse.

**R10.5 - Wh-questions use dedicated in-situ/cleft words with NO inversion (ewñ chi 'why', ewñ 'what', ugbo 'where', ene 'who', egba ku 'when', abu 'how'); yes-no questions are string-identical to statements.** Grade **C** (corpus-only; community thin: "A'idẹ ke" how far, "Ugbo..." frames).

- CORPUS: chi P(ig|en "why")=0.83, lift 29.1 ("Ewñ chi ke wedo" why are you angry [85]); ugbo recall 0.82 ("Ugbo e de" where are you [64]); "uwe ene de" who are you [745]; yes-no: [751] "Uwe chomami Iso ochochi" are you really my son Esau - no particle. Open: yes-no English questions end in Igala n 32% vs 12% baseline - negative-rhetorical reading likely, interrogative n not excluded; needs native judgment.

**R10.6 - One sentence carries one proposition; clauses combine ONLY through real connectives (kì, kpai, oñ, tọdu, ká kíní); connective-free clause salad is unsalvageable, not fixable by word swaps.** Grade **C** (Agnes + correction patterns) - but it is the gate every generated sentence must pass.

- Agnes on a model sentence: it "is saying three different things here entirely"; a third sentence was too broken to correct - she asked for the English source to restart from scratch.

---

## 11. Conflicts and open questions registry

True conflicts (X - adjudicate before enshrining):

1. Homograph diacritics: farm/money/canoe (oko vs ọkọ vs òkò; Ọ́kọ́ vs ọkọ) - three schemes across annotators (R8.2).
2. borrow/lend: "borrow Emẹ / lend Dù mẹ́" vs "borrow e bi / lend e mẹ" (lex_030).
3. Cardinal directions: two fully disjoint sets (lex_028); both annotators agree the model outputs were fabricated.
4. please: kocho (x3) vs nago (x1) - possibly register-conditioned (nago appears inside polite requests).
5. Lexical variant sets: chief Onuh vs A'jọfẹ; chicken ajuwẹ/ajirẹ/ajìhe; midday iyaja vs òrọka; tomorrow/yesterday assignment of ọnẹ/ọna/ọnalẹ; cook hì vs e'yi; welcome wọla'ulẹ vs ọlàlẹ.
6. 'one' citation form: ínyẹ́ vs ókà vs òókáà (R5.2).
7. Consonant inventory: 23/24/25/28 (R8.4).
8. Downstep scope: DSH-only vs DSH+DSM+DSL (R8.3).
9. Determiner yí: standard orthography vs zero attestation in all our data (R4.4).
10. Market-week days Ẹkẹ/Ẹdẹ/Afor/Ukwọ: consistently given by annotators (x3) but identical to the Igbo market week - flag for the linguistics lead as areal borrowing vs contamination.

Resolved by synthesis: u = 1sg subject AND 3sg object (R3.2); "future a-" and "progressive á" = one incompletive marker (R2.2); Am'/Ami/àma- = one plural morpheme under elision (R5.5); kakini fused vs split = licensed variation (R10.4).

Open (needs data or native judgment): ke = independent 2sg variant or ki+e fusion; yes-no final n; ñw ma/mi leakage (R6.1); Ejeba's genitive pronoun table (lost to PDF extraction - one manual read of p. 92 recovers it); gwùgwú 'sit.SG' zero corpus hits; perfect/progressive marking invisible to verse-level methods beyond R2.2/R2.5; Ejeba 2016 A Grammar of Igala still paywalled (TAM, case, clitics chapters wanted).

---

## 12. The 15 rules most worth telling a model

Ranking = native-noticeability (5 = meaning-destroying or socially loud per the corrections record; 1 = subtle) x evidence grade (A > B > C), with the section-9 caveat that greeting/honorific rules cannot have corpus or scholarly legs. Word-order-type rules rank below the gates because models that fail the gates never even expose word-order errors (grammar tag: 6 uses vs not_igala + wrong_word: 106).

1. **(5xA) Lexicon gate: every content word must be attested Igala** - no Yoruba (blocklist: àti, láti, tí, jọ̀ọ́, oúnjẹ, Ọlọ́run, orúkọ, ìdílé, bùkún, ọ̀rọ̀, tàbí, fún, ènìyàn...), no invented Igala-looking forms, no proper names as vocabulary (Obadu). Evidence: 926/934 comparisons both_inadequate; not_igala 53 + wrong_language 4 tags; ~150 corrective glosses. Pragmatic English loans are acceptable ("weeki"); fabrications are not.
2. **(5xB) Negation is a clause-final nasal (ǹ/-n/ñ), and a final nasal may NEVER appear for any other reason** - decorative n turns "God" into "God didn't say" (Agnes). Corpus: 93% of not-verses. Prohibitive = S + kì + V ... n.
3. **(5xA) Respect the vowel skeleton: elide V1 at vowel-vowel junctions (community: apostrophe; Bible: solid fusion) and never add or strip word-initial vowels** (nokotu, not Onokotu). Corpus allomorphy near-exceptionless (ñwu/ñw 4,224:34); community 29% of answers apostrophized.
4. **(5xB) Homographs require dots/tone or disambiguating context** (oko family = farm/money/canoe/husband; ochu = moon/month; kọ́ build vs kọ̀ refuse) - but do not trust any single diacritic mapping; annotators conflict (X).
5. **(5xC) Address by register: kin/title vocative first (Iye, Ata/Atai, Baba, Onàyì, Agba abọ ọgijọ, Gabaìdu) + honorific plural mẹ/abọ, and reshape the sentence by addressee** - politeness is vocative + plural, never verb morphology. 20+ corrections; the second-largest correction bucket.
6. **(5xC) Greet with the (w)ọla + time/place frame (wọla ọdudu / ọrọka / anẹ / ulẹ / ukọlọ), hail with Agba (oo), and know there is NO word for hello** - saying a word does not exist is correct Igala behavior.
7. **(4xA) Community register default: dotted vowels (ẹ/ọ), little or no tone marking, apostrophized elision, short sentences (~7 words), first/second person** - never the Bible's bare-ASCII scripture style outside scripture (see section 13).
8. **(4xA) SVO with everything after the noun: N + possessor, N + numeral, N + determiner (N NUM DET when stacked); datives after the verb.**
9. **(4xA) Pluralize by animacy: àma-/àbó- (community: spaced amì/abọ) for humans and animates ONLY; large spatial nouns reduplicate (úwó úwó mountains); other inanimates take zero** - àma- on a tree or mountain is a diagnostic non-Igala error.
10. **(4xB) The definite article is postnominal lẹ (ọma lẹ 'the child') and also closes relative clauses; the standard-orthography yí appears in NO usage data - generate lẹ.**
11. **(4xB) Preverbal á = incompletive (progressive AND future); bare verb = completed** (Ọma lẹ ájẹñwu 'the child is eating'; a'alo...ñ 'we will not go'); completive 'finished' = V kpá mé [thin].
12. **(4xB) Relativize with kì after singular heads and ku before the plural clitics ma/me** (78% vs 4.4% complementarity; UJẹñwu kì ìye mì hì árìyo).
13. **(4xB) Join with real connectives - kpai for NPs (never Yoruba àti), oñ or juxtaposition for clauses, tọdu 'because', ká kíní/kakini 'that' (both spellings licit) - one proposition per clause; connective-free clause salad is unsalvageable (Agnes).**
14. **(3xA) Numerals follow the noun with mé- (ọjọ mẹta 'three days'); 'one' is bare (o)kà; ordinals take ẹkẹ- ('first' = ejodudu); the system is vigesimal and never subtracts (70 = etegwa = 20x3+10; 1000 = icham nyogwoko = 800+200).**
15. **(3xB) Verb number concord: singular-object du vs plural-object kó 'take/bring'; modifying verb agrees via t-/r- (tínyọ̀ sg vs rínyọ̀ pl 'away')** - corpus-verified 356/761 rows; binary and easy to grade, uniquely Igala.

---

## 13. Register warning: Bible corpus vs community voice

The two native data sources are ONE language in TWO registers/orthographies. A model trained naively on ParallelPair will write 1970s scripture. Divergences, each backed by counts:

| feature          | Bible (IGL70, 30,907 verses)                                       | Community (884 train answers)                                                      | instruction to model                               |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| vowel dots ẹ/ọ   | absent (3 rows with any diacritic)                                 | 80% of answers                                                                     | dot by default in community voice                  |
| tone marks       | 0%                                                                 | 22%, annotator-driven, sprinkled (41% of words within toned answers)               | sparse tone is authentic; saturate only on request |
| elision          | solid fusion, no apostrophes (0 in 1.6M chars)                     | apostrophe at the junction (29% of answers)                                        | apostrophize in community voice                    |
| engma            | word-final clusters -wñ (ewñ, chowñ)                               | full syllables ẹñwu/ñwu or -wn; never final -wñ                                    | never end a community word in wñ                   |
| negator spelling | detached " n" (534/3,000 verses)                                   | attached -n / 'ñ / ñ                                                               | attach the nasal in community voice                |
| 'that' quotative | kakini fused only (878 in sample)                                  | split ka ki ni 6 vs fused 4-5                                                      | either, do not always fuse                         |
| clause chaining  | kpai chains, 27.4/1k                                               | juxtaposition + comma, kpai 5.4/1k                                                 | short clauses, no kpai...kpai chains               |
| plural prefix    | fused amọ-/am-                                                     | spaced amì X / abọ X preferred (42 vs 14 fused)                                    | space it in community voice                        |
| person/genre     | 3rd-person narrative: Jihofa 668, taku/tak 1,540, la, todu, kakini | 1st/2nd interactive: na tẹnẹ, mi, mẹ, vocatives Iye/Baba/Onàyì                     | interactive register for community prompts         |
| sentence length  | ~22 words/verse                                                    | ~7 words (grammar answers)                                                         | short is authentic                                 |
| copula spelling  | che                                                                | chi/chẹ                                                                            | community spelling in community voice              |
| lexicon          | Bible-only: Jihofa, taku/tak, ewñ, undotted onobule/amone          | community-only: wọla, agba oo, abẹle, aidẹ, na tẹnẹ, ch'ugba t'ugba, dotted lẹ/chẹ | pick the register's lexicon                        |

Cross-cutting cautions: (1) any model trained on ParallelPair learns THAT orthography - a mapping layer is required before its output can match community spelling; (2) mixing the three orthography layers unnormalized teaches that ẹ/e alternate freely - normalize or tag by layer; (3) treat unmarked tone as UNKNOWN, not Mid (downstepped High is systematically written as Mid even by careful writers); (4) tone-marking targets must stratify by annotator or they learn one person's habit (one annotator = 62% of all toned answers); (5) dialect metadata is confounded with annotator identity (ankpa = 91 rows = 1 annotator) - "Ankpa style = toned" is thin.

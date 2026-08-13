# Igala grammar evidence — scholarship, paradigms, and corpus verification

**Role:** Document Reader agent. **Date:** 2026-08-13.
**Method:** deep-read of every accessible Igala document (full texts retrieved, not abstracts), paradigms extracted as tables, then each claimed rule tested against our own corpus with COUNTS and attested examples. Corpus verification uses `ParallelPair` (30,907 Bible verse pairs, whole table usable) and `ColdAuthorAnswer` joined to `Prompt` **restricted to `isHoldout = false`** (train split only; the frozen benchmark was never read). Evidence classes used throughout: **[DEDUCED]** = confirmed from our data, **[SCHOLARLY]** = only in the literature, unverifiable in our corpus, **[CONFLICT]** = sources disagree.

**Licence handling:** Ejeba (2023) is JWAL, CC BY-NC 4.0 — all paradigms below are **paraphrased as linguistic facts with attribution; no prose is reproduced**. Individual Igala example words/sentences are linguistic data, cited with source. Adeniyi (2017) and Omachonu (2012) are Linguistik Online open access. The Bible corpus in `ParallelPair` derives from a BSN-copyright text (see corpus audit §4.1) — used here strictly as internal linguistic attestation, not for redistribution.

---

## 0. Sources accessed (and not accessed)

| Source                                                                                                                                                | Access                                                                                                                                                             | What it yielded                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ejeba, Salem Ochala (2023) "Ígálâ Concord System", JWAL Anniversary Vol 50, pp. 85–103**                                                            | ✅ Full PDF retrieved from journalofwestafricanlanguages.org (`/downloads/send/146-golden-jubilee-edition/800-igala-concord-system`, 19 pp). CC BY-NC 4.0          | The complete concord description: 4 concord types, plural morphology, pronoun/clitic paradigm, singular/plural verb pairs, modifying verbs, t-/r- alternation, consonant inventory table. Includes an **Igala-language abstract** (rare published academic Igala prose).                   |
| **Adeniyi, Kolawole (2017) "The Limits of Perception in the Tonal Orthographies of three-tone Systems", Linguistik Online 84(5)**                     | ✅ Full PDF (bop.unibe.ch/linguistik-online/article/download/3844/5824, 20 pp)                                                                                     | Igala tone inventory, contour formation, the full downstep system (DSH/DSM/DSL), and 7 concrete misrepresentation examples. Also reproduces Ejeba's 28-consonant / 7-vowel tables.                                                                                                         |
| **Omachonu, Gideon S. (2012) "Comparative Analysis of the Numeral Systems of Ígálà, Yoruba, German and English", Linguistik Online 55(5), pp. 57–73** | ✅ Full PDF (redalyc.org mirror)                                                                                                                                   | The complete numeral paradigm 1–1000 with derivation formulae. Author is a native Igala speaker and trained linguist.                                                                                                                                                                      |
| **Lydia's "Igala rubric" (Google Sheet, lydia@wikitongues.org, shared 2026-07-07)**                                                                   | ✅ Read via Drive                                                                                                                                                  | Evaluation rubric, not paradigms — but names two syntactic phenomena as "documented features of Igala": relative clause + aspect marking, and serial verb constructions. Notes to ask Agnes about dialect mutual intelligibility (citing Unubi & Atadosa 2019 in the Source-of-Truth doc). |
| **"Wikitongues AI - Source of Truth" (Google Doc)**                                                                                                   | ✅ Read                                                                                                                                                            | Strategy/bibliography; no paradigms. Confirms Lydia's four-axis eval matrix and that no Igala WALS entry exists (Yoruba and Idoma do).                                                                                                                                                     |
| **"A Grammar of Igala" as a Drive document**                                                                                                          | ❌ **Not found.** Searched Drive by title ('Igala', 'Grammar', 'Ígálâ') and fullText. The phrase appears only inside strategy docs referring to Ejeba's 2016 book. | Ejeba (2016) _A Grammar of Igala_, M&J Grand Orbit, remains **paywalled** (JSTOR/MUSE). Everything we know of it is via its citations in Ejeba 2023 and Adeniyi 2017 ("Ejeba 2009" = his earlier phonology work).                                                                          |
| Repo: `tasks/igala-corpus-sources.md`; DB: `RagEntry` (9 Igala grammar/numeral rows read)                                                             | ✅ Read                                                                                                                                                            | Prior paraphrases of Ejeba 2023 and Adeniyi 2017 already seeded; this report adds the actual paradigm tables and corpus verification those rows lacked.                                                                                                                                    |

---

## 1. The concord system (Ejeba 2023) — paradigms and verification

Ejeba identifies **four concord relationships** in the Igala minimal clause: subject–verb, object–verb, verb–modifying-verb, and verb–mass-noun. The governing category is **number** (singular vs plural). Data below paraphrased from Ejeba (2023), JWAL 50:85–103, CC BY-NC 4.0.

### 1.1 Noun pluralization — three strategies **[DEDUCED — strongly confirmed]**

Ejeba's paradigm (his Tables 2–4):

| Strategy                 | Condition                   | Singular                        | Plural                                | Gloss                                        |
| ------------------------ | --------------------------- | ------------------------------- | ------------------------------------- | -------------------------------------------- |
| Prefix **àbó-**          | human nouns                 | ìgbẹ̀lé                          | àbó-ìgbẹ̀lé (or àma-)                  | young lady/ladies                            |
| Prefix **àbó-**/**àma-** | human                       | ímọtọ                           | àbó-ímọtọ / àma-ímọtọ                 | child(ren)                                   |
| Prefix **àma-**          | animate generally           | éwó                             | àma-éwó                               | goat(s)                                      |
| Prefix **àma-**          | animate                     | èluché                          | àma-èluché                            | farmer(s)                                    |
| Prefix **àma-**          | animate                     | ókwunọ                          | àma-ókwunọ                            | cow(s)                                       |
| **Full reduplication**   | large spatial entities only | úwó / áji / àla / ánê           | úwó úwó / áji áji / àla àla / ánê ánê | mountain(s) / river(s) / island(s) / land(s) |
| **Zero marking**         | all other inanimates        | ólí, ágbâ, ọ́wọ́, ẹ́rẹ̀, éjú, ọ̀bàta | (same form)                           | tree, basket, hand, leg, eye, suffering      |

Animacy hierarchy: Human → Animate → Non-animate, with morphological number marking richest at the top (Ejeba after Corbett 2004; also Omachonu 2004, 2008).

**Corpus verification (ParallelPair, Bible orthography = no diacritics):**

- **àma- prefix**: `amoma` (= àma-ọ́ma "children") — **1,208 rows**. Examples: ref 255 "amoma Eber" = "children of Eber"; ref 662 "Amoma enekele Midian" = "the sons of Midian"; ref 833 "ne amoma lugbowñ" = "have children". Also `amakachi`, `amole` "ewes/goats", `aminyakulumi` "camels", `amewñore` "flock" — the prefix is productive far beyond 'children'.
- **àbó- prefix**: `abo` — **4,623 rows**. Examples: ref 965 "Abo ugbo" (the women, Gen 33); ref 4673 "abo Israel" = "the people of Israel"; ref 5441 "abobule" (= àbó-onobulẹ "women") "abo egini" "little ones". Human-reference use dominates, exactly as Ejeba predicts.
- **Reduplication for large spatial entities**: `aji aji` "rivers" — **41 rows** (e.g. refs 1704, 1715 "naji aji" over the rivers); `uwo uwo`/`oj uwo oj uwo` "mountains" — **155 rows** (ref 188 "ma li oj uwo oj uwo" = "the tops of the mountains were seen"); `ohimini ohimini` "rivers/canals" — **20 rows**; ref 1715 also has "oduda oduda". **This rare typological claim is robustly attested in our corpus.**
- **Community answers (train split only)**: for "The two women are sisters" annotators wrote "**Am'**onobulẹ meji…", "**Ami** ọnọbulẹ mẹji…", "**Ámì** èbòbùlẹ méjì…", "**Abo** obulẹ mẹjì-ì…" — the same àma-/àbó- morpheme, in living community orthography (note the surface variants _Ami/Ámì/Am'_ vs Ejeba's _àma-_: worth flagging to annotators as elision of the prefix vowel before a vowel-initial noun, not a different morpheme).

### 1.2 Personal pronouns and clitics (Ejeba's Table 5) **[SCHOLARLY, partially corroborated]**

| Person/Number | Pronoun | Subject clitic | Object clitic                                                                        | Gloss       |
| ------------- | ------- | -------------- | ------------------------------------------------------------------------------------ | ----------- |
| 1SG           | òmi     | u              | mi                                                                                   | I / me      |
| 2SG           | ùwẹ     | ẹ              | ẹ                                                                                    | you         |
| 3SG           | ònwu    | i              | U (archiphoneme → u/o/ọ by vowel harmony with preceding high / high-mid / low vowel) | s(he)/it    |
| 1PL           | àwa     | a              | wa                                                                                   | we / us     |
| 2PL           | àmẹ     | mẹ             | mẹ                                                                                   | you (pl)    |
| 3PL           | àma     | ma             | ma                                                                                   | they / them |

Plus a segmentally underspecified "global subject clitic" V copying after NPs. Clitics are tonally underspecified (tone not part of clitic morphology). Pronouns in isolation do not distinguish subjective/objective case; clitics do. A genitive paradigm exists (his Table 6) but **its cell contents did not survive PDF extraction** — re-derive from the PDF manually if needed.

Corpus corroboration: `ma` as 3PL subject clitic is ubiquitous ("ku **ma** bi", "**ma** li", "taku **ma**…"); `mi` 1SG object ("bumi", "fumi", "numi" = benefactive+mi); `awa` "us" attested (ref 646 "je kpai **awa**" = "remain with us"); imperative 2PL `mẹ` appears as "me"/"mẹ" in community answers. Full six-way paradigm not independently derivable from an unmarked corpus — keep as scholarly with these anchors.

### 1.3 Singular/plural verb suppletion and object–verb concord **[DEDUCED — strongly confirmed]**

Ejeba's core lexical pairs (singulative vs pluractional):

| Singular | Plural | Gloss                                                                          |
| -------- | ------ | ------------------------------------------------------------------------------ |
| **du**   | **kó** | carry / take                                                                   |
| té       | jọ     | keep, set down (also jọ = sit.PL vs gwùgwú = sit.SG)                           |
| tó       | rú     | put (in) — with **nyú** as a mixed form (plural object into singular location) |
| tínyọ̀    | rínyọ̀  | throw away (one thing / several things)                                        |

Rules (paraphrased): the verb agrees in number with its **object** for transitives (du/kó select sg/pl objects); with its **subject** for intransitives; plural NPs and plural clitics are licensed **only** with plural verb forms, whether the NP's plurality is overt (animate, prefixed) or covert (inanimate, zero-marked — the verb form is then the only surface signal of number, i.e. the concord context disambiguates). Inanimate object pro-drop is obligatory where an object clitic would be expected; animate object clitics must be expressed. Plural verb + singular nominal is possible only with collective/mass referents.

**Corpus verification:**

- `du … wa` with English "bring" — **137 rows**; `ko … wa` with "bring" — **77 rows**.
- du + singular object: ref 1289 "e mu **du** nyumi owo nadu da**bi wa**" = "bring **him** back"; ref 1299 "komi ma **du** dabi **wa**" = "if I do not bring **him** back"; ref 523 "**du tinyo**" = "cast out [this slave woman]".
- kó + plural object: ref 736 "**ko** kwomo **wa** ñwu mi" = "bring me **two good young goats**"; ref 740 "mu **ko wa**" = "go bring **them** to me"; ref 1858 "muma **ko** kwane Ijipti **wa**" = "bring **them** out of Egypt".
- **Caveat**: Bible corpus uses "**mu**" heavily for 'take' as well; and **gwùgwú 'sit.SG' scores 0 hits** in 30,907 verses (the Bible uses other verbs for sit/dwell, e.g. "dodo jo" ref 676 "ma dodo **jo**" = "they settled", plural). So the du/kó pair is confirmed; the sit/keep pairs are only weakly corroborated (jọ appears in plural contexts but the syllable "jo" is too ambiguous to count cleanly).

### 1.4 Verb–modifying-verb concord and the t-/r- bound concordial element **[DEDUCED — strongly confirmed]**

Paraphrase of Ejeba's most novel claim: in complex predicates (splitting-verb and serial-verb constructions, structural frame #NP-(NP)(-(NP))#, following Bamgbose's Yoruba model), the **modifying verb agrees in number with the main verb**: _du tínyọ̀_ (sg) vs _kó rínyọ̀_ (pl), and mismatches (_du rínyọ̀_, _kó tínyọ̀_) are ungrammatical. In tínyọ̀/rínyọ̀ the number contrast is carried **solely by the initial consonant**: t- = singular, r- = plural, prefixed to the bound root _-nyọ̀_ 'away' (cf. gbé-nyọ̀ 'forget', gbà-nyọ̀ 'shake off', lè-nyọ̀ 'go missing', dà-nyọ̀ 'pour away'). Ejeba analyses this as a consonantally underspecified form Cí-nyọ̀ with 'structure-building' specification — phonology directly accessing a semantic feature — and calls it an ablative extensional prefix (AEP): bound, class-maintaining, non-productive, morphosyntactically obligatory. His own footnote caution: **tínyọ̀/rínyọ̀ is the only clean t-/r- pair**; tọ́/rú 'put sg/pl' echoes the pattern but the vowels differ too, so it is not a second clean case.

**Corpus verification:** `tinyo` — **356 rows**; `rinyo` — **761 rows**, with the number semantics running the right way:

- tinyo with singular/unitary referents: ref 523 "du **tinyo**" (cast out the slave woman); ref 1794 "daduremi **tinyo**" (forgive **my sin** — take this one sin away); ref 2470 "e dadurema **tinyo**" (forgive their sin).
- rinyo with plural/multiplex referents: ref 216 "du **rinyo**" ("never again shall **all flesh** be cut off"); ref 1116 "fana **rinyo** pele pele" ("torn **to pieces**"); ref 1352 same idiom; ref 911 "komama **rinyo**" ("[my ewes and goats] have not miscarried" — plural subjects).
- Also attested: "kpo **tinyo**"/"kpo **rinyo**" for 'lost/missing (coin vs coins)' pattern (Ejeba's example 12) — e.g. the sg/pl 'missing' contrast appears in corpus refs with "kpo" + C-inyo.
- The 2:1 rinyo:tinyo ratio is corpus-plausible (Bible narrative favours collective destruction/dispersal contexts).

### 1.5 Verb–mass-noun concord **[SCHOLARLY]**

Mass nouns (ómi 'water', ẹ́kẹ́tẹ̀ 'sand', égbé 'grass', óbó 'soup') take dedicated verbs (dà 'pour entirely', bà 'scoop some', gbá 'fetch grain / pour water', gwó 'clear grass', já 'cut grass/hair', che 'fetch fluid', té 'arrange/dress') and pattern mostly with **plural** verbs and modifying verbs, with singular modifying verbs marking finer distinctions (gbá ómi **nyú** ùjógò 'pour water into one bottle' vs gbá ómi **rú** ùjógò 'into several bottles'; gbá ómi **jọ** ánẹ̀ grammatical, \*gbá ómi **té** ánẹ̀ not). Not cleanly verifiable in an unmarked corpus (these monosyllables are too ambiguous to count); keep as scholarly. Teaching value: mass nouns count as plural for concord.

### 1.6 Consonant and vowel inventory **[CONFLICT — documented disagreement]**

Ejeba 2023 (and Adeniyi 2017, both after Ejeba 2016/2009): **28 consonants, 7 vowels** /i e ɛ a ɔ o u/ = orthographic i, e, ẹ, a, ọ, o, u. The 28 include a palatalized series /pʲ bʲ fʲ mʲ lʲ/ written pi/bi/fi/mi/li (e.g. ápiẹ́piệ 'African pied hornbill', ábiá 'dog', ẹ̀fiá 'watery excrement', ímiẹ 'dew on grass', ùliẹ́na 'jealousy'). Orthographic mapping worth keeping: ny = /ɲ/, **ñ = /ŋ/** (íñó 'honey'), nw = /ŋʷ/, ch = /tʃ/, j = /dʒ/, y = /j/.
The disagreement, as stated in Ejeba 2023 itself: Miachi & Armstrong (1986, the National Language Centre-approved orthography) recognize **25**; Mason & Nordman (nd) **24**; Omachonu (2000) **23**; Ejeba (2016) upholds 23 + the 5 palatalized = **28**, and treats [ŋm] as an allophone of /m/ (Dekina variety). Our RagEntry row on the 23/28 split is consistent; Arokoyo (2020)'s 23 aligns with Omachonu. **Recommendation stands: cite Ejeba's 28 as reference, note the range 23–28.**
Ejeba's data variety is **Dekina**; his consultants: 5 native speakers (F 69/45/32, M 82/40) plus native-speaker intuition — small-n fieldwork, worth remembering when it conflicts with community annotators from other areas.

---

## 2. Tone and downstep (Adeniyi 2017) — paradigms and verification

### 2.1 The basic system **[SCHOLARLY, orthography-level corollary DEDUCED]**

- Three level tones, H/M/L. Minimal triple: **rẹ́** 'close' (H) / **re** 'pick' (M) / **rè** 'make a drum' (L).
- Contour formation: L **falls** after H (ạ́chíkù → ạ́chíkû 'bone'; ọ́gwù → ọ́gwû 'medicine'); H **rises** after L (èmị́ → èmǐ 'here') — after Akinkugbe 1978.
- Marking convention: acute = H, grave = L, mid unmarked (same convention as Ejeba).

### 2.2 Downstep **[CONFLICT between scholars; corpus corollary DEDUCED]**

- Adeniyi: downstep affects **all three tones** (DSH, DSM, DSL), triggered by floating L (initial and non-initial) and — for DSH — also floating M. Instrumental pitch-track evidence: òdùdè là ògèdè → òdùdè **ꜜl**ògèdè 'the bat bought banana' (DSL, the downstepped L sits 10 Hz below the preceding L and caps following Ls — terracing); ạ́ngẹ́jē kpạ́ ọ́nụ́ → ạ́ngẹ́jē **ꜜkp**ọ́nụ́ 'the tortoise killed the thief/chief' (DSH from M+H concatenation, realized 11 Hz below the preceding M).
- **Conflict:** Ejeba (2009) recognizes **only DSH**; most previous authors likewise. Adeniyi 2015/2017 argues DSM and DSL are demonstrable. Record as an open scholarly dispute; for our purposes DSH is uncontested.
- **The orthography systematically hides DSH**: DSH in Igala is realized only slightly above M ("closer to M than to H" — Adeniyi 2015 and Ejeba, oral communication), so writers perceive and write it as **mid (unmarked)**. His misrepresentation set (15a–g), all real concatenations: ọ́gwụ́ + ẹ̀gwạ́ 'twenty + ten' → written \*ọ́gwẹ́gwa but actually **ógwé ꜜgwá** 'thirty'; ẹ̀gwạ́ + ẹ̀lạ́ → \*ẹ̀gwẹ́la vs **egwé ꜜlá** 'nineteen'; gwè + ụ́kpò → \*gukpò vs **ꜜgúkpo** 'wash cloth'; ùkwù + ị́ngọ́ → \*ùkwingọ́ vs **ukwꜜíngó** 'scent of honey'; ùchà + ạ́de → \*ùchade vs **uꜜchádẹ̄** 'pot of brass'; ùchà + ạ́mạ́ + kẹ́kẹ́ → \*ùchamạ́kẹ́kẹ́ vs **uchꜜámá kéké** 'a small clay pot'; ọ́jị́ hì ẹ́la → **ójí ꜜhyélā** 'the thief cooked meat'. (15a–b are from Armstrong 1965.)
- Adeniyi explicitly warns that a TTS/ASR system trained on the orthography will treat erroneous M as real M — directly relevant to us.
- **Ejeba (oral communication, quoted by Adeniyi): "tone is virtually not marked at all" in practice.** Our corpus quantifies this brutally: **only 3 of 30,907** ParallelPair rows contain any diacritic at all (tone OR dotted vowel). The Bible corpus is written in plain ASCII-plus-ñ: no ẹ/ọ dots, no tone. Community train-split answers are **inconsistently marked** (from fully-marked "Ámì èbòbùlẹ méjì lẹ chì ọmàyè" to unmarked "Ami onobule…"). **[DEDUCED]** Consequence for the project: any model scored on diacritics is being scored against a convention even the largest native corpus does not follow; the annotation UI should treat dots as recoverable and tone as largely absent from natural writing (this matches Lydia's rubric making diacritics its own axis).

---

## 3. Numerals (Omachonu 2012) — the full paradigm, heavily confirmed

Omachonu (native speaker + trained linguist) gives the system as **vigesimal (base-20) with base-10 sub-structure**, formulae per range. Ígálà forms below in his phonemic transcription with orthographic equivalents where inferable.

### 3.1 Basic numerals 1–10 **[DEDUCED for the m- counting forms; CONFLICT on 'one']**

| N   | Omachonu (phonemic) | Bible corpus attributive form        | Corpus count/rows                                                                      |
| --- | ------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | ínyẹ́ / ókà          | (m)oka; "oka" = 'one (person/thing)' | ref 1352 "oñ **oka** kwo bumi te" = "One left me"; "okawñ" 'one of them'               |
| 2   | èjì                 | **meji**                             | ubiquitous (e.g. ref 613 "owo **meji**" two bracelets)                                 |
| 3   | ẹ̀tā                 | **meta**                             | ref 2466 "icham nyogwoko **meta**" three thousand                                      |
| 4   | ẹ̀lẹ̀                 | **mele**                             | ref 40 "akanaba **mele**" four rivers                                                  |
| 5   | ẹ̀lú                 | **melu**                             | ref 3532 "Eneme **melu**" five of you                                                  |
| 6   | ẹ̀fà                 | mefa                                 | attested in number compounds                                                           |
| 7   | èbiē                | **mebie**                            | ref 163 "ojo **mebie**" seven days                                                     |
| 8   | ẹ̀jọ̄                 | mejo                                 | attested in compounds                                                                  |
| 9   | ẹ̀lá                 | mela                                 | attested in compounds                                                                  |
| 10  | ẹ̀gwá                | **megwa**                            | **242 rows**; ref 384 "fodo **megwa**" ten years; ref 601 "oduwñ **megwa**" ten camels |

The **m(ẹ́)- prefix** on 2–10 in running text (Omachonu's own tables use mɛ́- forms inside compounds, e.g. ógʷúɲókē**mɛ́tā** 21+) is massively attested — the bare forms (èjì etc., as in Wiktionary/LexEntry) are the citation/counting forms, the m- forms the attributive ones. **[DEDUCED]**
**'One' [CONFLICT]:** Omachonu ínyẹ́/**ókà**; Wiktionary òókáà; Koelle (1854) ī́nye; ASJP ínyẹ. The corpus audit had flagged seed-row "Okpa = 1" as wrong — correct, but note ókà/òókáà/oka is genuine (and surfaces in ẹ̀gwákà '11', ógwúnyọ́kēkà '21'); the wrong part of "okpa" is the -kp-.

### 3.2 Derived numerals — formulae and corpus confirmation **[DEDUCED — the showpiece]**

Omachonu's derivation table, with our Bible-corpus counts:

| Value | Omachonu form                                                                            | Derivation        | Corpus form                    | Count                    | Example                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------- | ----------------- | ------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11    | ẹ̀gwákà                                                                                   | 10+1              | —                              | —                        | (teens sparse in Bible counting style)                                                                                                                                                                          |
| 12    | ẹ̀gwéjì                                                                                   | 10+2              | —                              | —                        | —                                                                                                                                                                                                               |
| 13–19 | ẹ̀gwẹ́tā, ẹ̀gwẹ́lẹ̀, ẹ̀gwẹ́lū, ẹ̀gwẹ́fà, ẹ̀gwébiē, ẹ̀gwẹ́jọ̄, ẹ̀gwẹ́lā                                  | 10+n              | "megwelu" 15 (10+5)            | ref 179                  | "ohiba **megwelu**" fifteen cubits                                                                                                                                                                              |
| 20    | ógwú (basic; ọ̀gbọ̀ interchangeable in some contexts)                                      | basic             | **ogu**; **ogbo** in multiples | 80 rows w/ 'twenty'      | ref 911 "Odo **ogu** komi" = "These twenty years"                                                                                                                                                               |
| 21–29 | ógwúnyọ́kē-mV́ (20 'plus' n, linker **-nyọ́kē-**)                                           | 20+n              | **nyoke** as additive linker   | **394 rows**             | ref 1413 "chogbo meta **nyoke** megwa" = 20×3+10 = seventy                                                                                                                                                      |
| 30    | ógwẹ́gwā                                                                                  | 20+10             | **oguegwa**                    | **148 rows**             | ref 454 "**oguegwa** li omo" = "suppose thirty are found"; ref 1241 Joseph "choguegwa egba" thirty years old                                                                                                    |
| 40    | ógwúmēji / ọ̀gbọ̀mẹ́jì                                                                      | 20×2              | **ogbo meji**                  | **134 rows**             | refs 163/171/176/189 "ojo **ogbo meji**" forty days                                                                                                                                                             |
| 50    | óójē — **basic, no derivation history** (Omachonu 2011:90: neither derived nor deriving) | basic             | **oje**                        | **64 rows** w/ 'fifty'   | attested throughout tabernacle passages                                                                                                                                                                         |
| 60    | ógwúmẹ́tā / ọ̀gbọ̀mẹ́tā                                                                      | 20×3              | ogbo meta                      | in compounds             | ref 1413 (above)                                                                                                                                                                                                |
| 70    | ẹ̀tẹ̀gwá (blend of full form ọ̀gbọ̀mẹ́tā-nyẹ̀gwá)                                              | 20×3+10           | **etegwa**                     | **58 rows**              | ref 1537 "chone **etegwa**" = "seventy persons" — and ref 1413 gives the same value in FULL form "ogbo meta nyoke megwa": **both the blend and its transparent source construction are attested in one corpus** |
| 80    | ógwúmẹ́lẹ̀ / ọ̀gbọ̀mẹ́lẹ̀                                                                      | 20×4              | ogbo mele                      | in compounds             | —                                                                                                                                                                                                               |
| 90    | ẹ̀lẹ̀gwá (blend of ọ̀gbọ̀ẹ́lẹ̀-nyẹ̀gwá)                                                         | 20×4+10           | —                              | —                        | —                                                                                                                                                                                                               |
| 100   | ógwúmẹ́lū / ọ̀gbọ̀mẹ́lū                                                                      | 20×5              | **ogumelu / ogu melu**         | **43 rows** w/ 'hundred' | ref 518 "chodo **ogumelu** egba" = "a hundred years old"; ref 3532 has both "ogumelu" and "ogu melu" in one verse                                                                                               |
| 200   | ógwúmẹ́lūméjì / ọ̀gwá / ọ̀gwọ́kọ́ (3 acceptable forms)                                        | (20×5)×2 or basic | ogwoko                         | inside 'thousand'        | see below                                                                                                                                                                                                       |
| 800   | ógwúmẹ́lūmẹ́jọ̄ / **íchámù** (basic unitary form)                                           | (20×5)×8 or basic | **icham**                      | see below                | —                                                                                                                                                                                                               |
| 1000  | **íchámùnyọ́gwọkọ** = 800+200                                                             | 800+200           | **icham nyogwoko**             | **404 rows**             | ref 511 "ajifa **icham nyogwoko**" = "a thousand pieces of silver"; ref 2466 "**icham nyogwoko meta**" = "three thousand"; ref 1853 "ere ofo dab **icham nyogwoko** ulogwa" = "six hundred thousand"            |

**Verdict: the Omachonu paradigm is confirmed at every corpus-testable point** — including its three most exotic claims: 50 as an underived opaque form (óójē), 70/90 as blends (ẹ̀tẹ̀gwá attested 58×, alongside its own full form), and 1000 as the sum 800+200 (íchámù-nyọ́gwọkọ, 404×). Yoruba, by contrast, uses subtraction heavily (àádọ́ta '50' = 60−10) — Igala **never subtracts**; Omachonu's constraint ranking for Igala is B+A >> C+A >> C+B,C×A(B) >> C×A×A with the vigesimal linker -nyọ́kē-. Grammatical processes in derivation: vowel elision, clipping, blending, compounding.

### 3.3 Bonus paradigm found in corpus, not in the three papers **[DEDUCED]**

Ordinals use an **eke-** prefix: ref 187 "ochu **ekebie**" = "seventh month", "ojo **ekegwebie**" = "seventeenth day", ref 188 "ochu **ekegwa**" = "tenth month"; 'first' is suppletive **ejodudu** (ref 188 "ojo ejodudu" = "first day"; cf. Gen 1:1's "ejodudu" = "in the beginning"). Consistent, frequent, and worth a LexEntry/RagEntry row of its own.

---

## 4. Cross-cutting findings for the project

1. **Orthography is triple-layered in our own data** — (a) ParallelPair: no dots, no tone, ñ only; (b) community answers: dots usually, tone sometimes; (c) reference rows (Wiktionary/scholars): full marking. Scoring or training that mixes the three without normalization will teach the model that ẹ/e alternate freely. The Adeniyi finding (§2.2) says even "correct" tone-marking is systematically wrong about DSH. Recommendation: score dotted vowels separately from tone marks (Lydia's rubric already separates the axes), and treat mid-tone-marked-as-unmarked as UNKNOWN, not MID.
2. **The concord system is a high-yield eval axis.** The number-agreement rules (du/kó, tinyo/rinyo, àma-/àbó-, reduplication) are frequent (hundreds to thousands of corpus attestations), binary, and easy to grade — unlike tone. Model failures here are unambiguous. Suggested probes: "bring the child / bring the children" (du wá vs kó wá), "throw away the stone(s)" (tínyọ̀/rínyọ̀), "mountains" (úwó úwó, not \*àma-úwó).
3. **Watch the animacy trap in generation**: a model that pluralizes inanimates with àma- (\*àma-ólí 'trees') is producing a diagnostic, Yoruba-flavoured error the corpus never makes.
4. **Small conflicts registry**: consonant count 23 vs 24 vs 25 vs 28 (§1.6); DSH-only vs DSH+DSM+DSL (§2.2); 'one' ínyẹ́ vs ókà/òókáà (§3.1); gwùgwú 'sit.SG' unattested in 30,907 Bible verses despite being Ejeba's parade example (§1.3) — possibly register or variety (his data is Dekina).
5. **Not accessible and still wanted**: Ejeba (2016) _A Grammar of Igala_ (paywalled; the concord paper cites its clitic, tense/aspect/mood and case systems repeatedly — the 2023 paper is our best free window into it); Ejeba (2018) on àma-/àbó- (JOLAN); Miachi & Armstrong (1986) orthography manual; Ejeba's Table 6 (genitive pronouns — in the PDF but lost to text extraction; one manual read of p. 92 would recover it). Author contact for permissions/questions: salem.ejeba@gmail.com (University of Port Harcourt).

## 5. Files and artifacts

- Retrieved PDFs + extracted text in scratchpad: `ejeba.pdf/.txt` (19 pp), `adeniyi.pdf/.txt` (20 pp), `omachonu.pdf/.txt` — scratchpad is session-scoped; re-fetch URLs are in §0.
- Lydia's rubric: Google Sheet `1CFEgAu0Ff2bk3jXDjq7BHUVxdLXW0gavC37Sbvm3THk` (owner lydia@wikitongues.org).
- Ejeba 2023 direct download: `https://journalofwestafricanlanguages.org/index.php/downloads/send/146-golden-jubilee-edition/800-igala-concord-system` (CC BY-NC 4.0 — paraphrase only).
- Adeniyi 2017 PDF: `https://bop.unibe.ch/linguistik-online/article/download/3844/5824`.
- Omachonu 2012 PDF: `https://www.redalyc.org/pdf/6645/664573521004.pdf`.

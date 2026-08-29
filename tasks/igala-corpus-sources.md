# Igala corpus sources — audit, licence status, and what we ingested

**Date of verification:** 2026-08-09. **Language:** Igala (ISO 639-3 `igl`, Glottocode `igal1242`, Wikidata Q35513), Yoruboid / Niger-Congo, Kogi State Nigeria, ~1.6–2M speakers.

Every claim below carries the URL it came from. Where a claim could not be verified, it says so rather than guessing. Licence status is the load-bearing column: **do not act on any row marked "unknown" without resolving it first.**

---

## 0. The three things that matter

1. **Igala Wikipedia is the find — and Wikitongues helped create it.** It went live 23 April 2024 and now holds **~484,000 words / ~1.09M GPT-tokens** of Igala prose under **CC BY-SA 4.0**, with monthly machine-readable dumps. Nothing else is within an order of magnitude, and it did not exist before 2024 — which is why every "Igala has no data" survey is out of date. Crucially: **Igala was selected for Wikitongues' own 2023 Language Acceleration Program**, and the Igala Wikimedia Community writes that Wikitongues' "support for the revitalization of the Igala language on Wikipedia has been invaluable" (https://diff.wikimedia.org/2024/04/04/celebrating-the-approval-of-igala-wikipedia-a-triumph-for-linguistic-diversity/). The largest Igala corpus in existence is partly a Wikitongues outcome. That relationship is the most valuable asset in this report.
2. **A 10M-token corpus is not assemblable legally today.** The realistic openly-licensed ceiling is **~1.2M tokens**, and roughly **2.5–4M** if permission negotiations with the Bible Society of Nigeria and JW.org succeed. See Part 2.
3. **Two live traps.** The only large Igala parallel corpus on HuggingFace (`dalaone/eng_igl_bible`, 31k verse pairs) has **no licence and no provenance** and is almost certainly a copyrighted Bible Society text. And the "Igala speech datasets" on HuggingFace are **Igala-accented English**, not Igala. Details in §4.

---

## PART 1 — Annotated source list

Licence key: 🟢 open / public domain · 🟡 usable with conditions · 🔴 copyrighted, permission required · ⚫ unknown, do not use

### 1.1 Wikimedia (the open core) 🟢

| Source                            | URL                                                                             | Contents                                              | Size                                                                                                                                                                         | Machine-readable            | Licence          |
| --------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- |
| **Igala Wikipedia**               | https://igl.wikipedia.org · dumps https://dumps.wikimedia.org/iglwiki/          | Encyclopedic prose in Igala                           | 1,671 content pages; **874,173 words** per `Special:Statistics`; **484,446 words / 1,094,737 cl100k tokens** after markup stripping (I measured this from the 20260801 dump) | Yes — XML dumps, 3.0 MB bz2 | **CC BY-SA 4.0** |
| Igala Wiktionary (Incubator)      | https://incubator.wikimedia.org/wiki/Wt/igl                                     | Test wiki, dictionary entries                         | ~9 pages — negligible                                                                                                                                                        | Yes                         | CC BY-SA 4.0     |
| English Wiktionary, Igala entries | https://en.wiktionary.org/wiki/Category:Igala_lemmas                            | Tone-marked headwords, IPA, glosses, etymologies      | **122 lemmas; 96 with usable definitions, 86 with IPA** (I extracted these)                                                                                                  | Yes — API/dumps             | **CC BY-SA 4.0** |
| Wikidata Igala lexemes            | SPARQL `?l dct:language wd:Q35513`                                              | Lexeme entries                                        | ~217 lexemes                                                                                                                                                                 | Yes                         | **CC0**          |
| OPUS `wikimedia` en–igl           | https://object.pouta.csc.fi/OPUS-wikimedia/v20260327/moses/en-igl.txt.zip       | Parallel sentences from Wikipedia Content Translation | 1,110 pairs / 27.5k Igala tokens                                                                                                                                             | Yes (Moses/TMX/XML)         | CC BY-SA 4.0     |
| OPUS `translatewiki` en–igl       | https://object.pouta.csc.fi/OPUS-translatewiki/v2026-07-01/moses/en-igl.txt.zip | MediaWiki **UI strings**, not prose                   | 1,370 pairs / 6.3k tokens; avg 24 chars/line; 2.9% untranslated passthrough                                                                                                  | Yes                         | CC BY 3.0        |

**Caveats I measured directly, not inherited:**

- The Wikipedia corpus is **~10% English function words** overall. **123 of 1,507 topic articles are >20% English** (94,598 of 467,464 words), i.e. partly untranslated. Honest usable Igala volume is therefore closer to **390,000 words / ~0.85–0.9M tokens**, not the raw 484k/1.09M.
- OPUS `wikimedia` is **derived from** Wikipedia Content Translation, so it **overlaps the Wikipedia dump**. Do not count both as independent.
- The Igala Wikipedia has **1 admin and 18 active users**. It is thin community infrastructure holding a large asset — a partnership opportunity, and a fragility.
- **Reconciling two article counts:** `Special:Statistics` reports **1,671** and my dump parse found **1,863**. Both are right — MediaWiki's "content pages" figure counts only mainspace pages containing at least one wikilink, while the dump contains every non-redirect mainspace page. Use 1,863 for corpus purposes.
- **Licence confirmed directly from the API**, not inferred: `rightsinfo` returns "Creative Commons Attribution-Share Alike 4.0" (https://creativecommons.org/licenses/by-sa/4.0/), sitename `Wikipídiya`, lang `igl`.

**Igala Wikimedia Community** — founded 3 August 2022. Meta page: https://meta.wikimedia.org/wiki/Igala_Wikimedia_Community · lead **AgnesAbah**, others: Dnshitobu, Henry Ojonugwa, Ogalihillary, Benjamin Blessing · **igalawikimedia@gmail.com** · +234 (0)7034469421. Wikipedia creation ticket: https://phabricator.wikimedia.org/T361644.
_Note:_ the Meta page misclassifies Igala as "Central Sudanic". It is Yoruboid/Niger-Congo. Worth gently correcting if we partner.

### 1.2 Comparative-linguistics datasets 🟢

| Source                                               | URL                                                                            | Contents                                                                                                                      | Size                              | Licence                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Polyglotta Africana** (Koelle 1854), Lexibank CLDF | https://github.com/lexibank/polyglottaafricana · Zenodo 10.5281/zenodo.5136890 | Igala list `III-C-2`, incl. numerals 1–20, kinship, body parts, and **full short sentences** ("I drink water", "I love thee") | **285 forms** (I extracted these) | **CC BY 4.0**; 1854 source is **public domain**. Verified: repo `LICENSE` = "Attribution 4.0 International" |
| **ASJP** wordlists                                   | https://asjp.clld.org/languages/IGALA_2 (and `IGALA`)                          | 40-item Swadesh-style lists in ASJP transcription                                                                             | 2 lists, ~40 items each           | CC BY 4.0                                                                                                   |
| **Glottolog** languoid                               | https://glottolog.org/resource/languoid/id/igal1242                            | Classification, coordinates (7.34325 N, 7.17974 E), **7 dialects**, reference bibliography                                    | metadata                          | CC BY 4.0                                                                                                   |

Glottolog's seven Igala dialects: **Ankpa, Anyugba, Ebu, Ibaji, Idah, Ife (Nigeria), Ogugu**. Directly relevant to the dialect-capture work already in the repo. Ebu is spoken outside Kogi, in Delta State.

Koelle's 1854 orthography is _not_ modern Igala spelling — valuable as attestation and for tracking change, not as a spelling guide.

### 1.2b Other openly licensed corpora 🟢

Three sources found late that materially change the picture.

| Source                                | URL                                                                        | Contents                                                                                               | Size                                                        | Licence                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **chikhapo** Igala–English lexicon    | https://huggingface.co/datasets/ec5ug/chikhapo (`data/igl_eng.jsonl`)      | Tone-marked Igala→English word pairs                                                                   | **494 entries, 441 with diacritics** (verified by download) | 🟢 **MIT** — the cleanest licence of any Igala resource found                                            |
| **African Storybook**, 3 Igala titles | https://www.africanstorybook.org/reader.php?id=34834 · `=34835` · `=34837` | Children's stories: _órbala mi márja_, _Unyi Luwo's_, _Ubolu ero chi olaai_, all by Celine Nongo, 2020 | 3 books, ~15–20 short sentences each                        | 🟢 **CC BY 4.0** (licence printed in the PDFs). Flagged `approved=0` on ASb, i.e. not editorially vetted |
| **Crúbadán** Igala web crawl          | `oai:crubadan.org:igl` (Kevin Scannell, 2018)                              | Web-crawled Igala text, 17 documents                                                                   | **13,876 words**                                            | 🟢 **CC BY 4.0**                                                                                         |

**chikhapo caveats I found by reading the data:** the transcription is _phonemic_, not standard orthography — it writes ɛ, ɔ, ǯ where Igala writes ẹ, ọ, j. It also contains near-duplicates (`ébùtù` / `ébútú` / `èbùtù` all glossed "dust") and some mis-glossed rows — e.g. bare `ómi` is glossed "rain", but Wiktionary and ASJP both give `ómi` = **water**, with "rain" being the compound `ómi oǯálì` (literally water-of-sky). Usable, but not authoritative line by line.

**Crúbadán: RESOLVED AND PERMANENTLY CLOSED (2026-08-27).** Kevin Scannell replied to our retrieval request (email thread, Aug 15 2026): he has left the university, no longer holds the crawled data, and - decisive - the crawl's metadata shows **every one of the 17 Igala documents came from the old watchtower.org website** (Wayback Machine mirrors from 2007 still resolve). That places the entire crawl under the standing JW rule in section 1.4/§4.1: Watch Tower content is copyrighted, its ToS forbids reuse, the JW300 precedent is an explicit refusal, and a CC BY label applied by a crawler cannot relicense someone else's text - the same reasoning that disqualified the Inikpi TV channel and the dalaone Bible upload. Reachable is not licensed. Nothing was ingested; the A6 line item is closed for cause, not for lack of access.

### 1.3 Bible translations 🔴

A complete Igala Bible **does exist** — this is confirmed, not merely announced.

| Item                                                              | URL                                                                                    | Status                                                                                  | Licence                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Ọ̀TAKADA Ọ̀LA Ọ̀JỌ́` 1970 (code **IGL70**), Bible Society of Nigeria | https://www.bible.com/languages/igl                                                    | Readable free on YouVersion/Bible.com                                                   | 🔴 **BSN copyright.** Free to read, not openly licensed |
| Complete Igala Bible, BSN, dedicated 13 Mar 2021                  | https://www.vanguardngr.com/2021/02/bsn-translates-holy-bible-in-igala-okun-languages/ | 11 years' work; dedicated at Chapel of the Resurrection, Kogi State University, Anyigba | 🔴 BSN copyright                                        |
| Print edition `Otakada Ola Ojo`, ISBN 9789782492500               | https://www.amazon.com/Otakada-Ola-Holy-Bible-Igala/dp/9782492507                      | In print                                                                                | 🔴                                                      |
| Igala **audio** New Testament, Faith Comes By Hearing             | https://play.google.com/store/apps/details?id=org.fcbh.iglbsn.n2                       | Free audio NT — **the only substantial Igala speech resource that exists**              | 🔴 FCBH/BSN                                             |
| Translation Insights (TIPs) Igala page                            | https://tips.translation.bible/tip_language/igl/                                       | Translation notes, e.g. _achiwebetema_ used for "vine"                                  | 🔴 (small, citable)                                     |

**Why this matters:** a full Bible is roughly **700k–800k words**, which would more than double our corpus. It is the single highest-value permission target. It is _not_ scrapeable — see §4.1 for the tainted HuggingFace copy.

### 1.4 JW.org 🔴 — large, and explicitly off-limits

**jw.org has a full Igala site**: https://www.jw.org/igl/ — verified live, with Igala-language Bible (`Baibul Oji Intanẹt`), brochures, tracts, periodicals (`Oji-ọla Ojoji Ojoji`), study material (`Ọtakada`), and video. For many African languages this is the largest single text body.

**It cannot be used.** The JW.org Terms of Use (https://www.jw.org/en/terms-of-use/) prohibit creating tools "specifically made to collect, copy, download, extract, harvest, or scrape data, HTML, images, or text from this site," and prohibit reposting their publications.

This is not a theoretical constraint. The **JW300 corpus** (Agić & Vulić 2019, https://aclanthology.org/P19-1310.pdf) was withdrawn from OPUS after the copyright holder refused permission; Masakhane took legal advice and discontinued its use, pivoting to community-generated data (https://walledculture.org/a-blatant-no-from-a-copyright-holder-stops-vital-linguistic-research-work-in-africa/).

**Moot anyway:** JW300 never contained `igl`. Verified — an exhaustive OPUS API sweep returns only `wikimedia` and `translatewiki` for Igala.

### 1.5 Dictionaries and lexicons 🔴

| Source                                                                            | Details                                                                                                                                                                                                                                                                                      | Licence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **An Ígálá-English Lexicon**, John Idakwoji, Partridge Publishing Singapore, 2015 | ISBN 9781482827866 (pb) / 9781482827880 (ebook). **5,000+ headwords** with diacritics, phonetic symbols, tone marks; plus alphabet, tones, grammar, parts of speech, dialects, loanwords, **proverbs, idioms**, numerals, names. 30+ years of research. https://www.amazon.com/dp/1482827867 | 🔴 In copyright. **Top permission target after the Bible**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PanLex                                                                            | 3 Igala varieties: `igl-000` Igala, `igl-001` Igala-Oguluglu, `igl-002` Igala-Aladi                                                                                                                                                                                                          | 🟡 **Correction (2026-08-29): a verbal grant was reported, but the written record does not corroborate it - the permission email to info@panlex.org bounced permanently on 2026-08-16 (the server never accepted it), and the escalation to Long Now (services@longnow.org, sent 2026-08-27) is unanswered. No ingestion until written permission is on file.** Public licence remains CC BY-NC-SA 4.0 (verified at https://panlex.org/license/: commercial use requires written permission). Expression counts still unverified — `api.panlex.org` failed DNS |

### 1.6 Speech, audio and broadcast

There is **no Igala-language speech corpus** in the NLP sense. Verified absent from Common Voice (441 languages — Igala is not even in the localisation queue, while Edo and Tiv are), BibleTTS (10 languages), NaijaVoices (Hausa/Igbo/Yoruba only), ALFFA, and all of OpenSLR. There is no Igala ASR or TTS from any vendor or startup.

But Igala audio _does_ exist, and one piece of it is openly licensed.

| Source                                         | URL                                                                                | Contents                                                     | Size                                                                   | Licence                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global Recordings Network, "Words of Life"** | https://globalrecordings.net/en/language/igl                                       | Short Bible stories, messages, songs                         | **45 min 38 s**; MP3 zip 39.4 MB, low-MP3 10.8 MB, MP4 slideshow 61 MB | 🟡 **CC BY-NC-SA** — verified verbatim at https://globalrecordings.net/en/copyright (2022-02-27): _"Unless otherwise indicated, all are available to be copied and used under the Creative Commons Attribution-NonCommercial-ShareAlike license."_ |
| FCBH dramatised audio NT                       | https://play.google.com/store/apps/details?id=org.fcbh.iglbsn.n2                   | Full NT, ~180 voice actors                                   | Full NT                                                                | 🔴 FCBH + BSN. Not bulk-downloadable; DBP API needs a key                                                                                                                                                                                          |
| **JESUS Film in Igala**                        | https://www.jesusfilm.org/watch/jesus.html/igala.html                              | **128 min**, FHD, direct MP4                                 | 128 min                                                                | 🔴 Jesus Film Project                                                                                                                                                                                                                              |
| LUMO Gospel of Luke in Igala                   | https://dbs.org/video/lumo/igl_Igala_Luke                                          | Word-for-word Luke — **strong aligned audio↔text candidate** | 1 gospel                                                               | 🔴 Digital Bible Society                                                                                                                                                                                                                           |
| Bible for Children, 6 Igala PDFs               | e.g. https://bibleforchildren.org/PDFs/igala/03_Noah_and_the_Great_Flood_Igala.pdf | Illustrated stories in Igala                                 | 6 booklets                                                             | 🟡 free non-commercial; **text extraction fails** (custom font encoding) — needs OCR                                                                                                                                                               |

**GRN's NC clause: PERMISSION GRANTED (2026-08-17, signed 2026-08-27).** Graydon Colville (GRN Copyright Manager) granted written permission "to use the Igala recording in your language development project" via a modified copyright/partnership agreement - counter-signed by Halim 2026-08-27, final PDF pending from GRN (Graydon travelling). SCOPE NOTE, read before relying on this: it is a PROJECT-SCOPED grant under a bilateral agreement, not a change to the public CC BY-NC-SA licence - downstream artifacts must carry the agreement's terms, and the signed PDF (on the email thread, Lydia and Daniel cc'd) is the authority, not this summary.

**GRN download note (2026-08-28).** The full "Words of Life" MP3 zip (39,721,414 B, 14 tracks, programme 05651) is downloaded to `data/audio/grn-igala/Igala [igl] mp3.zip` with a `PROVENANCE.md` (URL, licence, permission, SHA-256 `6ee456dd...c5476d8`). Held as future ASR seed only - not processed, not ingested into any database or retrieval store. The site fronts curl with a Bunny Shield JS challenge; a real browser session reaches it normally and the media host (`media.globalrecordings.net`) serves the zip directly.

**Bible for Children download + font forensics note (2026-08-28).** All 6 Igala booklets (main variants) downloaded to `data/pdfs/bible-for-children/` with `PROVENANCE.md` (checksums inside). Text extraction is confirmed DEFEATED, and now we know exactly how: the subdot vowels (ẹ, ọ) are typeset as underlined letters via a second embedded Comic Sans subset (CID Identity-H) whose glyph outlines carry a baked-in underline, and whose ToUnicode CMap maps them to plain ASCII e/o. pdftotext therefore returns fluent-looking ASCII with every ẹ/e and ọ/o distinction silently collapsed ("E̲ne̲ ki ko̲" renders on the page, "Ene ki ko" extracts); no non-ASCII Igala character appears in any extraction. Both subsets share the base name and metrics, so recovery needs content-stream font-run parsing or underline-aware OCR - nothing from these PDFs may enter any store until then. ("wn" digraphs in the text are genuine orthography, not garbling.)

Note: GRN lists seven Igala **dialect** pages (Ankpa, Anyugba, Ebu, Ibaji, Idah, Ife, Ogugu) but has recordings for **none** of them — only the single main-Igala programme.

**Radio.** The Igala-language broadcaster is **Radio Kogi's Ochaja booster station** (Dekina LGA), established for Kogi East coverage — https://kogistate.gov.ng/radio-kogi-ochaja-booster-station-resumes-full-operations-as-governor-ododo-restores-vandalized-equipment/. A live stream exists (`https://streams.radio.co/scdae47edf/listen`, 96 kbps MP3) but that is the Lokoja feed and was playing English pop when checked; Igala content is scheduled, not continuous. **No published schedule, no downloadable archive.** Capture would have to be live, time-targeted, and permissioned by KSBC. Other Kogi stations: Fusion FM 91.7 (Kogi State University campus radio, Anyigba — in the Igala heartland), Confluence FM 94.0, Prime FM 101.5 (FRCN).

**International broadcasters carry no Igala.** BBC's Nigerian services are Hausa, Yoruba, Igbo and Pidgin only; VOA's only Nigerian-language service was Hausa (shut down 2025); RFI has none.

⚠️ **Two claims in the original brief did not survive checking.** "Grassroots FM, Idah" could not be found in any station list, NBC record or news source — treat as non-existent until confirmed on the ground. And the recurring claim of a 24-hour "Igala Radio in Idah" traces **only to Grokipedia**, an AI-generated encyclopedia, with no independent confirmation. **Do not cite it.**

### 1.7 Video — ~1,250 videos, one CC-BY channel, and a rights problem

Roughly **1,250+ videos across 17 verified Igala channels**. This is the largest _untapped_ pool of natural Igala speech, and the hardest to use: YouTube's ToS prohibits scraping and everything defaults to Standard YouTube Licence.

Largest channels: **United Igala Kingdom TV** (425 videos, culture/history), **Abigail Omonu** (235, gospel song), **JF TV Igala** (162), **IgalaGospelTV** (97 videos, 5.64K subs), Igala Music Premiere Collections (78, Ele-Ojo Records, Idah), Igala Nation (56), **IGALA HDTV** (47 — **drama and comedy with English subtitles, the best parallel-data target**; contact `igalatv1@gmail.com`), Igala Islamic TV (13 — a rare non-Christian religious register).

**The one CC-BY channel — with a caveat that matters.** _Inikpi Tv_ (https://www.youtube.com/@inikpitv1155, 3.06K subs, 40 videos) serves videos marked "Creative Commons Attribution license (reuse allowed)", including a **59-minute full-length Igala film** (https://youtu.be/iVCPAMhX2Oo). But the content is commercial Igala music and films by named artists. **A CC-BY tag is only as good as the uploader's ownership**, and it is unlikely this uploader held the rights to relicense. Treat as 🔴 until confirmed in writing by both the channel and the artists.

### 1.8 Community, teaching, orthography and language tech

**Orthography — verified, and I re-derived it from the corpus.** The Latin orthography was devised by **W. T. A. Philpot in 1931** and revised by Nigeria's **National Language Centre in 1980** (https://www.omniglot.com/writing/igala.htm); the 1931 version wrote `ng`, `nm`, `nw` where the modern one writes `ñ`, `ñm`, `ñw`. Measuring character frequencies across the whole Igala Wikipedia corpus independently confirms the seven-vowel system: **ọ** (U+1ECD) is 1.51% of all letters and **ẹ** (U+1EB9) is 1.21% — far too frequent to be incidental. Tone is marked acute = high, grave = low, mid unmarked; all of á à é è í ì ó ò ú ù occur in running text. `q` never occurs and `v` is vanishingly rare. **Data-cleaning note:** `ụ` (U+1EE5) appears occasionally and is _not_ part of standard Igala — almost certainly Igbo interference or typos. The working orthography is maintained by the **Department of Igala Language and Culture, Kogi State College of Education, Ankpa**, and Igala is one of NERDC's standard Nigerian orthographies.

**Keyboards** 🟢 — the Keyman **"Naija NFD"** keyboard (`el_naija`) explicitly supports `igl-latn`. Authors Andrew Cunningham and Chinedu Uchechukwu; **licence MIT**; Windows/macOS/Linux. https://keyman.com/keyboards/el_naija. Also SIL's Nigeria Underline / Dot / Odd Vowels keyboards, and Windows-only layouts on ki-gala.com (no licence stated).

**No Igala news outlet exists in any language variety.** Kogi Reports, radiokogi.ng and kogistate.gov.ng are English-only. No Igala newspaper, blog network or news site was found. **Igala Wikipedia is not a supplement to an Igala web-text corpus — it _is_ the corpus.**

Instructional web text, small and mostly dormant: **KIGALA ONLINE** (https://kigalaonline.wordpress.com/ — genuine Igala with English glosses; last post May 2019, no licence) and **ki-gala.com** (John Idakwoji's site; grammar and metalanguage posts; no licence).

**Apps are decaying.** Three Igala dictionary/Bible apps are **delisted (verified 404)** from Google Play across US/GB/NG storefronts; the **Apple App Store has zero Igala apps**. The only surviving Igala app is the FCBH audio Bible. No Duolingo or Memrise Igala course.

**Live teaching exists.** **K'Igala**, run by **Igala UK** (UK registered charity 1088055, https://www.igalauk.org/kigala), holds weekly Sunday video-conference classes covering alphabet, tones, grammar and numbers. No downloadable materials — but an organised body of Igala teachers is a strong partner for elicited recording.

**A cheap, concrete gap:** Wikimedia's **Lingua Libre** pronunciation category for Igala (`Category:Lingua Libre pronunciation-igl`) is **completely empty**. Lingua Libre is purpose-built for recording word pronunciations and everything produced is CC BY-SA by default. This is fillable in a weekend with the existing Igala Wikimedia community.

### 1.9 Academic literature, archives and open-access papers

**Archives: almost nothing.** OLAC (http://www.language-archives.org/language/igl) aggregates **exactly five** Igala records — the 1970 BFBS Bible, Crúbadán, Glottolog, Ethnologue, and LINGUIST List. There is **no Igala holding in ELAR, PARADISEC, or the MPI/Language Archive**, verified by direct search of all three with controls passing. _(OLAC's host was down during this audit — DNS resolves but ports 80/443 are closed; the record was recovered via the Wayback Machine.)_

**Grammars — all paywalled.** 🔴

- **Ejeba, Salem Ochala** (2016) _A grammar of Igala_, PhD, **University of Port Harcourt**; published 2017 as _A Grammar of Ígálâ_, M&J Grand Orbit, 268 pp, ISBN 9789785420876. Glottolog's most-extensive-description. Gives **28 consonants, 7 vowels**. Paywalled at JSTOR (`j.ctvh8qz34`), Project MUSE (`book/49701`) and African Books Collective. **Correction to the brief: the name is Salem Ochala Ejeba, not "Sunday Adejo Ejeba".**
- Silverstein, Raymond (1973) _Igala Historical Phonology_, PhD, UCLA — no open copy.
- Akinkugbe, Femi (1978) comparative Yoruba/Itsekiri/Igala phonology, PhD, Ibadan, 916 pp — no open copy.
- Armstrong, Robert G. (1965) Yoruba–Igala comparative wordlists, _JWAL_.

**Glottolog's bibliography is machine-readable and complete** — 38 items (2 grammars, 4 sketches, 12 phonology/text, 20 wordlists) at https://glottolog.org/langdoc.csv?language=igal1242&iDisplayLength=500 (CC BY 4.0). **Note the parameter is `language=`, not `languoid=`.** Critically: **none of the 38 carries a URL.** There is no open-access route to the core Igala literature.

**Open-access papers that ARE freely readable** 🟡 — useful for facts, but note the licences before copying text:

| Paper                                                                                                                                                                                 | Value                                                                                                                                                                                                              | Licence                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adeniyi (2017)**, "The Limits of Perception in the Tonal Orthographies of three-tone Systems", _Linguistik Online_ 84(5) — https://bop.unibe.ch/linguistik-online/article/view/3844 | **Highest-value item found for tone decisions.** Confirms Igala is three-tone and that **downstepped high is realised near mid level and usually written as mid** — i.e. the orthography systematically hides tone | open access (CC BY 3.0 era)                                                                                                                                                                                                                                                                       |
| Ejeba (2023), "Ígálâ Concord System", _JWAL_ 50 — https://journalofwestafricanlanguages.org                                                                                           | Free full text; **the entire JWAL archive is free**                                                                                                                                                                | CC BY-NC 4.0 · **Correction (2026-08-29): no grant yet. Ejeba replied warmly on 2026-08-14 and offered a call; the call is scheduled for 2026-08-31 and has not happened. Paraphrase-with-attribution only until his written permission is on file** - the natural moment to ask is Monday's call |
| Egbunu (2014), "Igala Proverbs as Bastions of Societal Harmony" — https://pdfs.semanticscholar.org/adcb/1bc83bff492c17fd204be0b97fdb258bee11.pdf                                      | ~5,600 words on Igala proverbs                                                                                                                                                                                     | CC BY-NC 4.0 · **Correction (2026-08-29): no contact with Egbunu exists in Gmail or Drive - no outreach has been made. The "cite, do not ingest" rule stands until written permission is on file**                                                                                                |
| Omachonu (2012), numerals Ígálà/Yoruba/German/English — https://www.redalyc.org/pdf/6645/664573521004.pdf                                                                             | Numeral system                                                                                                                                                                                                     | CC BY 3.0                                                                                                                                                                                                                                                                                         |
| Arokoyo (2020), phonology of Olùkùmi/Igala/Owé/Yorùbá, _Dialectologia_ 25                                                                                                             | Uses the Ibadan 400 Wordlist; gives 23 consonants                                                                                                                                                                  | CC BY-NC-ND 4.0 · **Correction (2026-08-29): no contact with Arokoyo exists in Gmail or Drive - no outreach has been made. ND additionally forbids derivatives; nothing may be ingested until written permission is on file**                                                                     |
| Capo (1985), "High non-expanded vowels in Yoruboid", _SAL_ 16(1)                                                                                                                      | Comparative Yoruboid                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                 |

⚠️ **Momoh (2023), "Vowels and the Igala Language Resources", ACL RAIL workshop** (https://aclanthology.org/2023.rail-1.12/) claims Igala has **30 vowels** and that **no standard orthography exists**. Both claims are wrong — the orthography dates to 1931 and was revised in 1980. **Do not rely on this paper**, and be aware it is the Igala paper most likely to surface in an NLP literature search.

**Roger Blench** 🟡 — his site has moved to lowercase `/files/` paths; index pages now 403 and all Kay Williamson Educational Foundation URLs 404. Two Igala PDFs are live:

- **Igala Mammal Names** (Blench & Paul Gross†, 2005; list compiled 1981), 2 pp, ~65 entries mapping scientific → English → tone-marked Igala — https://rogerblench.info/files/language/niger-congo/vn/yoruboid/igala%20mammal%20names.pdf. **Caveat I hit directly: the PDF uses a legacy non-Unicode encoding** (`E@` = ẹ́, `ç` = ọ), so roughly a third of the forms extract garbled. Usable only with careful transcoding or manual rekeying.
- **Atlas of Nigerian Languages, 2020 edition**, 198 pp — https://rogerblench.info/files/language/africa/nigeria/atlas%20of%20nigerian%20languages%202020.pdf. Igala is entry 191: dialects Ánkpa, Ògùgù, Ìfè, Ànyìgbá, Idáh, Ìbàjì, Èbú; Bible 1970, NT 1935/48/66, scripture portions from 1924, Primers 1–6, Official Orthography.
- **Blench's stated permission terms, verbatim:** _"May be freely quoted but please acknowledge source."_ That permits quotation with attribution; it is **not** a formal open licence, so I quoted a handful of forms rather than bulk-ingesting his wordlist.

**Proverbs and folktales: no dedicated scholarly collection exists.** Igala oral literature is still overwhelmingly held by speakers, not archives. For this project it is something to **collect**, not something to find.

**Also verified negative:** `igala.webonary.org` is NXDOMAIN (no Igala Webonary); WOLD has no Igala; DOAJ holds 28 Igala records total.

### 1.10 Verified absent from NLP resources

| Resource                                | Igala?                                       | Verified at                                           |
| --------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| MasakhaNER 2.0 (20 langs)               | Absent                                       | https://huggingface.co/datasets/masakhane/masakhaner2 |
| MasakhaNEWS (16)                        | Absent                                       | https://huggingface.co/datasets/masakhane/masakhanews |
| MasakhaPOS (20)                         | Absent                                       | https://huggingface.co/datasets/masakhane/masakhapos  |
| MAFAND-MT (21 pairs)                    | Absent                                       | https://huggingface.co/datasets/masakhane/mafand      |
| AfriQA (10)                             | Absent                                       | https://huggingface.co/datasets/masakhane/afriqa      |
| FLORES-200 / NLLB (200)                 | Absent                                       | https://github.com/facebookresearch/flores            |
| Common Voice (441)                      | Absent                                       | https://commonvoice.mozilla.org/api/v1/languages      |
| Tatoeba (429)                           | Absent                                       | https://downloads.tatoeba.org/exports/per_language/   |
| OPUS `bible-uedin`, `JW300`, `QED`      | Absent                                       | exhaustive OPUS API sweep                             |
| HuggingFace `language:igl`              | **Zero models, zero purpose-built datasets** | https://huggingface.co/api/models?filter=language:igl |
| MADLAD-400, Glot500                     | Absent                                       | (given; consistent with all of the above)             |
| Google Translate / Microsoft Translator | Absent                                       | —                                                     |

**This is a defensible first-of-kind claim** — with one wording caution: say _"no Igala-language speech corpus exists"_, never _"no Igala speech data"_, because AfriSpeech's Igala-accent English will be cited back at us (§4.2).

---

## PART 2 — Honest assessment

### Tier ranking (usable volume × legal cleanliness × ease of extraction)

| Tier   | Source                                    | Igala tokens (est.)               | Legal                         | Extraction                          | Verdict                                                                                                                                                                                                                                      |
| ------ | ----------------------------------------- | --------------------------------- | ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | Igala Wikipedia dump                      | **~0.85–0.9M** usable (1.09M raw) | 🟢 CC BY-SA 4.0               | Trivial — 3 MB bz2, one command     | **Take it now.** Done, in part.                                                                                                                                                                                                              |
| **A2** | Wiktionary + Wikidata lexemes             | ~10k                              | 🟢 CC BY-SA / CC0             | Trivial — API                       | **Taken.**                                                                                                                                                                                                                                   |
| **A3** | Polyglotta Africana + ASJP + Glottolog    | ~5k                               | 🟢 CC BY 4.0 / PD             | Trivial — CSV                       | **Taken.**                                                                                                                                                                                                                                   |
| **A4** | **chikhapo** Igala–English lexicon        | 494 pairs                         | 🟢 **MIT**                    | Trivial — one JSONL                 | **Taken.** Cleanest licence of any Igala source                                                                                                                                                                                              |
| **A5** | African Storybook, 3 Igala titles         | ~3k words                         | 🟢 CC BY 4.0                  | Trivial                             | **Taken.** Only open connected Igala prose outside Wikipedia                                                                                                                                                                                 |
| **A6** | Crúbadán Igala web crawl                  | 17 docs, all watchtower.org       | 🔴 JW copyright               | **CLOSED for cause**                | Scannell confirmed provenance 2026-08-15; falls under the §1.4 JW rule - do not ingest                                                                                                                                                       |
| **A7** | OPUS `translatewiki`                      | ~6k                               | 🟢 CC BY 3.0                  | Trivial                             | Low value (UI strings), take for MT only                                                                                                                                                                                                     |
| **B**  | Our own 937 community gold answers        | ~8k words                         | 🟢 ours                       | —                                   | The quality anchor, not the volume                                                                                                                                                                                                           |
| **C**  | **BSN Igala Bible**                       | **~700–800k words**               | 🔴 permission required        | Easy _if_ granted                   | **Highest-value ask**                                                                                                                                                                                                                        |
| **C**  | Idakwoji lexicon (5,000 headwords)        | ~50–100k                          | 🔴 permission required        | Medium (OCR/rekey)                  | **Second ask**                                                                                                                                                                                                                               |
| **D**  | JW.org Igala site                         | plausibly 500k+                   | 🔴 explicitly forbidden       | —                                   | **Do not pursue via scraping.** Written permission only, and expect refusal (JW300 precedent)                                                                                                                                                |
| **A8** | **GRN "Words of Life" audio**             | 45 min 38 s speech                | 🟢 project grant (2026-08-27) | Trivial — MP3 zip                   | **Permission granted** for this project per signed agreement; the only usable Igala speech asset                                                                                                                                             |
| **E**  | IGALA HDTV subtitled video                | 47 videos, EN subtitles           | 🔴 permission required        | Easy if granted — subtitle tracks   | Free aligned parallel data. Best non-Bible parallel target                                                                                                                                                                                   |
| **E**  | Radio Kogi Ochaja / ~1,250 YouTube videos | large but unquantified            | 🔴/⚫                         | Hard — needs ASR that doesn't exist | Long-term, needs transcription funding                                                                                                                                                                                                       |
| **X**  | `dalaone/eng_igl_bible`                   | 31k rows                          | ⚫ **no licence**             | Trivial                             | **Do not use.** See §4.1                                                                                                                                                                                                                     |
| **X**  | PanLex                                    | unknown                           | 🟡 ask never received         | Medium                              | The permission email bounced permanently 2026-08-16 (never received); Long Now escalation (2026-08-27) unanswered. No ingestion until written permission is on file. Public licence still CC BY-NC-SA; API still NXDOMAIN, so volume unknown |

### Token totals by legal status

- **Clean and obtainable today: ~1.0–1.2M tokens.** Still dominated almost entirely by Wikipedia — the newly found open sources (chikhapo, African Storybook, Crúbadán) add perhaps 30–40k tokens between them. They matter for _quality and licence cleanliness_, not for volume.
- **Plus successful permission negotiations: ~2.5–4M tokens.** Bible (~1–1.2M tokens) + the Idakwoji lexicon + possibly JW.org.
- **Theoretical ceiling including everything copyrighted and all untranscribed media: perhaps 5–8M tokens**, and only with years of transcription work.
- **Igala speech, all sources combined: about 45 minutes openly licensed** (GRN), plus a copyrighted audio New Testament and a 128-minute film. That is not enough for ASR or TTS from scratch.

### Is a 10M-token corpus realistically assemblable?

**No. Not today, and not by collection alone.** State this plainly rather than letting it be discovered later.

- The entire openly-licensed world holds **~1.2M Igala tokens**, which is **~1%** of what continued pre-training conventionally wants.
- Even winning every permission ask lands around **3–4M**, still short.
- The gap cannot be closed by searching harder. **It has already been searched.** Igala's absence from NLLB, MADLAD-400, Glot500, all four Masakhane benchmarks, Common Voice, and Tatoeba is not an oversight — there was nothing to ingest until the Wikipedia appeared in 2024.

**What this means strategically:** continued pre-training on Igala alone is off the table. The realistic paths are (a) **adapter/SFT on a multilingual base**, leaning on typological proximity to **Yoruba and Itsekiri**, which _are_ well-resourced and _are_ in NLLB — this is the highest-leverage technical move available; (b) **community generation as the primary corpus strategy**, not a supplement — the 937 gold answers are the seed of the only corpus we fully control; (c) **permission-seeking as a data-acquisition programme**, which is where Wikitongues' relationships are worth more than any crawler.

The honest headline: **we are not data-poor by accident, and we will not become data-rich by scraping. The corpus has to be built, and mostly by us.**

---

## PART 3 — Permission-seeking shortlist

Ranked by value ÷ difficulty. Contacts below were verified from the organisations' own pages; where no contact could be verified, it says so.

**1. Igala Wikimedia Community — partnership, not permission. Start here.**
`igalawikimedia@gmail.com` · +234 (0)703 446 9421 · WhatsApp https://chat.whatsapp.com/B77T2ZCLgMfJtBHpbQJTfR · lead **User:AgnesAbah** · https://meta.wikimedia.org/wiki/Igala_Wikimedia_Community
They already produced the largest Igala corpus, and **they already have a Wikitongues relationship** (2023 Language Acceleration Program; a joint editathon in Abuja, 25 Nov 2023, identified 160+ articles for translation — https://meta.wikimedia.org/wiki/Expanding_Igala_Language_Access_on_Wikipedia:_Creating_and_Engaging_a_Community_of_Contributors). Content is already CC BY-SA, so the ask is collaboration: corpus cleanup, dialect tagging, filling Lingua Libre, and pointing editathons at gaps we care about.
_Corrections to the brief:_ the group is **not** called "Wikimedians of Igala Language User Group" and is **not a recognised Wikimedia affiliate** — a grep of Meta's affiliate and user-group lists returns zero occurrences of "Igala". It is an informal community. Also, the YouTube link in their Meta infobox resolves to the **Gurene** community's channel (copy-paste error), and their social fields are malformed — **reach them by email or WhatsApp, not social**.

**2. User:Charipearl — a live, funded window closing soon.**
`charityogali0@gmail.com` · https://meta.wikimedia.org/wiki/Nigeria_National_Funding_Program/Charipearl/Igala_Wikipedia_Mentorship_%26_Translation_Project_-_IW-MTP_2026
The "Igala Wikipedia Mentorship & Translation Project (IW-MTP 2026)" runs **6 September – 6 November 2026** (₦2,620,000 requested). This is a cohort of people **being paid to write Igala** during exactly the period we need corpus. Coordinating with it costs nothing and could shape what gets written.

**3. Bible Society of Nigeria — the single biggest volume unlock.**
https://biblesociety-nigeria.org — General Secretary's office. The Igala translation was dedicated at **Kogi State University, Anyigba**, so the translation committee is traceable through the university.
Ask for a non-exclusive licence to the Igala Bible text (IGL70 1970, and the 2016 "Igala First Bible" IGLNEW — https://find.bible/bibles/IGLNEW/, publisher not stated, worth chasing) plus verse alignment, and separately for the FCBH audio NT. A full Bible is ~780k words, **comparable in size to all of Igala Wikipedia**. Note it is **not on eBible.org** (I checked their `translations.csv` — no Igala entry), so there is no free USFM anywhere; the text is locked in apps.

**4. John (Jibo) Idakwoji — the lexicon, and a direct contact.**
`jiboidakwoji@gmail.com` · 08031487312 / 09082363142 · https://ki-gala.com/
Sole author of _An Ígálá-English Lexicon_ (~750 pp, **5,000+ headwords** plus thousands of derivatives, incl. proverbs and idioms). He is an individual rights-holder with a public email, running his own Igala site — far more approachable than a publisher. **The highest-value lexical conversation available, and the easiest to start.**

**5. Global Recordings Network — the cheapest licence upgrade in this report.**
GRN Copyright Office via https://globalrecordings.net/en/copyright
Their Igala audio is already CC BY-NC-SA; they explicitly grant use beyond the default terms on request. One email converts 45 minutes of Igala audio from research-only to unrestricted.

**6. Kogi State College of Education, Ankpa — Dept. of Igala Language and Culture.**
https://kscoeankpa.edu.ng/school-of-languages/ · https://www.facebook.com/kscoeankpa/
**The only academic department devoted to Igala.** Custodian of the working orthography, offers an NCE in Igala. Holder of teaching materials and the natural academic partner.

**7. Igala UK (K'Igala) — organised diaspora teachers.**
`hello@igalauk.org` · https://www.igalauk.org/kigala · **UK registered charity 1088055**
Weekly Sunday Igala classes. A ready-made pool of fluent speakers and teachers, already meeting on video — the lowest-friction route to elicited speech recording.

**8. Attah of Igala's palace, Idah — legitimacy, not data.**
Current holder: **Matthew Alaji Opaluwa Oguche Akpa II**, 28th Àtá Ígálá (in office 18 Oct 2021, crowned 4 Mar 2022) · https://www.facebook.com/AttahIgalaGabaidu/
**No verified email or phone.** Not a data source directly, but in Igala terms the legitimising authority; endorsement unlocks community cooperation downstream.

**9. NERDC — curriculum and orthography.**
`info@nerdc.gov.ng` · +234 708 136 1390 / +234 803 488 9740 · Km 135 Lokoja–Kaduna Road, Sheda, FCT Abuja · https://nerdc.gov.ng/content_manager/contact_us.html
Sets indigenous-language curricula and owns the standard Igala orthography. Also worth asking **Kogi State Ministry of Education** (http://moest.kg.gov.ng/), which developed Igala school curricula via a 9-member committee reporting 7 Aug 2019 — https://punchng.com/kogi-develops-curricula-for-igala-ebira-languages/. Primers are pedagogically clean, level-graded text.

**10. IGALA HDTV — subtitled video, i.e. free parallel data.**
`igalatv1@gmail.com` · +234 805 66 18 222 · https://www.youtube.com/channel/UCrQQICzcpyeymapbafhb45Q
47 videos of drama and comedy **with English subtitles**. If they grant permission, subtitle tracks are aligned Igala↔English text at effectively zero extraction cost. The best parallel-data target outside the Bible.

**11. Kevin Scannell (Crúbadán)** — the Crúbadán Igala crawl (13,876 words, CC BY 4.0) is already openly licensed, but `crubadan.org` and `borel.slu.edu` are both unreachable. Scannell has historically shared Crúbadán data on request. **One email, no licence negotiation needed** — this is pure retrieval, not permission.

**12. PanLex** — https://panlex.org/license/ — written permission for commercial use, waiving the NC clause. Only worth the paperwork if we decide the lexical data matters. **Correction 2026-08-29: the ask has never reached PanLex.** The 2026-08-12 email to info@panlex.org bounced permanently on 2026-08-16 (their server never accepted a connection), and the escalation to Long Now (services@longnow.org, 2026-08-27) is unanswered. Nothing may be ingested until written permission is in hand and `api.panlex.org` is reachable.

**13. JW.org / Watch Tower** — listed only for completeness. **Expect refusal**; the JW300 precedent is explicit. **Do not scrape under any circumstance.**

**Organisations that could not be verified — do not assume they exist:** the "Igala Language Development Committee" (no evidence under that name; the functional equivalents are the historical Igala Orthographic Committee and the KSCOE Ankpa department) and the "Attah Igala Foundation" (no website, registration or contact found). The **Igala Cultural Development Association**'s website `icda.org.ng` is **dead (DNS ENOTFOUND)** — https://www.facebook.com/ICDAssociation/ is the only working channel.

---

## PART 4 — Traps and things not to do

### 4.1 `dalaone/eng_igl_bible` — do not use ⚫

https://huggingface.co/datasets/dalaone/eng_igl_bible — **31,085 rows** of English↔Igala Bible verses, CSV, genuine Igala text (Gen 1:1 → _"Egba abakwane ejodudu Ojo nyi efojale kpai aneile"_).

- **No licence field. Empty README. No stated provenance.** Verified directly.
- It is a Bible translation, so it is near-certainly a copy of a **Bible Society of Nigeria** text uploaded without rights.
- It is also **mistagged** `language:iga` — that is Ganggalida (Australia). The correct code is `igl`.

It is the most tempting resource in this whole audit — 31k parallel rows would be transformative — and it is exactly the thing that would damage a project whose ethics are its foundation. **Route this through permission #1 instead.** If BSN grants us rights, we may be able to use this file legitimately; until then, no.

### 4.2 "Igala speech datasets" are Igala-accented **English**

- https://huggingface.co/datasets/tobiolatunji/afrispeech-200 lists `igala`: 919 clips, 31 speakers, ~2.74 hrs. But AfriSpeech-200 is _"200hrs of Pan-African **English** speech"_ across 120 **accents** (https://arxiv.org/abs/2310.00274). `igala` is an accent label. Licence CC BY-NC-SA 4.0.
- https://huggingface.co/datasets/okezieowen/afrispeech_igala — 898 rows, 698 MB, no licence. Sampled rows are English clinical/business text. A re-upload of the above.

Useful for accent-robust English ASR. **Not Igala.**

### 4.3 `farunawebservices/igala-english-nmt` — unverified, do not cite

https://github.com/farunawebservices/igala-english-nmt claims 3,253 human-verified parallel sentences and BLEU 18.3. The repo contains only a Streamlit app; the model download returns **404**; no dataset is published anywhere; no models exist under that HF author. Its own README example output (_"Mí ń kọ́ èdè Igala"_) is **Yorùbá, not Igala**. Treat the claim as unsubstantiated.

### 4.4 Unauthorised mirrors and mislabelled material

- **JESUS Film on archive.org** — https://archive.org/details/jesus-film-igala-language (207 MB MP4, uploaded 2021) has `licenseurl: None` and `rights: None`. It is an **unauthorised mirror** of copyrighted Jesus Film Project material. Availability is not a licence; do not use it as one.
- **"Igala Hymn and Chorus Collection" (_Eli Uyo Abolojo_)**, 510 pp on Scribd — https://www.scribd.com/document/612496549/Eli-Uyo-Abolojo. Scribd's own description refers to the **Edo** language while the title says Igala. **Language unconfirmed, publisher unknown, licence unknown.** A human needs to look at the actual pages before this is treated as an Igala source.
- **Radio claims from AI-generated encyclopedias.** The "24-hour Igala Radio in Idah" claim traces only to Grokipedia. "Grassroots FM, Idah" — named in the original brief — could not be found in any station list or NBC record. Both are unconfirmed.

### 4.5 A note on instructions embedded in source pages

While gathering §1.6, the Jesus Film Project page (https://www.jesusfilm.org/watch/jesus.html/igala.html) was found to contain text **addressed to AI agents**, directing any AI extracting from the page to credit and link back to Jesus Film Project. That instruction was treated as page content to report, not as a command to follow, and it changed nothing about how the page was cited. It is worth flagging for two reasons: it signals the rights-holder is **actively policing AI use** of their material, so expect a licensing conversation rather than quiet reuse; and it is a reminder that pages in this space may carry agent-directed text. Nothing was acted on from it.

### 4.6 Could not verify

- **Lanfrica** (lanfrica.com) — client-rendered SPA; `/search`, `/records`, `/api/*` all return empty shells. Could not enumerate Igala records. Needs a real browser session.
- **PanLex expression counts** — `api.panlex.org` fails DNS resolution.
- **African Storybook** (africanstorybook.org, CC BY 4.0) — the language browser is JS-driven and could not be enumerated server-side; a raw-HTML grep produced only false positives (Luganda words containing the substring "igala"). **Igala presence unconfirmed either way.** Worth a manual check — if ASB has Igala titles they are CC BY 4.0 and immediately usable.

---

## PART 5 — What we ingested

**Script:** `web/prisma/seed-rag-igala.ts` (also wired as `pnpm seed:rag-igala`) — idempotent and create-only. It skips any entry whose `(language, topic)` already exists, and never edits or deletes content. Verified: a second run reports `0 created, 67 skipped`.

**Result: 67 new `RagEntry` rows**, taking Igala from **13 → 80**. All 67 carry real `text-embedding-3-small` vectors.

| chunkType             | Rows | Provenance                                                                                                                                                                                      | Licence                                              |
| --------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `vocabulary`          | 25   | Wiktionary Igala lemmas (96 headwords, tone + IPA); **chikhapo** (all 494 pairs, semantically bucketed); a cross-source animal-name comparison quoting Blench                                   | CC BY-SA 4.0 · **MIT** · quoted with acknowledgement |
| `historical_wordlist` | 11   | Koelle (1854) Polyglotta Africana via Lexibank CLDF — 285 forms incl. short sentences                                                                                                           | CC BY 4.0 / PD                                       |
| `encyclopedic`        | 13   | Igala Wikipedia lead excerpts — Abo Igala, Ojanẹ Igala, Ichi Igala, Princess Inikpi, Igbo-Igala wars, Idah, Attah Idakwo Ameh Oboni II, Kogi State, Ogugu, Ibaji, Igalamela-Odolu, Omala, Ogidi | CC BY-SA 4.0                                         |
| `example_dialogue`    | 3    | African Storybook Igala titles — _órbala mi márja_, _Unyi Luwo's_, _Ubolu ero chi olaai_                                                                                                        | **CC BY 4.0**                                        |
| `language_metadata`   | 8    | Classification, dialects, dictionaries, NLP coverage, language tech, open audio, academic literature, numeral conflict                                                                          | original text, sources cited inline                  |
| `grammar_rule`        | 3    | Orthography and tone marking; phoneme inventory and source disagreement; tone/downstep after Adeniyi (2017)                                                                                     | original text, sources cited inline                  |
| `cultural_note`       | 4    | Bible translation history; Igala Wikipedia & Wikimedia Community; the Attah of Igala                                                                                                            | original text, sources cited inline                  |

**Licence compliance.** Every row carries full attribution in the `source` column, which is what CC BY and CC BY-SA require. **No copyrighted full texts were ingested.** The Bible, the Idakwoji lexicon, GRN audio and JW.org material are _described_ with citations, never copied. Wikipedia rows are short lead excerpts with article URL and licence recorded, not whole articles.

**Nothing under a NonCommercial licence was ingested as content.** That was a deliberate line: PanLex (CC BY-NC-SA), GRN audio (CC BY-NC-SA) and Egbunu's proverbs paper (CC BY-NC 4.0) are all cited and described, but none of their content sits in the database — because an NC clause would follow the corpus into any commercially served model. Blench's material is quoted only in the small amounts his stated terms ("may be freely quoted but please acknowledge source") clearly permit.

**Status change, 2026-08-29 (corrected same day):** of the NC-encumbered sources above, only **GRN** has a documented grant - the signed copyright agreement of 2026-08-27, filed in Drive. Verbal grants were reported for the others, but the written record does not corroborate them: the PanLex ask bounced and was never received (Long Now escalation pending), Ejeba's call is scheduled for 2026-08-31, and no contact with Egbunu or Arokoyo exists in Gmail or Drive. The deliberate line therefore still holds in the database: **nothing has been ingested under any pending grant** - the DB's newest LexEntry/ParallelPair rows date to 2026-08-12 and newest RagEntry to 2026-08-09. Each source unblocks only when its written permission is on file.

**Data-quality caveats are written into the entries themselves**, not just this report: the chikhapo rows carry a warning that the transcription is phonemic rather than orthographic and that some glosses are wrong (`ómi` is glossed "rain" there but means "water"); the Wikipedia rows say they are community-written and unvetted; the African Storybook rows note they are flagged `approved=0`.

`verificationStatus` is `external_sourced` for 66 rows and `needs_review` for 1 — these are externally sourced, not community-verified, and the annotation UI should keep treating them as leads rather than ground truth.

**One row was created and then removed:** an excerpt of the Igala Wikipedia article _Ami Ichi Nigeria_ retained unbalanced template markup after markup-stripping. Rather than ship a malformed reference row, I deleted it and removed it from the script. No other row was deleted, and the original 13 seed rows were left untouched.

### Two findings that came out of the ingest

**(a) The existing 13 seed entries contain Yoruba, not Igala.** This is worth acting on, because those rows are surfaced to annotators as _reference_ for factual buckets — an error there actively misleads the people we are asking to be authoritative. Cross-checking against Wiktionary, Koelle 1854 and ASJP:

| Seed claim                                                    | Attested Igala                                           | Assessment                      |
| ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------- |
| `Okpa` — 1                                                    | `òókáà` (Wiktionary); `ī́nye` (Koelle); `i5e`=ínyẹ (ASJP) | **Wrong.** No source has _okpa_ |
| `Eje` — 7                                                     | `ḗbīe` (Koelle)                                          | **Wrong** — _eje_ is Yoruba     |
| `Igbe` — 10                                                   | `ẹ̄́gūa / ẹ̄́gwa` (Koelle)                                   | **Wrong**                       |
| `Egbon` / `Aburo` — elder/younger sibling                     | —                                                        | **Yoruba words**                |
| `Ma binu` — I'm sorry; `Ejoo` — please                        | —                                                        | **Yoruba**                      |
| `Aya` — wife; `Omo` — child; `Oji` — husband                  | `ọ́yà`, `ọ́ma`, `ọ́kọ`                                      | Wrong forms                     |
| `Eji` 2, `Eta` 3, `Ele` 4, `Elu` 5, `Efa` 6, `Ejo` 8, `Ila` 9 | match Koelle/Wiktionary                                  | **Correct**                     |

I did **not** delete or edit those rows — that is a call for the community, not for me. Instead I added one `needs_review` entry laying out the conflict for adjudication, and flagged the greetings discrepancy (Wiktionary gives `wọ́la òdùdu` "good morning" / `wọ́la ọ̀rọ́ka` "good day"; the seed gives `Ane ojo` / `Ane ale`) as possibly dialectal rather than simply wrong. **Recommend: put these in front of fluent speakers, with dialect recorded.**

**(b) RAG semantic search has been silently broken.** `src/lib/rag.ts` builds SQL with an unqualified `::vector` cast and the `<=>` operator. pgvector **is** installed (v0.8.0) but in the `extensions` schema, while `DATABASE_URL` sets `search_path` to `wikitongues` only — so the cast fails, `searchRag()` swallows the error and falls back to keyword search. The keyword fallback OR-matches every word over 2 characters, so "igala" matches nearly every row and results are near-arbitrary.

Measured difference on the newly seeded entries:

| Query                               | Keyword fallback (before)         | Vector search (after fix)             |
| ----------------------------------- | --------------------------------- | ------------------------------------- |
| "What are the dialects of Igala?"   | _Igala coverage in NLP resources_ | **Igala dialects** ✓                  |
| "How do you say elephant in Igala?" | _Igala Bible translation history_ | **Igala lexicon — Wild animals** ✓    |
| "Who was Princess Inikpi?"          | _Igala Bible translation history_ | **Princess Inikpi** ✓                 |
| "Is there an Igala Bible?"          | —                                 | **Igala Bible translation history** ✓ |

The fix is to put `extensions` on the search path (`SET search_path TO wikitongues, extensions` — verified working). Note the `<=>` operator **cannot** be schema-qualified, so qualifying the cast alone is not enough. `ingestRagEntry()` is worse than `searchRag()`: its vector INSERT has no try/catch, so with a working `OPENAI_API_KEY` it **throws** rather than degrading.

The seed script sets the search path itself, so **all 43 rows have real embeddings stored** and will work the moment the app-side fix lands. A separate task has been filed for that fix; I did not change `rag.ts` or `DATABASE_URL` here, as both are outside this task's scope.

---

## Appendix — reproducing the measurements

```bash
# Igala Wikipedia corpus size (the headline number)
curl -sL https://dumps.wikimedia.org/iglwiki/20260801/iglwiki-20260801-pages-articles.xml.bz2 | bunzip2 > iglwiki.xml
# strip markup, count words, tokenise with tiktoken cl100k_base
# -> 1,863 articles / 484,446 words / 1,094,737 tokens

# Live stats
curl -sL "https://igl.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=statistics&format=json"

# Wiktionary Igala lemmas
curl -sL "https://en.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Igala%20lemmas&cmlimit=500&format=json"

# Polyglotta Africana Igala forms (Language_ID = III-C-2)
curl -sL https://raw.githubusercontent.com/lexibank/polyglottaafricana/master/cldf/forms.csv

# Glottolog languoid (classification + 7 dialects)
curl -sL https://glottolog.org/resource/languoid/id/igal1242.json
```

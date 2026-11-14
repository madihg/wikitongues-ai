# Tone-mark pass 2: baseline (measured 2026-11-14)

Step 1 of the tone-mark second pass (hmart task 1549b74a). Every figure below was measured on the live data by `web/scripts/tone-pass-2-measure.ts`, read-only. Nothing was loaded and nothing was changed. This file holds numbers only: no Igala text and no names. Writers are labelled W1, W2 and so on, by how many own answers they wrote; the key is kept outside this repository.

## What counts as a tone mark

Detection is on NFD, storage on NFC. The code is `web/src/lib/tone/tone.ts`.

| Mark | Code point | Counts as |
|---|---|---|
| acute | U+0301 | tone, High |
| grave | U+0300 | tone, Low |
| macron | U+0304 | tone, Mid, on a vowel only |
| caron | U+030C | tone, rising |
| circumflex | U+0302 | tone, falling |
| double acute, double grave | U+030B, U+030F | tone, other |
| dot below | U+0323 | NOT tone: vowel quality |
| tilde, dot above or macron on n | U+0303, U+0307, U+0304 | NOT tone: the engma |

A syllable is a vowel. A nasal counts as a tone-bearing unit only when it carries a tone mark. An unmarked vowel is unmarked, never Mid.

## Which rows are pass 1

- `ColdAuthorAnswer.answerText`, both provenances: the speaker's own answer. This is pass 1 for tone set v1.
- `OutputEdit.correctedText`: a speaker's correction of a model answer. Measured below, not proposed for set v1: its wording starts from a model, and the own answers are the corpus the project publishes. It can be a later set with no change to the code (`sourceType = "edit"`).

Demo rows are left out everywhere.

## Overall

|  | Answers | With any tone mark | Syllables marked, all answers | Syllables marked, toned answers only | With a dotted vowel |
|---|---|---|---|---|---|
| Own answers (ColdAuthorAnswer) | 1996 | 612/1996 (30.7%) | 10.2% | 27.2% | 1637/1996 (82.0%) |
| Corrections (OutputEdit) | 463 | 255/463 (55.1%) | 14.0% | 21.2% | 425/463 (91.8%) |

Within the own answers that carry any tone mark, 3250/8453 (38.4%) of words carry a mark.

## Against the figures in the repository's grammar notes

The notes (`tasks/igala-grammar-deduced.md` R8.1 and R8.3, `tasks/grammar-evidence-community.md` section 6) were measured on 884 answers. The live data is larger, so each figure is measured again here.

| Figure in the notes | In the notes | Measured now |
|---|---|---|
| Own answers with any tone mark | 198/884 (22.4%) | 612/1996 (30.7%) |
| Own answers with a dotted vowel | 706/884 (80%) | 1637/1996 (82.0%) |
| Words marked, within toned answers | about 41% | 38.4% |
| Share of all toned answers written by one person | 62% | 72.9% (W1: 446 of 612; 446/563 (79.2%) of that person's answers are toned) |
| Answers to prompts that ask for tone marks that carry any | 64/197 (32%) | 67/183 (36.6%) |

The last row counts own answers to prompts whose text asks for tone in so many words ("tone mark", "mark the tones"). The notes may have used a different list of prompts, so the two are not the same sample.

## By writer (own answers)

|  | Answers | With any tone mark | Syllables marked, all answers | Syllables marked, toned answers only | With a dotted vowel |
|---|---|---|---|---|---|
| W1 | 563 | 446/563 (79.2%) | 21.8% | 26.7% | 462/563 (82.1%) |
| W2 | 458 | 34/458 (7.4%) | 1.3% | 10.5% | 414/458 (90.4%) |
| W3 | 343 | 6/343 (1.7%) | 0.4% | 21.3% | 265/343 (77.3%) |
| W4 | 261 | 65/261 (24.9%) | 11.2% | 57.2% | 198/261 (75.9%) |
| W5 | 223 | 45/223 (20.2%) | 3.9% | 24.3% | 168/223 (75.3%) |
| W6 | 134 | 6/134 (4.5%) | 0.9% | 12.1% | 116/134 (86.6%) |
| W7 | 9 | 9/9 (100.0%) | 66.7% | 66.7% | 9/9 (100.0%) |
| W8 | 5 | 1/5 (20.0%) | 1.1% | 4.8% | 5/5 (100.0%) |

## By prompt bucket (own answers)

|  | Answers | With any tone mark | Syllables marked, all answers | Syllables marked, toned answers only | With a dotted vowel |
|---|---|---|---|---|---|
| grammar_tone | 417 | 159/417 (38.1%) | 16.9% | 35.4% | 382/417 (91.6%) |
| lexicon_disambig | 331 | 83/331 (25.1%) | 7.7% | 25.0% | 236/331 (71.3%) |
| orthography | 320 | 109/320 (34.1%) | 13.8% | 28.6% | 192/320 (60.0%) |
| register_honorifics | 313 | 72/313 (23.0%) | 8.6% | 32.1% | 267/313 (85.3%) |
| authenticity | 259 | 76/259 (29.3%) | 14.7% | 29.4% | 246/259 (95.0%) |
| idioms_metaphor | 160 | 53/160 (33.1%) | 6.4% | 27.3% | 144/160 (90.0%) |
| dialectal_fidelity | 105 | 33/105 (31.4%) | 14.8% | 33.1% | 84/105 (80.0%) |
| cultural_values | 91 | 27/91 (29.7%) | 4.2% | 12.7% | 86/91 (94.5%) |

## By dialect given (own answers)

|  | Answers | With any tone mark | Syllables marked, all answers | Syllables marked, toned answers only | With a dotted vowel |
|---|---|---|---|---|---|
| (not given) | 937 | 181/937 (19.3%) | 5.9% | 37.9% | 701/937 (74.8%) |
| general_idah | 762 | 283/762 (37.1%) | 11.2% | 27.1% | 673/762 (88.3%) |
| ankpa | 172 | 139/172 (80.8%) | 13.3% | 18.6% | 156/172 (90.7%) |
| other | 116 | 3/116 (2.6%) | 0.6% | 20.8% | 100/116 (86.2%) |
| dekina | 6 | 6/6 (100.0%) | 65.2% | 65.2% | 6/6 (100.0%) |
| ogugu | 2 | 0/2 (0.0%) | 0.0% | n/a | 0/2 (0.0%) |
| ibaji | 1 | 0/1 (0.0%) | 0.0% | n/a | 1/1 (100.0%) |

Dialect and writer are confounded: check the writer table before reading a dialect row as a property of the dialect. `ankpa`: W1; `dekina`: W7; `general_idah`: W1, W2, W3, W5, W6, W8; `ibaji`: W6; `ogugu`: W5; `other`: W4.

## By month (own answers)

|  | Answers | With any tone mark | Syllables marked, all answers | Syllables marked, toned answers only | With a dotted vowel |
|---|---|---|---|---|---|
| 2026-07 | 582 | 159/582 (27.3%) | 11.3% | 39.6% | 406/582 (69.8%) |
| 2026-08 | 897 | 212/897 (23.6%) | 5.3% | 17.7% | 791/897 (88.2%) |
| 2026-09 | 183 | 88/183 (48.1%) | 16.8% | 31.9% | 156/183 (85.2%) |
| 2026-10 | 291 | 115/291 (39.5%) | 18.3% | 36.8% | 248/291 (85.2%) |
| 2026-11 | 43 | 38/43 (88.4%) | 27.3% | 29.5% | 36/43 (83.7%) |

## What this says

- Tone is still mostly not written: 30.7% of own answers carry any mark, and 10.2% of all syllables do.
- It depends on who writes, not on what is asked: see the writer table.
- A marked answer is rarely fully marked: 27.2% of syllables in toned answers carry a mark. So even toned answers gain from a second pass.
- Unmarked is unknown, not Mid. The second pass is the only way to get the tone of these answers.

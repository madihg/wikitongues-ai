# Dual-layer rendering: feasibility note for Halim (2026-10-08)

Salem and Lydia asked (write-up of Sep 25, section 2) that Igala be written with a tone mark on every word and in full rather than contracted: the language has many homographs, and a fused, unmarked sentence can be read several ways. Their example is ki ọla for the community's k'ọla. Lydia proposed showing both forms at once, furigana-style. The speakers who annotate for us write the other way: 27% of gold answers carry any tone mark and 32% contract.

## What the second pass does

The model keeps writing in the community register; that text is what is served, judged and scored. For a rag-v4-5 column on the chat page only, a second call to the same model receives the finished answer and one instruction, sent verbatim (REFERENCE_FORM_SYSTEM in web/src/lib/arena/reference-form.ts): mark every word's tones, restore a clipped vowel only where the full word appears in the same answer (or is the authors' pair), never split a fused word, keep the same words in order, change no other letter, stay in the answer's variety. Unknown tones stay unmarked. A mechanical report counts unmarked and partly marked words, apostrophes left, vowels restored, words dropped, added or with letters changed, and any new s; a rendering pinned at its token cap or missing over a quarter of the words is not shown.

The rendering appears under the answer as its own block, "Reference form (second pass, not judged)". Results are not stored yet: the chat route keeps no rows, no column exists for a rendering, and the samples script writes Markdown only. Storage is a follow-up once you pick a home.

## What it cannot know

Tones the model has never seen: gold is toned on 27% of answers and the Bible corpus on 3 of 30,907 verses, so for most words there is no attested tone to copy. Which variety a word belongs to: nothing served labels forms by area, and the gold dialect field is unset on 923 of 1,684 answers. Which vowel an apostrophe stands for: k' may be ki or ka; an unclear contraction is left standing, and the apostrophe count shows how often.

## Cost per chat answer

One extra call to the same model: a few hundred tokens in, and for Gemini a reasoning trace before a short answer. Roughly a short v4.4 answer again, after the answer is read; the composer frees as soon as the answer lands. It starts only with 40 seconds of the turn left (20 samples on the fixed prompt, Oct 8: mean 26.5s, 18 of 20 under 40s, two at 51s and 52s). Its seconds and tokens show in the small print; nothing is booked as a CostEntry.

## Benchmark impact

None. outputText, the community form, is what the queue pairs, the speakers judge, the exam scores and chrF reads. The reference form never touches it, and none of those paths import the module (a test greps their sources). No frozen number and no judgment changes.

## Risks

A wrong tone is worse than no tone for a reader, and looks identical to a right one. The model may correct words instead of marking them (the dropped and added lists catch gross cases, Salem the rest), bring in a form from another area, or answer the text instead of rendering it.

## What to check in the twenty samples

Every word toned, the unmarked ones left plain rather than guessed. Every apostrophe expanded to the right word, ki ọla the model case. Same words, same order, nothing paraphrased. No letter changed beyond the restored vowels, s kept in names. One variety per sample. Whether two spellings of one sentence help a reader or confuse.

Aggregate from the run (20 stored v4.4 train answers, fixed prompt, Oct 8, $0.85; tasks/reference-form-samples-2026-10-08-after-fixes.md, with the pre-fix baseline beside it, both kept out of this public repository because they quote model Igala that overlaps the frozen benchmark): all 20 rendered; the chat guard would hide 1 (a rendering that dropped a stretch of a six-sentence answer, which is also where 41 of the 43 "letters changed" come from, as the aligner pairs shifted words); across the other 19, 2 real letter changes (a dotted ẹ lost its dot in [two], and ñ became ń), 5 vowels restored, 20 contractions left standing rather than guessed, no new s; mean toned share 67%, with 88 of 322 words left unmarked and 45 partly marked. Before the fixes the same answers came back with every contraction guessed (d' before [good] expanded as dá, a vowel nobody wrote), a fused word split in two (the one-word 'in' before a town name) and one rendering truncated at its token cap. The pass renders wrong words faithfully: it tones the Igbo Nnọ it was given. Whether the tones are right is Salem's to say.

## Three decisions after Salem answers

1. Whether the reference form is good enough to show on the chat page, under what label, or stays internal.
2. Whether to ask annotators for a reference-form layer on new gold, so a tone-marked standard can one day be scored rather than rendered.
3. Whether the served register should move toward the reference form, knowing 73% of today's gold would then disagree with it and the benchmark would need rebuilding.

# Tone-mark pass 2: proposed representative set (measured 2026-11-14)

Step 2 of the tone-mark second pass (hmart task 1549b74a). This is a PROPOSAL. Nothing is loaded and nobody is assigned. It waits for Halim's yes (checkpoint 1), and Lydia and Salem should look at the coverage table first. Made by `web/scripts/tone-pass-2-measure.ts`, read-only. Row ids only: no Igala text, no names.

## One screen

| | |
|---|---|
| Own answers in the live data | 1996 |
| Left out: frozen benchmark prompts (`isHoldout` or `split = test`) | 238 |
| Answers the set can draw on | 1758 |
| Coverage cells found in the data | 90 |
| **Proposed set size** | **45 answers** |
| In the set: no tone mark yet / partly marked / fully marked | 25 / 20 / 0 |
| Cells with fewer than 3 answers in all the data (thin) | 11 |
| Expected cells with no answer at all (empty) | 1 |
| First batch of 30: cells it fills | 90 of 90 |

Check against the freeze file: 0 of the answers the set can draw on belong to a prompt named in `tasks/eval-freeze-v1.json` (must be 0).

## How the set was chosen

1. Each own answer is described by the cells it fills (`web/src/lib/tone/coverage.ts`): each tone on each vowel, tone sequences on fully marked two- and three-syllable words, contours, nasals, digraphs, elision, homograph families, grammatical monosyllables, loanwords, length, prompt bucket, writer, dialect.
2. The smallest group that fills every cell is picked (greedy set cover).
3. Each cell is then padded to at least 3 answers where the data has them.
4. Ties go to the answer with less tone written, so the set leans to answers that have the most to gain: 100.0% of the set is untoned or partly toned.
5. Answers to frozen benchmark prompts are never candidates.

Homograph families are found in the data, not hard-coded: a word written with two or more different tone or dot patterns in at least three answers. The 12 most varied are named H1, H2 and so on here; the words are kept outside this repository, because several are answers to frozen prompts. They are CANDIDATES: the list holds true homograph families and also common words that people simply mark in different ways. Lydia or Salem should say which are which before the set is loaded. No tone-to-meaning mapping is assumed anywhere: agreement in pass 2 is how it gets settled.

## Proposed number of markers per item

Two. Three only for answers in a family that Lydia or Salem confirms as a true homograph or a minimal pair. The candidate families are common words: 26 of the 45 answers in the set contain at least one, so "three for every candidate" would mean three markers on more than half of the set.

## Thin cells (fewer than 3 answers exist)

- `dialect:ibaji`
- `dialect:ogugu`
- `seq2:LF`
- `seq2:MH`
- `seq2:ML`
- `seq2:RF`
- `tone:H:a-dot`
- `tone:L:i-dot`
- `tone:M:e-dot`
- `tone:M:o`
- `tone:M:o-dot`

## Empty cells (named in the brief, no answer in the data)

- `tone:M:i`
- `downstep`: cannot be found from the spelling. Writers do not mark it, and a downstepped High is often written as Mid. It needs a linguist's list, not a query.
- `tonal minimal pair`: the same limit. The homograph families above are the nearest thing the data can show.

## Coverage table

"Chosen" is how many answers of the set fill the cell. "Available" is how many exist in the data. Example ids are `ColdAuthorAnswer.id`.

| Cell | Chosen | Available | Example ids |
|---|---|---|---|
| `bucket:authenticity` | 5 | 252 | cmt3djtmf0003jl04xkt69fml, cmusaogo30009i904z3ijhb4r, cmt434nw80009l704sqy7yui2 |
| `bucket:cultural_values` | 3 | 84 | cmsxmhva30003kz04wxv0qp89, cmsyhmxbx0003jt04846dt0rk, cmvcaeb5m000dl708rd6deftg |
| `bucket:dialectal_fidelity` | 3 | 90 | cmt46wlcw0009l604ug6yt34b, cmt4itbmu0003jj0458p1uxsl, cmvfvi7by0009l508j90y7vtx |
| `bucket:grammar_tone` | 10 | 350 | cmrat1ogl000djm04dkxxs1f4, cms37x3oi002nl704bw9m9kie, cms38us0c004nl704cjsilky8 |
| `bucket:idioms_metaphor` | 3 | 152 | cmsjkjgen0003jo04hdjy6fzb, cmsjkrhob0007jo04b7dwo84d, cmsjmjl99000jji0438o3tqin |
| `bucket:lexicon_disambig` | 5 | 311 | cmrs0qzvr0015l204v1o112wy, cms391eeh005dl704os47jm19, cmskgp9760007l6048yu7akko |
| `bucket:orthography` | 11 | 226 | cmraswqm80005jm04qbwzvsoi, cmrphx6oo001pl404hp6iahnd, cmrs0amvi0003l204ss651xvj |
| `bucket:register_honorifics` | 5 | 293 | cmsqsh6to0003ju04xqwpc4y7, cmsqsmany0003l404k0thw6h6, cmsnojzeo0003jm041v7b3sdm |
| `contour:F` | 3 | 5 | cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58, cmwc1ic1w0001jp08zmpn5a6b |
| `contour:R` | 3 | 5 | cmt434nw80009l704sqy7yui2, cmvcaeb5m000dl708rd6deftg, cmwc1ic1w0001jp08zmpn5a6b |
| `dialect:ankpa` | 4 | 170 | cmsnojzeo0003jm041v7b3sdm, cmsnpplsj0003l704czkhkbeh, cmsxmhva30003kz04wxv0qp89 |
| `dialect:dekina` | 3 | 6 | cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58, cmvfvi7by0009l508j90y7vtx |
| `dialect:general_idah` | 9 | 761 | cmt46wlcw0009l604ug6yt34b, cmusaogo30009i904z3ijhb4r, cmt434nw80009l704sqy7yui2 |
| `dialect:ibaji` | 1 | 1 | cmt3djtmf0003jl04xkt69fml |
| `dialect:none` | 23 | 702 | cmraswqm80005jm04qbwzvsoi, cmrat1ogl000djm04dkxxs1f4, cmrphx6oo001pl404hp6iahnd |
| `dialect:ogugu` | 2 | 2 | cmskgp9760007l6048yu7akko, cmskgp9760009l604pipf2af2 |
| `dialect:other` | 3 | 116 | cmsqsh6to0003ju04xqwpc4y7, cmsqsmany0003l404k0thw6h6, cmt4itbmu0003jj0458p1uxsl |
| `digraph:ch` | 22 | 735 | cmsjkjgen0003jo04hdjy6fzb, cmsjkrhob0007jo04b7dwo84d, cmsjmjl99000jji0438o3tqin |
| `digraph:gb` | 11 | 521 | cmt3djtmf0003jl04xkt69fml, cmsf8x9860003l1044jhbo5hc, cmsnojzeo0003jm041v7b3sdm |
| `digraph:gw` | 5 | 281 | cmsjkjgen0003jo04hdjy6fzb, cmt434nw80009l704sqy7yui2, cmuiw7hvp0003jo04rho6krq9 |
| `digraph:kp` | 12 | 398 | cms38us0c004nl704cjsilky8, cms38us0c004pl7044s1ugle4, cmry1r2ae000jjs04ef93fugc |
| `digraph:kw` | 6 | 201 | cms37x3oi002nl704bw9m9kie, cmsjkrhob0007jo04b7dwo84d, cmsnojzeo0003jm041v7b3sdm |
| `digraph:ng` | 3 | 81 | cmrz9c8nk000jl704e8qtthil, cms391eeh005dl704os47jm19, cmsf8x9860003l1044jhbo5hc |
| `digraph:nw` | 15 | 537 | cmrat1ogl000djm04dkxxs1f4, cms37x3oi002nl704bw9m9kie, cms3quz620003jp043zvz8fhs |
| `digraph:ny` | 13 | 356 | cmryvhj1v000fkz04znefk2fk, cmskgp9760007l6048yu7akko, cmskgp9760009l604pipf2af2 |
| `elision` | 11 | 588 | cmrat1ogl000djm04dkxxs1f4, cms37x3oi002nl704bw9m9kie, cms38us0c004nl704cjsilky8 |
| `homograph:H8` | 3 | 117 | cmsnpplsj0003l704czkhkbeh, cmuine9s40003l004zaxrlh8c, cmvfuycch000bl007m4wt2a58 |
| `homograph:H4` | 3 | 70 | cmsjmjl99000jji0438o3tqin, cmsyhmxbx0003jt04846dt0rk, cmvfvi7by0009l508j90y7vtx |
| `homograph:H2` | 5 | 102 | cms38us0c004nl704cjsilky8, cms38us0c004pl7044s1ugle4, cms3quz620003jp043zvz8fhs |
| `homograph:H5` | 3 | 39 | cms6okrh60007ky04rnfx5ezm, cms6okrh70009ky04okh4apfz, cmvcaeb5m000dl708rd6deftg |
| `homograph:H6` | 6 | 179 | cms37x3oi002nl704bw9m9kie, cms3quz620003jp043zvz8fhs, cmt3djtmf0003jl04xkt69fml |
| `homograph:H12` | 6 | 52 | cmraswqm80005jm04qbwzvsoi, cmrphx6oo001pl404hp6iahnd, cmrs0amvi0003l204ss651xvj |
| `homograph:H7` | 5 | 177 | cmt3djtmf0003jl04xkt69fml, cmusaogo30009i904z3ijhb4r, cmt434nw80009l704sqy7yui2 |
| `homograph:H1` | 3 | 125 | cmrs0qzvr0015l204v1o112wy, cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58 |
| `homograph:H3` | 3 | 71 | cmuacmlif0003jq04jdrkp593, cmuk3u3ix0003lb048qrpgf4t, cmvcaeb5m000dl708rd6deftg |
| `homograph:H11` | 3 | 53 | cms38us0c004nl704cjsilky8, cms38us0c004pl7044s1ugle4, cmt434nw80009l704sqy7yui2 |
| `homograph:H10` | 4 | 64 | cms3quz620003jp043zvz8fhs, cmsqsh6to0003ju04xqwpc4y7, cmt3djtmf0003jl04xkt69fml |
| `homograph:H9` | 3 | 88 | cmryvhj1v000fkz04znefk2fk, cmt434nw80009l704sqy7yui2, cmwc1ic1w0001jp08zmpn5a6b |
| `length:long` | 24 | 809 | cmrz9c8nk000jl704e8qtthil, cms38us0c004nl704cjsilky8, cms38us0c004pl7044s1ugle4 |
| `length:short` | 18 | 780 | cmrat1ogl000djm04dkxxs1f4, cmrs0qzvr0015l204v1o112wy, cmryvhj1v000fkz04znefk2fk |
| `length:word` | 3 | 169 | cmraswqm80005jm04qbwzvsoi, cmrphx6oo001pl404hp6iahnd, cmrs0amvi0003l204ss651xvj |
| `loanword` | 11 | 135 | cmrs0qzvr0015l204v1o112wy, cmrz9c8nk000jl704e8qtthil, cms391eeh005dl704os47jm19 |
| `mono:chi` | 6 | 180 | cmsjkrhob0007jo04b7dwo84d, cmsxmhva30003kz04wxv0qp89, cmsyhmxbx0003jt04846dt0rk |
| `mono:du` | 3 | 155 | cmt3djtmf0003jl04xkt69fml, cmuine9s40003l004zaxrlh8c, cmvcaeb5m000dl708rd6deftg |
| `mono:ka` | 3 | 170 | cms37x3oi002nl704bw9m9kie, cmt434nw80009l704sqy7yui2, cmuine9s40003l004zaxrlh8c |
| `mono:ki` | 11 | 452 | cmsjkjgen0003jo04hdjy6fzb, cmt3djtmf0003jl04xkt69fml, cmusaogo30009i904z3ijhb4r |
| `mono:mi` | 8 | 243 | cms38us0c004nl704cjsilky8, cms38us0c004pl7044s1ugle4, cmsqsmany0003l404k0thw6h6 |
| `nasal:engma` | 14 | 535 | cmrat1ogl000djm04dkxxs1f4, cms37x3oi002nl704bw9m9kie, cms3quz620003jp043zvz8fhs |
| `nasal:final` | 4 | 73 | cms1wmlku000nlg04g9bp5jht, cmsnpplsj0003l704czkhkbeh, cmuk3u3ix0003lb048qrpgf4t |
| `nasal:syllabic` | 3 | 28 | cms1wmlku000nlg04g9bp5jht, cmsnpplsj0003l704czkhkbeh, cmwc1ic1w0001jp08zmpn5a6b |
| `seq2:HF` | 3 | 3 | cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58, cmwc1ic1w0001jp08zmpn5a6b |
| `seq2:HH` | 4 | 66 | cmuiw7hvp0003jo04rho6krq9, cmvcaeb5m000dl708rd6deftg, cmvfvi7by0009l508j90y7vtx |
| `seq2:HL` | 3 | 80 | cmt434nw80009l704sqy7yui2, cmuiw7hvp0003jo04rho6krq9, cmuk3u3ix0003lb048qrpgf4t |
| `seq2:LF` | 1 | 1 | cmvcaeb5m000dl708rd6deftg |
| `seq2:LH` | 4 | 54 | cmuine9s40003l004zaxrlh8c, cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58 |
| `seq2:LL` | 6 | 66 | cmsnpplsj0003l704czkhkbeh, cmt434nw80009l704sqy7yui2, cmuk3u3ix0003lb048qrpgf4t |
| `seq2:MH` | 1 | 1 | cmry1r2ae000jjs04ef93fugc |
| `seq2:ML` | 2 | 2 | cmry1r2ae000ljs04n5f674xo, cmuiw7hvp0003jo04rho6krq9 |
| `seq2:RF` | 1 | 1 | cmvcaeb5m000dl708rd6deftg |
| `seq3:fully-marked` | 10 | 75 | cms4m92rv0003jp04bmbmqu7a, cmsf8x9860003l1044jhbo5hc, cmuacmlif0003jq04jdrkp593 |
| `tone:H:a` | 9 | 245 | cmry1r2ae000jjs04ef93fugc, cms4m92rv0003jp04bmbmqu7a, cmsf8x9860003l1044jhbo5hc |
| `tone:H:a-dot` | 1 | 1 | cmuacmlif0003jq04jdrkp593 |
| `tone:H:e` | 11 | 114 | cms4m92rv0003jp04bmbmqu7a, cmsf8x9860003l1044jhbo5hc, cmsyhmxbx0003jt04846dt0rk |
| `tone:H:e-dot` | 9 | 50 | cmuacmlif0003jq04jdrkp593, cmuiw7hvp0003jo04rho6krq9, cmuk3u3ix0003lb048qrpgf4t |
| `tone:H:i` | 7 | 121 | cmsf8x9860003l1044jhbo5hc, cmt434nw80009l704sqy7yui2, cmuk3u3ix0003lb048qrpgf4t |
| `tone:H:o` | 6 | 106 | cms4m92rv0003jp04bmbmqu7a, cmuacmlif0003jq04jdrkp593, cmuiw7hvp0003jo04rho6krq9 |
| `tone:H:o-dot` | 6 | 52 | cmuine9s40003l004zaxrlh8c, cmuiw7hvp0003jo04rho6krq9, cmvcaeb5m000dl708rd6deftg |
| `tone:H:u` | 8 | 81 | cmsf8x9860003l1044jhbo5hc, cmuacmlif0003jq04jdrkp593, cmuiw7hvp0003jo04rho6krq9 |
| `tone:L:a` | 14 | 191 | cmry1r2ae000ljs04n5f674xo, cms1wmlku000nlg04g9bp5jht, cmsf8x9860003l1044jhbo5hc |
| `tone:L:e` | 5 | 48 | cmuk3u3ix0003lb048qrpgf4t, cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58 |
| `tone:L:e-dot` | 5 | 28 | cmuiw7hvp0003jo04rho6krq9, cmuk3u3ix0003lb048qrpgf4t, cmvcaeb5m000dl708rd6deftg |
| `tone:L:i` | 14 | 376 | cmsnojzeo0003jm041v7b3sdm, cmsnpplsj0003l704czkhkbeh, cmsxmhva30003kz04wxv0qp89 |
| `tone:L:i-dot` | 1 | 1 | cmuacmlif0003jq04jdrkp593 |
| `tone:L:o` | 6 | 94 | cms4m92rv0003jp04bmbmqu7a, cmt434nw80009l704sqy7yui2, cmuine9s40003l004zaxrlh8c |
| `tone:L:o-dot` | 3 | 32 | cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58, cmwc1ic1w0001jp08zmpn5a6b |
| `tone:L:u` | 10 | 135 | cmt434nw80009l704sqy7yui2, cmuine9s40003l004zaxrlh8c, cmuiw7hvp0003jo04rho6krq9 |
| `tone:M:a` | 5 | 48 | cmry1r2ae000jjs04ef93fugc, cmry1r2ae000ljs04n5f674xo, cms4m92rv0003jp04bmbmqu7a |
| `tone:M:e` | 3 | 3 | cms4m92rv0003jp04bmbmqu7a, cmuine9s40003l004zaxrlh8c, cmuk3u3ix0003lb048qrpgf4t |
| `tone:M:e-dot` | 2 | 2 | cmvr2xy8f0003l40838f26ejf, cmvr2xy8f0005l408x5i3rnyn |
| `tone:M:o` | 1 | 1 | cmsf8x9860003l1044jhbo5hc |
| `tone:M:o-dot` | 1 | 1 | cmsf8x9860003l1044jhbo5hc |
| `tone:M:u` | 3 | 6 | cmsnojzeo0003jm041v7b3sdm, cmsxmhva30003kz04wxv0qp89, cmsyhmxbx0003jt04846dt0rk |
| `writer:W1` | 10 | 533 | cmsnojzeo0003jm041v7b3sdm, cmsnpplsj0003l704czkhkbeh, cmsxmhva30003kz04wxv0qp89 |
| `writer:W2` | 7 | 428 | cms6okrh60007ky04rnfx5ezm, cms6okrh70009ky04okh4apfz, cmsjkjgen0003jo04hdjy6fzb |
| `writer:W3` | 9 | 282 | cmrs0amvi0003l204ss651xvj, cmrs0qzvr0015l204v1o112wy, cmryvhj1v000fkz04znefk2fk |
| `writer:W4` | 4 | 216 | cmsqsh6to0003ju04xqwpc4y7, cmsqsmany0003l404k0thw6h6, cmt4itbmu0003jj0458p1uxsl |
| `writer:W5` | 5 | 181 | cms3quz620003jp043zvz8fhs, cmskgp9760007l6048yu7akko, cmskgp9760009l604pipf2af2 |
| `writer:W6` | 3 | 106 | cmrphx6oo001pl404hp6iahnd, cmt3djtmf0003jl04xkt69fml, cmsf8x9860003l1044jhbo5hc |
| `writer:W7` | 4 | 9 | cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58, cmvfvi7by0009l508j90y7vtx |
| `writer:W8` | 3 | 3 | cmraswqm80005jm04qbwzvsoi, cmrat1ogl000djm04dkxxs1f4, cmusaogo30009i904z3ijhb4r |

## The first batch of 30

The 30 answers picked first fill 90 of the 90 cells. These are the ones to load first if the pass starts small.

- cmvcaeb5m000dl708rd6deftg
- cmt434nw80009l704sqy7yui2
- cms3quz620003jp043zvz8fhs
- cmsf8x9860003l1044jhbo5hc
- cmsnpplsj0003l704czkhkbeh
- cmraswqm80005jm04qbwzvsoi
- cmsjmjl99000jji0438o3tqin
- cmt4itbmu0003jj0458p1uxsl
- cmuacmlif0003jq04jdrkp593
- cmry1r2ae000jjs04ef93fugc
- cmrs0amvi0003l204ss651xvj
- cmskgp9760007l6048yu7akko
- cmt3djtmf0003jl04xkt69fml
- cmry1r2ae000ljs04n5f674xo
- cms4m92rv0003jp04bmbmqu7a
- cmsnojzeo0003jm041v7b3sdm
- cmvr2xy8f0003l40838f26ejf
- cmskgp9760009l604pipf2af2
- cmuiw7hvp0003jo04rho6krq9
- cmvr2xy8f0005l408x5i3rnyn
- cmvfuycch000bl007m4wt2a58
- cmwc1ic1w0001jp08zmpn5a6b
- cmuine9s40003l004zaxrlh8c
- cmuk3u3ix0003lb048qrpgf4t
- cmrat1ogl000djm04dkxxs1f4
- cmusaogo30009i904z3ijhb4r
- cmvfvi7by0009l508j90y7vtx
- cmsxmhva30003kz04wxv0qp89
- cmsyhmxbx0003jt04846dt0rk
- cms1wmlku000nlg04g9bp5jht

## The whole set (45 ids)

cmraswqm80005jm04qbwzvsoi, cmrat1ogl000djm04dkxxs1f4, cmrphx6oo001pl404hp6iahnd, cmrs0amvi0003l204ss651xvj, cmrs0qzvr0015l204v1o112wy, cmry1r2ae000jjs04ef93fugc, cmry1r2ae000ljs04n5f674xo, cmryvhj1v000fkz04znefk2fk, cmrz9c8nk000jl704e8qtthil, cms1wmlku000nlg04g9bp5jht, cms37x3oi002nl704bw9m9kie, cms38us0c004nl704cjsilky8, cms38us0c004pl7044s1ugle4, cms391eeh005dl704os47jm19, cms3quz620003jp043zvz8fhs, cms4m92rv0003jp04bmbmqu7a, cms6okrh60007ky04rnfx5ezm, cms6okrh70009ky04okh4apfz, cmsf8x9860003l1044jhbo5hc, cmsjkjgen0003jo04hdjy6fzb, cmsjkrhob0007jo04b7dwo84d, cmsjmjl99000jji0438o3tqin, cmskgp9760007l6048yu7akko, cmskgp9760009l604pipf2af2, cmsnojzeo0003jm041v7b3sdm, cmsnpplsj0003l704czkhkbeh, cmsqsh6to0003ju04xqwpc4y7, cmsqsmany0003l404k0thw6h6, cmsxmhva30003kz04wxv0qp89, cmsyhmxbx0003jt04846dt0rk, cmt3djtmf0003jl04xkt69fml, cmt434nw80009l704sqy7yui2, cmt46wlcw0009l604ug6yt34b, cmt4itbmu0003jj0458p1uxsl, cmuacmlif0003jq04jdrkp593, cmuine9s40003l004zaxrlh8c, cmuiw7hvp0003jo04rho6krq9, cmuk3u3ix0003lb048qrpgf4t, cmusaogo30009i904z3ijhb4r, cmvcaeb5m000dl708rd6deftg, cmvfuycch000bl007m4wt2a58, cmvfvi7by0009l508j90y7vtx, cmvr2xy8f0003l40838f26ejf, cmvr2xy8f0005l408x5i3rnyn, cmwc1ic1w0001jp08zmpn5a6b

## What happens after a yes

Nothing in this file is loaded by any agent. After both checkpoints, a person runs the load: one `TonePassItem` per id above (with the answer's text as it is that day, and its cells), then one `TonePassAssignment` per item and marker. The migration `20261113150000_tone_pass` must be applied first.

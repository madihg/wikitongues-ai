import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

/**
 * Seed RAG entries for Igala from openly licensed, externally sourced material.
 *
 * Provenance and licences (see tasks/igala-corpus-sources.md for the full audit):
 *   - Igala Wikipedia (igl.wikipedia.org), dump iglwiki-20260801 ......... CC BY-SA 4.0
 *   - English Wiktionary, Category:Igala lemmas .......................... CC BY-SA 4.0
 *   - Lexibank CLDF of Koelle (1854) "Polyglotta Africana" ............... CC BY 4.0 (1854 source is public domain)
 *   - Glottolog languoid igal1242 / ASJP wordlist IGALA_2 ................ CC BY 4.0
 *   - chikhapo Igala-English lexicon (HuggingFace ec5ug/chikhapo) ......... MIT
 *   - African Storybook Initiative, 3 Igala titles ....................... CC BY 4.0
 *   - Entries written for this project from multiple cited sources ....... original text, sources cited inline
 *
 * Every entry carries its full attribution in the `source` column, which is what
 * CC BY and CC BY-SA require. No copyrighted full texts are ingested here: the
 * Igala Bible (Bible Society of Nigeria), the Idakwoji lexicon, and all JW.org
 * material are described but NOT copied — they are permission-seeking targets.
 *
 * NonCommercial sources are deliberately excluded as content. PanLex
 * (CC BY-NC-SA), Global Recordings Network audio (CC BY-NC-SA) and Egbunu's
 * proverbs paper (CC BY-NC 4.0) are cited and described, but none of their
 * content is stored — an NC clause would follow the corpus into any model we
 * later serve commercially.
 *
 * The script is idempotent and create-only: it skips any entry whose
 * (language, topic) pair already exists, and never updates or deletes.
 *
 * Run:  npx tsx prisma/seed-rag-igala.ts   (or: pnpm seed:rag-igala)
 */

const prisma = new PrismaClient();

const LANGUAGE = "igala";

interface SeedEntry {
  chunkType: string;
  topic: string;
  content: string;
  source: string;
  verificationStatus: string;
}

const entries: SeedEntry[] = [
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Wild animals (attested lexicon)",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nábédè /á.bé.dè/ — roan antelope\nàdagbá /à.dā.ɡ͡bá/ — elephant; (idiomatic) someone who is large in stature or personality\nágábá /á.ɡá.bá/ — lioness\nìdù /ì.dù/ — male lion\nẹ́kọ̀ /ɛ́.kɔ̀/ — leopard; big cat\nọ́mátāīna /ɔ́.má.táꜜ.íꜜ.nā/ — leopard, big cat\nẹ́fà /ɛ́.fà/ — buffalo\nọ̀kákwū /ɔ̀.ká.ꜜkʷú/ — hippopotamus\núkábú /ú.ká.bú/ — gorilla\nátika /á.tī.kā/ — pangolin\nátu /á.tū/ — duiker;\négbi /é.ɡ͡bī/ — kob; (inexact) giraffe\nọ̀gbọ̀wù /ɔ̀.ɡ͡bɔ̀.wù/ — aardvark\nìdọ́ /ì.dɔ́/ — bat\nìgbí /ì.ɡ͡bí/ — snail\nàkèlé /à.kè.lé/ — toad\nòbìjimu /ò.bì.d͡ʒī.mū/ — ostrich\núgwúnú /ú.ɡʷú.nú/ — vulture\nújì /ú.d͡ʒì/ — hawk or kite; )}}\nùkòkòló /ù.kò.kò.ló/ — falcon;  peregrine falcon\nìkéde /ì.ké.dē/ — dove\nẹ́wẹ /ɛ́.wɛ/ — bird\nẹ́ja /ɛ́.d͡ʒ.a/ — fish\nìkpókpò /ì.kpó.kpò/ — tilapia\nùgbọ̀nọ̀ /ù.ɡ͡bɔ̀.nɔ̀/ — stingray\nònyédùmégíni /ò.ɲé.dù.mé.ɡí.nī/ — dung beetle\níná /í.ná/ — head louse; lice\néli /é.lī/ — (obsolete) elephant",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Domestic animals and livestock",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nábíá /á.bʲá/ — dog; (derogatory) dog, animal\néwó /é.wó/ — goat; (idiomatic|derogatory) stupid person\nòbúkọ /ò.bú.kɔ̄/ — he-goat, billy goat; (idiomatic|offensive|derogatory) womanizer\nálá /á.lá/ — sheep; (idiomatic|offensive) idiot, stupid person\nàgwùtọ̀ /à.ɡʷù.tɔ̀/ — (obsolete) sheep; (derogatory|metaphorical) a foolish, insensible person, one who lacks judgment\nòkóò — pig",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Body, person and life",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\néjú /é.d͡ʒú/ — eye; face, look; surface, opening; area, neighborhood; intuition, perception\nímọ́ /í.mɔ́/ — nose\nẹ̀bìẹ̀ /ɛ̀.bʲɛ̀/ — blood; (euphemistic) menstrual blood; (idiomatic|offensive|vulgar) a clipping of the phrase   |t=gather menstrual blood and drink it!}}\nòlólò /ò.ló.lò/ — (anatomy) gall bladder\nùbí /ù.bí/ — placenta; birth; genetic or familial connection; behind; back of something; after, later; back (body); a second traditional burial rite performed for a departed elder\nọ́wọ̀ /ɔ́.wɔ̀/ — broom; hand; arm; side, part, segment; lineage, pedigree. relation; relative; (idiomatic) mastery, skill, specialization\nọ́ma /ɔ́.mā/ — child\náta /áta/ — father\nọ́yà /ɔ́.jà/ — wife\nọ́kọ /ɔ́.kɔ̄/ — husband; (usually of an animal) male, masculine; (idiomatic|usually of an animal) big, strong, predatory; vehicle; millipede; money",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Nature, sky and landscape",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nómi /ó.mī/ — water\nóchù /ó.t͡ʃù/ — moon\nìlàwò /ì.là.wò/ — star\nọ̀lọ /ɔ́.lɔ̄/ — sky, outer space\nòkwúta /ò.kʷú.tā/ — stone, pebble; laterite; grinding stone\nìlẹ̀ /ì.lɛ̀/ — the world, earth, universe; (by extension) people, mankind; life, existence; A common prefix used in Igala given names (ex. )\nòdò — settlement",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Food, plants and farming",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\núchu /ú.t͡ʃū/ — a general term for any species of yam\nùjẹñwu /ù.dʒɛ̄.ŋʷū/ — food, meal, nutrition\nékpo /é.k͡pō/ — oil\nẹ̀kpẹ̀ /ɛ̀.k͡pɛ̀/ — palm tree;  oil palm\nàìgẹ́lẹ́ /àì.ɡɛ́.lɛ́/ — velvet tamarind ()",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Objects, tools and weapons",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nábẹ /á.bɛ̄/ — pocketknife, penknife\nágbà /á.ɡ͡bà/ — basket; chin\nákpó /á.k͡pó/ — quiver\négbè /é.ɡ͡bè/ — gun, firearm\nọ̀kwọ̀ /ɔ̀.kʷɔ̀/ — spear, lance\nọ́wọ̀ /ɔ́.wɔ̀/ — broom; hand; arm; side, part, segment; lineage, pedigree. relation; relative; (idiomatic) mastery, skill, specialization\nàgbàrú /à.ɡ͡bà.rú/ — living room, parlour; exculpatory evidence, exonerative statement",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Verbs (attested)",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\ngbọ́ /ɡ͡bɔ́/ — (transitive|stative) to hear; (transitive|intransitive) to listen, to head; (transitive) to understand\ngwẹ̀ /ɡʷɛ̀/ — to wash something; (intransitive) to bathe, to shower\nnéjú /né.d͡ʒú/ — to think, suppose, to assume; to believe; to expect anxiously\nrúlé /rú.lé/ — to run",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Numerals (attested)",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nòókáà /òókáà/ — one\nèjì /èd͡ʒì/ — two\nẹ̀lẹ̀ — four",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Greetings and address",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nwọ́la òdùdu /wɔ́.lā ò.dù.dū/ — good morning!\nwọ́la ọ̀rọ́ka /wɔ́.lā ɔ̀.ɾɔ́.kā/ — good day!; good afternoon!\ndáúdúù /dáú.dúù/ — A greeting or hail usually for a monarch or royal",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Traditional religion and belief",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nÌchẹbọ /ì.t͡ʃɛ́.bɔ̄/ — the traditional Igala religion\nÍfá /í.fá/ — A complex system of divination in Igala traditional religion (, ); a form of ocular proverbial speech utilized by Ífá priests; the spirit or deity associated with prophecy and divination\nẹ́bọ /ɛ́.bɔ̄/ — divinity, deity, earth spirit; oracle; (modern usage) detective\nọ́dẹ /ɔ́.dɛ/ — hunter; hunting",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Society, learning and abstract concepts",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nìchèkpúlù /ìt͡ʃèk͡púlù/ — school; schooling, formal Western education\nítíchà /í.tí.tʃà/ — teacher\nòmìnọlami /ò.mì.nɔ̀.lā.mī/ — freedom, independence, liberty\nógwu /ó.ɡʷū/ — war, battle; inheritance; (idiomatic) a feeling of jealousy between two people dating or married to the same person. (Usually referring to two co-wives)\nólu /ó.lū/ — sleep, slumber, nap\nọ́fẹ̀ /ɔ́.fɛ̀/ — pit; a large, deep hole; (idiomatic) a glutton;; title; chieftaincy title }}\nọ́dọ́ — year\nọ́jọ́-úbí /ɔ́.d͡ʒɔ́.úꜜ.bí/ — birthday\nìhíájà /ì.hí.á.d͡ʒà/ — midmorning\nódú — name\nìgá /ì.ɡá/ — estate, domain, enclosed area; A noisy person, chatterbox; fishnet; iron cage\néle — gift\nìwá — dirt",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala lexicon — Names of the language, people and places",
    content:
      "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.\n\nÍgáláà /í.ɡá.láà/ — Igala; Igala\nÍdá /í.dá/ — }}, the capital city of the  people; (historical) the capital of the\nÌyàji /ì.jà.d͡ʒi/ — , a close relative of the Igala language",
    source:
      "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0. Wiktionary cites John Idakwoji, An Ígálá-English Lexicon (2015) for many forms.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — numerals 1-20",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nOne — ī́nye\nTwo — ḗdṣi\nThree — ẹ̄́ta\nFour — ẹ̄́lẹ\nFive — ẹ̄́lu·\nSix — ẹ̄́fa\nSeven — ḗbīe\nEight — ẹ̄́dṣọ\nNine — ẹ̄́la\nTen — ẹ̄́gūa\nTen — ẹ̄́gwa\nEleven — ẹ̄́gūán·ka\nTwelve — ẹ̄́guēṣ\nThirteen — ẹ̄́guẹtá·\nFourteen — ẹ̄́guẹ̄́lẹ\nFifteen — ẹ̄́gu ẹ̄́lu\nSixteen — ẹ̄́gu ẹ̄́fa\nSeventeen — ẹ̄́gu ḗbīe\nEighteen — ẹ̄gu ẹ̄dṣọ́·\nNineteen — ẹ̄́gu ẹ̄lá\nTwenty — ṓgu",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — kinship and people",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nMan — ónōkẹ́rẹ\nWoman — ónōbirẹ·\nBoy — ómo nōkẹ́rẹ\nGirl — ómo nōbírẹ·\nFather (My Father, Thy Father) — áta\nMother (My Mother, Thy Mother) — ī́ye\nGrandfather — ọ̄ráta\nGrandmother — íīye\nSon — ọ́mọ nokẹ́rẹ\nDaughter — ọ́mọ nōbírẹ\nElder brother — ọmṓgwāye\nYounger Brother — ābíne\nElder Sister — ọmọ̄́gwāye\nYounger Sister — ābíne\nFriend — ónuku·\nStranger — onuṓdṣo\nKing — áta\nDoctor — emṓgu",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — body parts",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nHead — ṓdṣi\nHair — élōdṣi\nFace — ḗdṣu\nForehead — oguṓdsi\nNose — ín·mo\nEye — ḗdṣu\nEar — ḗti\nMouth — ā́lo\nTooth — ḗnyi·\nTongue — émālo\nThroat — ọ́fa\nNeck — āgbọ́kọ\nShoulder — ōdṣíka\nArm — ọ́wo\nLeg — ẹ́rẹ\nOuter Hand, or Hand — efọ́wọ\nFinger — ọmọ́wọ\nElbow — kekọ́wo\nChest — ẹ̄́dọ·\nBelly — ẹ̄́fu·\nNavel — ū́do\nThigh — ṓta\nKnee — ōkúk\nKnee — kuk\nHeel — āgbẹ́rẹ\nSkin — an·ọ̄́ra\nBone — óṛūgu\nBlood — ẹ̄́bīẹ",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — dwelling, tools and trade",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nTown (village) — éfōdṣa\nMarket — ā́dṣa\nHouse — ū́nye\nDoor — ṓnugúāna\nbed — ágōdo\nmat — ūlóko\nKnife — ọ̄́bẹ\nSpoon — ṓkọ\nPot — ṓdṣa\nCalabash — ū́gba\nGun — óbōdṣén·ga\nSword — ọ̄́bẹ kọ̄́ri\nSpear — ọ̄́kūa\nBow — ọ̄́do·\nArrow — ọ́fa\nQuiver — āhyágba\nCanoe — ọ̄́kọ\nNeedle — ṓleẹ\nThread — ṓwo\nRope — ḗku\nDrum — ọkā́n·ga\nDrum — ọtā́dṣi\nDrum — ōnún·\nHoe — úkọ̄ṣẹ\nAxe — ẹ̄́dọ·\nBook — ā́n·ọ",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — nature, sky and seasons",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nHeaven (sky) — ṓdṣale\nFire — úna\nWater — ṓmi\nStone — ōkúta\nSun — ṓlu\nMoon (? full) — ṓdṣu\nNew Moon — ṓdṣu ḗto·\nDay — ọ̄rọ́ka\nNight — ṓdu\nDry Season — ū́wo\nRainy Season — ọlọ̄́dṣi\nRain — ṓmi\nDew — ḗli\nSmoke — ōdúdu\nSand — ẹ̄kẹ́tẹ\nSand — ẹ́lānyi",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — plants, crops and food",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nTree — ṓri\nFirewood — ī́dṣi\nLeaf — ḗn·wi·\nRoot — ī́li\nPalm-tree — ẹ̄́gbẹ\nPalm-oil — ḗgbo\nCotton — ṓwu\nRice (uncooked) — ṓdṣikápa\nYam — ṓdṣu\nCassada — ābáṣa\nGround-nut — ōpápa\nPepper — āgbọ́kọ\nOnion — albáṣa\nMaize — ākágwa\nBeans — ẹ̄́gūa\nFarm — ṓko\nForest — ēwóko\nSoup — ọ́rọ\nMeat (often Animal) — ẹ̄́la\nSalt — ṓmu\nHoney — ōmín·o·",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — animals",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nHorse — ā́nya·\nCow — ōkúno\nBull — ọ̄kókūno\nMilk — ṓmi-ẹ̄́n·ya\nEwe (Sheep) — ála\nRam (Sheep) — alọ̄́kọ\nGoat — ēhwo\nCat — ọ̄́bara\nRat — īkérēku\nPig — ḗṣi\nBat — ī́dọ\nPigeon — ōkéde\nParrot — ṓko\nFowl (Hen) — ādṣúrẹ\nCock — áikọ\nEgg — ẹ́gẹ\nBird — ẹwẹ\nFish — ẹ̄́dṣa\nSerpent — ḗdṣo\nScorpion — ā́gbe\nMosquito — ī́mu\nButterfly — ā́dṣiwébe\nSpider — agáira\nBee — ín·ọ·\nLion — ágāba\nLeopard — ẹ̄́ko·\nElephant — ọ́dọ̄gwa\nMonkey — ẹ̄́dọ·\nLizard (the common one) — ā́bọ·\nToad — ọ̄bána\nFrog — ākéle\nDog — ā́bīa",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — qualities and adjectives",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nGreat, large — ínāna\nLittle, small — idṣḗnya\nWhite — i ā́fu·\nBlack — i ā́du\nGood — ī́nyo·\nBad — ī bíānẹ\nOld — ī úgbo\nNew (Young) — ō títo·\nSick — í āṣọ́ga\nWell — ī́ gbede\nHot — i dṣḗgbūna\nCold — i dṣḗbọ\nWet — ī dṣṓmi\nDry — idṣḗgwẹ\nStupid — í mọrā́n\nRich — ī dṣẹ́nāgbḗnu\nPoor — ẹnále\nStraight — ī́dāōgwágwa\nCrooked (Bent) — í dṣḗgọ",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — verbs and short sentences",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nI go — nā́ lo\nI come — nā́ wa\nI run — ná súle\nI stop — nā dágo\nI sit down — na guā́nẹ\nI lie down — n dā́dṣi\nI breathe — nā́ n·me\nI laugh — ná nyānyi\nI weep — nā ráku\nI dream — núāná\nI sleep — nā lólu\nI die — mi légwu·\nI fall — mī dṣíbu\nI rise — n· kúdāgó\nI speak — nā kóra\nI hear — ń· wọ́mīa\nI bathe (wash myself) — nā gúāra\nI see — mī́ li\nI take — mí du·\nI buy — mé la\nI sell — nā́ ta\nI love thee — ndẹ́g wā ẹ́\nI give thee — n dún·ẹ\nI eat rice (yam) — nā dṣọ dṣīkápa\nI drink water — nā n·ṓmi\nI cook meat — nā hẹ̄́ra\nI kill a fowl — n·gbā́dṣírẹ\nI cut a tree — nā dṓri\nI catch a fish — mmẹ̄́dṣa\nI play — nā dṣī́a\nI do not play — ńdṣiā́n\nI dance — nā tído\nI do not dance — n tídōn",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — religion and the supernatural",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nGod — ọ̄́dṣọ\nDevil — ọdṣọ̄́ībí\nIdol — ōdṣíbo\nGreegree — ṓgu\nSacrifice — ōṣídāka\nHell — ēvúra\nWar — ṓgu",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "historical_wordlist",
    topic: "Igala 1854 wordlist — time words",
    content:
      "Igala forms recorded by S. W. Koelle in 1854 from a speaker in Sierra Leone, in Koelle's own 19th-century transcription. Useful as historical attestation and for tracking change; do NOT treat the spellings as modern standard Igala orthography.\n\nYesterday — ọnálẹ\nTo-day — én·ēni\nTo-morrow — ọ̄́na",
    source:
      "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0; underlying 1854 source is public domain. 1854 orthography, NOT modern Igala spelling.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Igala people and homeland",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nIchi Igala chi ichi ka ẹfi ami ichi ki di ọjanẹ Kogi State Nigeria. Lokoja ki dẹ Kogi state chi ugwẹta Nigeria igbẹlẹ. Ẹnẹ ki chi agboji Nigeria ẹgba’lẹ ma dọ Lord Lugard chi Lokoja i dọ’dọ. Ẹfụ ẹwọ ki chi ugwẹta abọ Igala chakadu chi Idah local government area ojanẹ Kogi state. Abọ Igala chi Kogi ma jọ wẹwẹ. Ami local government ki abo Igala dọ’dọ chi Idah, Igalamela/Odolu, Ajaka, Ofu, Olamaboro, Dekina, Ankpa, Omala, Lokoja, Ibaji. Onu ki chi agbọji anẹ Igala chakadu chi Attah ma dọ. Efu ama Attah chakadu ku ma jofẹ lale i, Atta Ayegba Oma Idoko kpai Atta Ameh Oboni amonẹ a chọ’kpọ tụle. Atta Ayegba Oma Idoko fi ọma Ufedo ñwu ji udeju tudeju todu ki abọ Igala kuma nẹkẹ di ụja ogwu jẹ iko ki abọ Jukun aju ma uja.",
    source:
      "Igala Wikipedia, article 'Abo Igala' — https://igl.wikipedia.org/wiki/Abo_Igala — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Igala land — geography and name origin",
    content:
      'Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nAnẹ Igala, chi ójane ùgbo ka amé kí chi ígalàá óñwu che ojané igala. Ojané Ígalà dí eastí Kogi state, ùgbo kí aji ku ma dó River Niger kpaí River Benue dama í la dí alumeji Middle Belt or ojane North-central Abo ku ma nyí ojané Igala chi IAbo Igala, "Àtá" chí Onu abo Igala chakadu, efí èwo ki chi ugbẹta ane Igala chakadu chí Idah. Abó ku ma dí ojané Igala ku ma da manwu ábó Igala ta ba joí chi ábó Yoruba, Idoma, Igbo and Jukun Àbó Igáláà = people Eñ’ogwuu= Culture íchí Igáláà =Igala language Odú "Igala" chí efí óla méji ma dú gwo oka chí "Iga" which ófé nwu chi énwu ma kpé, ewñ ma kpona nwu manwu olodo ku ma kpé réjí Kpaí ela ku ma dó kí "Ala". Iga-ala ma du dama ma dò Igala abajoí. Àtá\' Igala nỉ Ủnyi oda ma dỏ Ogbede, ogoji Ủnyi oda chi Ogbe .',
    source:
      "Igala Wikipedia, article 'Ojanẹ Igala' — https://igl.wikipedia.org/wiki/Ojan%E1%BA%B9_Igala — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — The Igala language, described in Igala",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nAbo kù ma kí ichi Ígalàá chí ojane Nigeria ma dé. Ódò 1989 amone kù ma gbaluka kù ma ki ichi ígalàá chí dabi 800,000, kù ma de ojí ané Kogi State, ama oj‘olu eñini abo kù ma kí ichi Ígalàá kù ma gbaluka ché ti īmílíon mejí lé mè. Ú gbo kí ku ma kí ichi Ígalàá kí deí chí Ibaji, Idah, Dekina, Ogugu, ajaka, omala olamaboro Igalamale odowulu Ankpa, Ebu manyu abo Olumbanasaa (Anambra West); Amone wéwé á ká kí ní ichi Ígalàá kpaí ami yají manyu Itsekiri íchí. Abo kù ma kí ichi Ígalàá dí owo awohí Niger River kpaí Benue River. Abo kù ma ní ichi Ígalàá chí Benue-Congo é yí Niger-Congo. Ódù ené kí chi aboji abo Ígaláá chí Àtá. Àtá Igala ñwo chí aboji Bassa Nge manyí Bass Nkome, Ma dí ódò alumeji abo Igala kpaí Benue River. Idah chi ugbẹta uyi abo Igala chakadu ojané KOGI state eí dé.",
    source:
      "Igala Wikipedia, article 'Ichi Igala' — https://igl.wikipedia.org/wiki/Ichi_Igala — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Princess Inikpi and the Igala-Benin war",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nInikpi chi oma Attah Ayegba Oma-Idoko ọjanẹ Igala ichẹ, Inikpi chi oma atta ki ma dachi kpai ọnẹkẹlẹ mama’ñ. Ma ji Inikpi udẹjụ tọ dụ ki abọ Igala ku ma ni ujadu efi ogwu abọ lgala kpai abọ Benin ọdọ 1515-1516 ekọ ki Ata Ayegba Oma-idoko di ọji ọfẹ Ọjibo nwu dago ọjinọji nwu ugbo ku ma du ji ẹfi aja Ega amari aji River Niger ẹfewo Idah, Kogi State Nigeria. Abọ Igala wẹwẹ do ọdụ Inikpi kọ ọma onobule wẹwe. Ẹfụ ụchanẹ 16th century, Ọjane Igala na ji uja ọgwu kpai abọ Benin Kindom the Igala Kingdom was at war with the Bini Kingdom. Abọ Benin chẹ ji abọ Igala uja nyọ’nyọ, ma fi ane ẹluchẹ abọ Igala gba kpai ukpahiu, manyi ma di ogwu efu aji ma.",
    source:
      "Igala Wikipedia, article 'Princess Inikpi' — https://igl.wikipedia.org/wiki/Princess_Inikpi — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Igbo-Igala wars",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nUja Igbo kpai Igala chí ujá kí dágbádé amíbó Igbo kpaí Igala kúma chí Nijeria éfikó 18th kpaí 19th century. Ujá kídéhi cháné ojí ajimí, omé kidagbádé má, aménwú ekwú kpaí amibó kumánéré ané ujaibé. Una lé chi amibó southeastern Nigeria, éfowó Anambra, Enugu, Ebonyi, Kogi kpai Delta states. Ujákidéyí chi ujá kí danyá lilé efówo Nsukka. Éfiko 16th century lé, am'ibó Igala wéwé madábá eféwó kumádó kí Niger river alúkimá fujá mádú agbádé Kingdom Benin. ikó gwé, amíbo Jukun kuma kwí efu'wo Wukari kumá dódó kpaí onú má efewo Idah, malía kpódama kpai amakichí igbo Ogwú Amibó Nsukka kpai Igala efu'iko century egwejo ati egwela chéné adu odá nwú ichékibo amoma Nsukka. Nsukka ch'efewo Igbo ma gwúefo ami Igbo kúma jogwú bi amíbo Igala ki Igala dúma.",
    source:
      "Igala Wikipedia, article 'Igbo-igala wars' — https://igl.wikipedia.org/wiki/Igbo-igala_wars — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Idah, seat of the Attah",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nIdah d'efu ami local government area ki dẹ Ojanẹ Kogi State, Nigeria, i d'ọwọ east Aji ku ma dọ River Niger i la ñọ dẹ alumeji Nigeria. Ojanẹ Idah onwu ch'ugwẹta abo Igala Kingdom chakadu ojanẹ Igala. ojanẹ Idah dabu km ogwu ẹgwa nyọwọ mẹfa&nbsp;. Ẹgba ku ma gbaluka amonẹ eyi ku ma dọ ki census efu ọdọ 2006 amonẹ wewe ku ma dẹ efu ewo Idah che 79,815. Ojanẹ Idah chi Ede Igala Kingdom, agboji abo Igala chakadu ma dọ ki agabidu, Attah Igala, ko’odunwu chi Matthew Alaji Opaluwa Oguche Akpa II ki gw'efu ọfẹ Ojanẹ Idah i dẹ. Idah chi ojanẹ ka efu Nigeria ki ni port ugbo ku ma mu ẹja, ma ño nya Aja ọmọ gẹ.",
    source:
      "Igala Wikipedia, article 'Idah' — https://igl.wikipedia.org/wiki/Idah — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Attah Idakwo Ameh Oboni II",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nIdakwo Michael Ameh Oboni II () ma bi efu ọdọ 1948 ta ki la lekwu ẹgba k'ochu ẹkẹjọ nolu ọjọ ogwu ñyọwọ mebie efu ọdọ 2020 Idakwo chi Attah Igala ẹkẹ ogwu ñyọwọ mebie ki di ojanẹ Igala Kingdom efu ewo Nijiria. Oboni II chi ọdọ 1948 ma bi. Oboni II chi ukọchẹ ẹdọ mẹfa kpa efu ọdọ 1960, Ugbo ki chi ukọchẹ che ẹdọ mẹfa kpa yi Saint Boniface ki di efu ewo Idah. Alu ki che kpa kwi Idah Oboni II ñọ lo ti ẹdọ mẹgweji kpa yi Saint Augustine College, Kabba, efu ọdọ 1967. Oboni II tefu Nigerian Air Force efu ọdọ 1968 i la kwefu ma, oji k‘ọlañwu efu ọdọ 1974. Oboni II ñọ ch'ukọlọ Ministry of Lands ojanẹ Kwara State igbele. Efu Ọdọ 1975 Oboni ekeji t'ukọlọ no taki na ch'ukọchẹ.",
    source:
      "Igala Wikipedia, article 'Idakwo Ameh Oboni II' — https://igl.wikipedia.org/wiki/Idakwo_Ameh_Oboni_II — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Kogi State",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nKogi State di ọwọ 67 alimeji north Nigeria, Amii state ki dakolo kogi state chi Ekiti, Kwara, Federal Capital Territory, Nasarawa State, Niger State, Edo kpai Ondo states, tọwọ southeast kpai states Anambra kpai Enugu, t'eju ọwọ east kpai Benue State. Onwu Chi state Kate efu Nigeria ki nọmẹ kpai ojoji state mẹgwa. Ma dodu nwu kwefu Hausa word for river (Kogi). Kogi State dufu kwefu Benue State, Niger State, kpai Kwara State Ọjọ Kochu ẹkẹjọ nolu ọjọ Ogwu nyọwọ mebie efu ọdọ 1991. chẹ tejugede tiba ugwẹtẹ nwu, Lokoja. Efu ami states ogwuẹgwa nyọwọ mẹfa ki di Nigeria, Kogi Chi ẹkẹgwẹta efu ma ugbo ki nana Chaka kpai twentieth ugbo k'amonẹ wewe tule Chaka kpai estimated nuwewe ki dabu 4.5&nbsp; million ọdọ 2016.",
    source:
      "Igala Wikipedia, article 'Kogi State' — https://igl.wikipedia.org/wiki/Kogi_State — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Ogugu",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nOgugu chí efí ęwo keka kí de ojanę Kogi Ku ma kichi Ígalàá, Local government ki abo Ogugu kwo chi Olamaboro Local Government Area yí ojanę Kogi State kí dí alumeji Nigeria. Abo Ogugu ché ní éñwu elifo ógwú kí ya ichí éñwu awuwu ñwí amí ichi kíbó, ódù ñwu chí úbegwu, Ibe ma ché kakiní úbegwu a gbona todu Ku ma kò ché ñwu ki ma nyoñ. Abo Ogugu ma dù kpé kpo'oneñ, ęnę ki jíbenù efu kpa, Ami ibegwu ana dí ogà bómà I ma chí egba ki ene lé fí alu ñwu gbàñ eju amoja manyí icholo, ogà lé na to noñ, abalé í ñwo dé ché ñwu ki Oya oné fí Oko. Alex Ojonimi Agbobaba (Adapted from Ogugu Folklores and Oral Traditions) Gbúgbe:Ethnic groups in Nigeria",
    source:
      "Igala Wikipedia, article 'Ogugu' — https://igl.wikipedia.org/wiki/Ogugu — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Ibaji",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nIbaji chi Local Government Area ka ki defu Kogi State, Nijiria Ibaji dẹ iba Edo State eju ọwọ south, River Niger eju ọwọ west kpai Delta State eju ọwọ south. Efu ewo ki ch'agboji Ibaji chi Onyedega, eju ọwọ ugbo ki chi River Niger, map ñwu chi . Abo ki che ojile ki dẹ Ibaji chi abo Igala. Ami Igbo dẹ ọmọ gẹ ma muda gbeji nana n. Unana anẹ Ibaji chi 1,377&nbsp;km Amonẹ chakadu ki dẹ ọmọ ẹgba ku ma gbaluka amonẹ eyi ku ma’ado census le efu ọdọ 2006 chi . ichi 271. Gbúgbe:Local Government Areas in Kogi State",
    source:
      "Igala Wikipedia, article 'Ibaji' — https://igl.wikipedia.org/wiki/Ibaji — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Igalamela-Odolu",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nIgalamela-Odolu ichi Local Government Area efu Kogi State, Nigeria. Ìlà ni òmè kpài Niger River efu west kpài Enugu State efu east. headquarters làchi efewo Ajaka efu north ei àlà lè. The northeasterly line of equal latitude and longitude passes through the LGA. Ìlà ni òmè àlu 2,175&nbsp;km kpài uwewe àmonè àlukà 148,020 efu òdò 2006 censuslà kàlukà mà àbàlè The two major ethnic groups and languages indigenous to the local government are Igala and Igbo. Igalas are about 70% of the Igalamela-Odolu local government while Igbos are 30%. efu Igalamela-odolu, èkpò òlà chà dè eko òlàji , àmà olu kpài ebutu chà dè eko uwo, moist, . efu òdò chàkà èkpò òlà kpài àfu chà di àlu 65&nbsp;°F to 90&nbsp;°F and is rarely below 58&nbsp;°F or above 94&nbsp;°F.",
    source:
      "Igala Wikipedia, article 'Igalamela-Odolu' — https://igl.wikipedia.org/wiki/Igalamela-Odolu — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Omala",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nOmala chí local government kàa de'fu KOGI state Nigeria, ki dáma kpaí éí north lugbo BENUE RIVER .ùgbo ki chí ugbẹta yi Omala chí efí ewo Abajukolo é efu north Amí northeasterly dí line ukpa yí latitude manyu longitude léfu yí southeast efu LGA. E ni áne efí kpai úwewe àmone ku ma gbaluka ki dabí 108,402 efu ódò 2006 . efu ódò 2016, wéwé amone lo ti atta dabi 145,700. Àmoné ki gbaju domo chí ami akichi Igala manyu amí íchí gwee ki chí Bassa kpai Agatu ku ma kwi Benue State. The postal code of the area is 270. Efi ewo Abejukolo ki chí ugbẹta Omala LGA efu Kogi state, the rainy season is oppressive and overcast while the dry season is humid and partly cloudy, and it is hot year round.",
    source:
      "Igala Wikipedia, article 'Omala' — https://igl.wikipedia.org/wiki/Omala — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "encyclopedic",
    topic: "Igala Wikipedia — Ogidi, Kogi",
    content:
      "Excerpt of an Igala-language Wikipedia article (community-written; treat as a starting point for community verification, not as settled fact).\n\nOgidi is a Okun town in Kogi State, Nigeria, known for its formations of igneous rock mountains, a traditional art industry, hospitality, valor and a deep tradition of self-reliance. Ogidi ché gwugwu oji southwestern ofe eyigbele Northern Region. Oñu che awa meta nya bibo chuleñu kwabuja, najeriya ugweta. Ila che nè ọñèñènè ọla kitanyi kpai northern manyu western efu Najeriya. Abo efewo yi jèdu akobọ gbogbo takuma fedunè oji Nupe imperialists iko 19th century oñu ma muña duteñu abo western efu ojanèwa. Ọna ukọlọ eche oñu dọganè Northern Region kpai Kaduna eyi kichugwèta ; oñu Kwara State kpai Ilorin che ugwèta manyu abajọyi Kogi State kpai Lokoja kichugwèta . Oñu dagbade Kabba efu Kabba/Bunnu LGA, kpai ewo mèta efu Ijumu LGA: Ayere, Iyara ( ugwèta che Ijumu LGA) kpai Ogale.",
    source:
      "Igala Wikipedia, article 'Ogidi, Kogi' — https://igl.wikipedia.org/wiki/Ogidi%2C_Kogi — CC BY-SA 4.0. Dump iglwiki-20260801.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic: "Igala language classification and identifiers",
    content:
      "Igala is a Yoruboid language of the Niger-Congo (Atlantic-Congo) family. Full classification per Glottolog and ASJP: Atlantic-Congo > Volta-Congo > Benue-Congo > Defoid > Yoruboid > Igala. Its closest relatives are Yoruba and Itsekiri.\n\nIdentifiers: ISO 639-3 = igl; Glottocode = igal1242; Wikidata = Q35513.\nReference coordinates: 7.34325 N, 7.17974 E (Glottolog).\nSpeaker estimate: 1,760,000 (ASJP database record). Other published estimates range from roughly 1.6 to 2 million.\n\nCAUTION: some community-facing pages describe Igala as a 'Central Sudanic' language. That is incorrect — Central Sudanic is a different, Nilo-Saharan grouping. Igala is Niger-Congo / Yoruboid.",
    source:
      "Glottolog 5.x languoid igal1242 — https://glottolog.org/resource/languoid/id/igal1242 (CC BY 4.0); ASJP wordlist IGALA_2 — https://asjp.clld.org/languages/IGALA_2 (CC BY 4.0).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic: "Igala dialects",
    content:
      "Glottolog records seven dialects under Igala (igal1242): Ankpa (ankp1238), Anyugba (anyu1238), Ebu (ebuu1238), Ibaji (ibaj1238), Idah (idah1238), Ife of Nigeria (ifee1242), and Ogugu (ogug1241).\n\nThese names correspond closely to Igala local government areas and towns in Kogi State, so a speaker's home area is usually a good first guess at their dialect. Ebu is notable for being spoken outside Kogi, in Delta State. Dialect differences in Igala are reported mainly in lexicon and tone rather than in basic syntax, but this project should record the speaker's dialect with every contribution rather than assuming a single standard.",
    source:
      "Glottolog 5.x languoid igal1242, child dialect list — https://glottolog.org/resource/languoid/id/igal1242 (CC BY 4.0).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "cultural_note",
    topic: "Igala Bible translation history",
    content:
      "The Bible Society of Nigeria (BSN) is the principal publisher of scripture in Igala. An Igala scripture edition titled 'Ọ̀TAKADA Ọ̀LA Ọ̀JỌ́' dated 1970 (version code IGL70) is available on YouVersion / Bible.com.\n\nBSN publicly unveiled a complete Igala Bible in 2021; press reporting states the translation took eleven years and was dedicated on 13 March at the Chapel of the Resurrection, Kogi State University, Anyigba. A printed edition circulates under the title 'Otakada Ola Ojo' with ISBN 9789782492500.\n\nAn Igala audio New Testament exists and is distributed through Faith Comes By Hearing (the 'Igala Bible' Android app is published under the identifier org.fcbh.iglbsn).\n\nLicence status: these translations are under copyright to the Bible Society of Nigeria. They are readable free of charge but are NOT openly licensed, and must not be bulk-copied without permission.",
    source:
      "Bible.com Igala language page — https://www.bible.com/languages/igl ; Vanguard, 'BSN translates Holy Bible in Igala, Okun languages' (2021) — https://www.vanguardngr.com/2021/02/bsn-translates-holy-bible-in-igala-okun-languages/ ; Igala Bible app — https://play.google.com/store/apps/details?id=org.fcbh.iglbsn.n2",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "cultural_note",
    topic: "Igala Wikipedia and the Igala Wikimedia Community",
    content:
      "Igala Wikipedia went live at igl.wikipedia.org on 23 April 2024, after graduating from the Wikimedia Incubator (Phabricator task T361644). The project name in Igala is 'Wikipídiya'.\n\nAs of the August 2026 database dump it held 1,671 content pages, 2,179 total pages, 38,871 edits, 1,596 registered users and 18 active users, with roughly 874,000 words of article text. It is by a wide margin the largest openly licensed body of Igala prose in existence.\n\nIt is maintained by the Igala Wikimedia Community, founded 3 August 2022, which also runs an Igala Wiktionary test project in the Incubator at Wt/igl. All of this content is CC BY-SA 4.0, so it may be reused with attribution and share-alike.",
    source:
      "igl.wikipedia.org Special:Statistics via MediaWiki API — https://igl.wikipedia.org/wiki/Special:Statistics ; Phabricator T361644 — https://phabricator.wikimedia.org/T361644 ; Igala Wikimedia Community — https://meta.wikimedia.org/wiki/Igala_Wikimedia_Community ; Wikimedia Incubator Wt/igl — https://incubator.wikimedia.org/wiki/Wt/igl",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic: "Published Igala dictionaries and lexicons",
    content:
      "The most substantial modern Igala dictionary is 'An Ígálá-English Lexicon: A Bilingual Dictionary with Notes on Igala Language, History, Culture and Priest-Kings' by John Idakwoji (Partridge Publishing Singapore, 2015; ISBN 9781482827866 paperback, 9781482827880 ebook). It contains over five thousand headwords with diacritics, phonetic symbols and tone marks, and covers the alphabet, tones, grammar, parts of speech, dialects, loanwords, proverbs, idioms, the Igala numeral system, and Igala names. It is fully in copyright.\n\nThe oldest attestation is Sigismund Koelle's 'Polyglotta Africana' (London, 1854), which records about 285 Igala words and short sentences. The 1854 text is public domain and has been digitised as a CLDF dataset by Lexibank under CC BY 4.0.\n\nThe ASJP database also holds two short Igala Swadesh-style wordlists (IGALA and IGALA_2) under CC BY 4.0.",
    source:
      "VitalSource / Amazon listings for Idakwoji (2015) — https://www.amazon.com/dp/1482827867 ; Lexibank polyglottaafricana — https://github.com/lexibank/polyglottaafricana (CC BY 4.0); ASJP — https://asjp.clld.org/languages/IGALA_2 (CC BY 4.0).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic: "Igala numerals — conflicting sources, needs community adjudication",
    content:
      "The numerals in this project's original seed data do not match the independently attested sources, and should be treated as unresolved until Igala speakers adjudicate.\n\nFor 'one': Wiktionary records òókáà; Koelle (1854) records ī́nye; ASJP records the form transcribed 'i5e' (i.e. ínyẹ). None of these is 'okpa'.\nFor 'two': Wiktionary èjì and Koelle ḗdṣi agree with the seed's 'eji'.\nFor 'three', 'four', 'five', 'six', 'eight' and 'nine': Koelle's ẹ̄́ta, ẹ̄́lẹ, ẹ̄́lu, ẹ̄́fa, ẹ̄́dṣọ, ẹ̄́la are consistent with the seed forms eta, ele, elu, efa, ejo, ila.\nFor 'seven': Koelle records ḗbīe, not 'eje' ('eje' is the Yoruba form).\nFor 'ten': Koelle records ẹ̄́gūa / ẹ̄́gwa, not 'igbe'.\n\nAction: ask fluent speakers to confirm 1, 7 and 10 in particular, and record which dialect the answer comes from.",
    source:
      "English Wiktionary Igala lemmas — https://en.wiktionary.org/wiki/Category:Igala_lemmas (CC BY-SA 4.0); Lexibank polyglottaafricana Igala list III-C-2 — https://github.com/lexibank/polyglottaafricana (CC BY 4.0); ASJP IGALA_2 — https://asjp.clld.org/languages/IGALA_2 (CC BY 4.0).",
    verificationStatus: "needs_review",
  },
  {
    chunkType: "language_metadata",
    topic: "Igala coverage in NLP resources",
    content:
      "Igala is effectively absent from mainstream multilingual NLP resources. It is not in NLLB-200 / FLORES-200, not in MADLAD-400, and not in Glot500. It has no Google Translate or Microsoft Translator support.\n\nWhat does exist: the Igala Wikipedia dump (CC BY-SA 4.0, roughly 484,000 words of article text after markup stripping, about 1.09 million GPT-style tokens); about 96 Igala entries with definitions on English Wiktionary (CC BY-SA 4.0); 285 historical forms in Polyglotta Africana (CC BY 4.0); and two short ASJP wordlists (CC BY 4.0).\n\nImplication: any Igala language model must be built largely from community-created data and from openly licensed or permission-cleared text. There is no large ready-made corpus to fall back on.",
    source:
      "Measured directly from the Igala Wikipedia dump iglwiki-20260801-pages-articles.xml.bz2 — https://dumps.wikimedia.org/iglwiki/ ; token count via tiktoken cl100k_base. Wiktionary category — https://en.wiktionary.org/wiki/Category:Igala_lemmas",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "grammar_rule",
    topic: "Igala orthography, alphabet and tone marking",
    content:
      "Igala is written in a Latin alphabet devised by W. T. A. Philpot in 1931 and revised by Nigeria's National Language Centre in 1980. The 1931 version wrote ng, nm and nw where the modern orthography writes ñ, ñm and ñw.\n\nThe working orthography uses a seven-vowel system: a, e, ẹ, i, o, ọ, u. The two dotted vowels are the distinguishing feature — measured across the Igala Wikipedia corpus, ọ (U+1ECD) accounts for 1.51% of all letters and ẹ (U+1EB9) for 1.21%, which is far too frequent to be incidental.\n\nTone is marked with diacritics on vowels: acute for high tone, grave for low tone, mid tone left unmarked. All of á à é è í ì ó ò ú ù occur in running text, with í and é the most frequent.\n\nConsonants include the digraphs ch, gb, gw, kp, kw and the letters ñ, ñm, ñw. The letter q does not occur and v is vanishingly rare.\n\nNote for data cleaning: ụ (u with dot below, U+1EE5) appears occasionally in the corpus. It is not part of the standard seven-vowel Igala system and is most likely Igbo interference or a typing error — flag it rather than treating it as a valid Igala grapheme.",
    source:
      "Alphabet history from Omniglot — https://www.omniglot.com/writing/igala.htm . Character frequencies measured directly from the Igala Wikipedia dump iglwiki-20260801 (CC BY-SA 4.0) — https://dumps.wikimedia.org/iglwiki/",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "cultural_note",
    topic: "The Attah of Igala",
    content:
      "The Àtá Ígálá (Attah of Igala) is the paramount traditional ruler of the Igala Kingdom, seated at Idah in Kogi State. The title is the apex of Igala traditional authority and carries religious as well as political weight.\n\nThe current holder is Matthew Alaji Opaluwa Oguche Akpa II, the 28th Àtá Ígálá, traditional name Ọ̀pàlúwa Alaji Ọma Ọ̀pàlúwa Ògwùchẹ́ Akpá. He took office on 18 October 2021 and was formally installed with the Staff of Office on 4 March 2022. He succeeded Attah Idakwo Ameh Oboni II, who died in August 2020.\n\nHistorically significant Attahs include Ayegba Oma Idoko, associated with the Igala-Benin war and the sacrifice of his daughter Inikpi, and Ameh Oboni. When discussing the Attah, note that this is a living institution with a current office-holder, not only a historical one.",
    source:
      "Wikipedia, 'Matthew Opaluwa' — https://en.wikipedia.org/wiki/Matthew_Opaluwa (CC BY-SA 4.0); corroborated by Igala Wikipedia articles 'Abo Igala' and 'Idakwo Ameh Oboni II' — https://igl.wikipedia.org",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic: "Igala language technology — what exists and what does not",
    content:
      "Input: the Keyman 'Naija NFD' keyboard (el_naija) explicitly supports Igala (igl-latn). Authors Andrew Cunningham and Chinedu Uchechukwu; licence MIT; runs on Windows, macOS and Linux. https://keyman.com/keyboards/el_naija . SIL's Nigeria keyboards (Nigeria Underline / Dot / Odd Vowels) also cover the required diacritics without naming Igala specifically.\n\nMachine translation: none. Igala is absent from Google Translate, Microsoft Translator, and Meta's NLLB-200. It is also absent from N-ATLaS, Nigeria's own government-backed LLM, which covers only English, Hausa, Igbo and Yoruba.\n\nSpeech: there is no Igala speech recognition or synthesis. Wikimedia's Lingua Libre pronunciation category for Igala is completely empty, which is an unusually cheap gap to fill.\n\nSpell-checkers, Igala-specific fonts, and Igala Hunspell dictionaries: none found.\n\nCaution: mobile Igala dictionary apps have been delisted from Google Play, and there are no Igala apps on the Apple App Store. The only surviving Igala app is the Faith Comes By Hearing audio Bible.",
    source:
      "Keyman keyboard — https://keyman.com/keyboards/el_naija (MIT); Microsoft Translator languages API — https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=translation ; Google Cloud Translation language list — https://docs.cloud.google.com/translate/docs/languages ; FLORES-200 — https://github.com/facebookresearch/flores ; N-ATLaS — https://huggingface.co/NCAIR1/N-ATLaS",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic: "Openly licensed Igala audio and media",
    content:
      "Global Recordings Network holds the only openly licensed Igala audio that exists: a 'Words of Life' programme of about 45 minutes 38 seconds — short Bible stories, messages and songs — downloadable as MP3, low-bitrate MP3, and slideshow video. https://globalrecordings.net/en/language/igl\n\nGRN's stated terms: 'Unless otherwise indicated, all are available to be copied and used under the Creative Commons Attribution-NonCommercial-ShareAlike license.' The NonCommercial clause is a real constraint — it blocks any commercially served model without a separate written grant, which GRN's Copyright Office does offer on request.\n\nGRN lists seven Igala dialect pages (Ankpa, Anyugba, Ebu, Ibaji, Idah, Ife, Ogugu) but has no recordings for any of them — only the single main-Igala programme.\n\nEverything else is copyrighted: the Faith Comes By Hearing dramatised audio New Testament, the 128-minute JESUS Film in Igala, and the LUMO Gospel of Luke. Radio Kogi's Ochaja booster station in Dekina LGA broadcasts in Igala but publishes no schedule and keeps no downloadable archive.",
    source:
      "GRN Igala language page — https://globalrecordings.net/en/language/igl ; GRN Copyright and Licensing (2022-02-27), quoted verbatim — https://globalrecordings.net/en/copyright ; find.bible Igala index — https://find.bible/languages/igl/",
    verificationStatus: "external_sourced",
  },

  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — land, water and landscape",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nánɛ̀ — earth, ground, land, soil\nébùtù — dust\nɛ́pɔ̀ — mud\nébútú — dust\nèbùtù — dust\nɛ́kɛtɛ̀ — sand\núwó — hill, mountain\nitekwú — ocean, sea\náǯi — brook, river, stream\nóǯómi — spring, well\néfoko — forest, woods\nòkwúta — rock, stone\níríǯia — waterhole, well\nokuta — stone\nuwo — mountain",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — sky, weather and time",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nóǯálɪ̀ — sky\nólù — sun\nóčù — moon, month\nìlàwò — star\nàwò — star\nɔ̀màmànyà — lightning\nàkpábànà — thunder\nòǯìǯi — shade, shadow\nimyɪ̃ — dew\nàfù — wind, cold\nákpá — cloud\nátúlɪ — fog\nélì — fog\nómi — rain\nómi oǯálì — rain\nɔ́ǯɔ́ — day, daylight\nòdùdu — morning\nánɛ́ — sundown, sunset, evening\nɔ́dɔ́ — year\né-rì dɔdɔ — damp, wet\nɛgbɛ́ — dry\né-kpúná — hot\nóču — full moon\nóču titɔ — new moon\nòlùbɔ — shade\nolu — sun\nawo — star",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — body and health",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nóǯí — head, water\náŋɔla — hide, skin\níloǯí — hair\nèdùduɔla — hair, body hair\nɛ̀byɛ̀ — blood\nógwúgwú — bone\náčikwù — bone\nùbì — back\néǯú — face, eye\nétí — ear\nímɔ́ — nose\nálu — mouth\nimálu — tongue\nényí — tooth\nɔ̀fa — neck\nɔ́lɔ̀ — neck\nóǯíká — shoulder\nɔ́lí ɔ́wɔ́ — arm\nɔ́wɔ́ — hand\nɔ́mɔwɔ́ — finger\nànyígá — fingernail, nail\nɛ́rɛ̀ — foot, leg\nòkwúkwù — knee\nɛ̀dɔ̀ — chest\nɔ̀dɔ̀ — wall, heart, liver\nómù ɛ̀dɔ́ — heart\nɔ́dɔ̀ xfúya xfúya — lung, lungs\nɔ̀gá — ill, sick\nágbè — sore, wound\né-dakòbì — come back, go back, return\néfù — belly\nano — skin\neby~e — blood\nogugu — bone\neti — ear\neju — eye\ninm~o — nose\ne5i — tooth\nimalu — tongue\nokuku — knee\nowo — hand\nodo — liver",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — people, kinship and society",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nónɛ̀ — human being, person\namónɛ̀ — human being, person\nɔ́nɛkɛlɛ — male, man\nónobùlɛ — female, woman\nɔ́ma — boy, child, girl\nòkólóbìà — adolescent, young man\nìgbɛ̀lɛ́ — adolescent, young woman\namɔmá — child\nɔ́kɔ — husband\nɔ́yà — wife\natá — father\níye — mother\nɔmami ɔnɛkɛ̀lɛ — son\nɔ́mami ónobùlɛ — daughter\nɔ́maíye ɔnɛkɛ̀lɛ — brother\natáaguǯo — old man\natáoguǯo — old man\nánágbó — old man\níyánágbó — old woman\néwò — village\nónónoǯò — companion, friend\nene — person",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — animals and birds",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nokunɔ — cattle, cow\nálá — sheep\néwó — goat\nànyà — horse\náwó — fowl\nɛ́wɛ — bird\nábyá — dog\nɔ̀bàlà — cat\nikélékwu — mouse, rat\nɛ́ǯa — fish\nìdù — lion\nɛ́dɔ — monkey\nɔ̀bàgwù — monkey\nàdágbá — elephant\nèlìlà — soldier, ant\nagárà — spider\níŋɔ́ — bee, honey\náčiči — fly\néǯò — snake\nɔ̀bàna — frog\nábibye — lizard\nábɔ̀ — lizard\nɔ̀nyɪ̀ — alligator, crocodile\né-wù — fly\nábɪdɪ̀ — antelope\nábìtì — antelope\nɛ́fà — bison, buffalo\nɛ́kɔ̀ — jaguar, leopard\nɛ̀ǯɛ̀ — jaguar, leopard\nàmúnyi — termite, white ant\nɛ́kwú — termite, white ant\nɔ́nyí — termite, white ant\nàkèlé — toad\neja — fish\naby~a — dog",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — plants, food and farming",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nólí — tree, stick, tree trunk, trunk\nɛ́la — meat, animal\nílì — root, artery, vein\né-ǯɛũ — eat\nùǯɛũ — food\né-mɔ — drink\nɛ̀ro — fruit\nékpo — oil, fat, grease\nómu — salt\nómiŋɔ — honey\nómiɛ̀nyà — milk\núkɔ́čɛ́ — hoe\nɛ́yɔ́ — seed\né́gbé — grass\némi — leaf\nɔ́kà okilì — yam\nomi — i, water\noli — tree\nenm~i — leaf\nnm~o — drink\noho — water",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — actions and verbs",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nólu — sleep\né-lolo — sleep\né-bí — be born, born, give birth\né-kpa — beat, kill\né-če — do, make, plait, weave\núkɔ́lɔ́ — work\né-da — chop, hew, cut\né-lùlɛ̀ — walk\né-rúlé — run\né-ló — go\né-nyátɛ — go up\né-nyɔ́ganɛ̀ — go down\né-dufù — go out\né-wá — come\né-tùnu — enter, go in\né-nɛ́ — bear, carry\né-gbà — take, grab, grasp, seize\né-du — give\né-gwù — sit\né-dà či — lie, lie down\né-gbɔ́ — hear\né-lí — see\né-nyányi — laugh\né-ra kwú — cry, weep\né-ŋéǯú — desire, want\nɔ̀lèémi — lie, tell lies\né-libe — cogitate, reflect, think\né-mà — know\né-kɔ̀là — speak, talk\né-kà — say, relate, tell\nli — see\ngb~o — hear\nku — die\nwa — come",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — qualities and description",
    content:
      "Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\núná — light, fire\nùfɛ́ — light\né-gbítì — mighty, powerful, strong\nɛ̀gbò — weak\né-fɛ́ — clean, blow\nùwána — big, large\nkɛ́kɛ́ — little, small\nùǯiǯì — long\nkpùkɛ̀ː — short\nùn-abɛ̀ — broad, wide\nfíːlí — narrow\nùnyá — few, little\né-kɔ́ — teach, full\né-titɔ — new\nùwóǯì — heavy\nfúyɛ́-fúyɛ́ — light\niwá — dirty, soiled\né-nyɔ̀ — good\nɛ̀byɛ́nɛ — ugly, bad\nùnyɔ̀ — beautiful\nko — full\ntito — new",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — general vocabulary 1",
    content:
      "Further Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\n-ń — not\nahɛ́má — louse\nakákanowɔ́ — elbow\nawa — we\ne5a — breast\ne5e — one\nebie — seven\nebye — seven\nefa — six\negwa — ten\neji — two\nejo — eight\nekpabie — lavish, squander, waste\nekpili — kidney\nela — nine\nele — four\nelu — five\neta — three\neŋíni — today\ni — this\nigb~a — horn\nikéké — thorn\nina — louse\nitá — flea\nitì — cheek\niču — excrement\nkpɛḿḿ — all, every\nkó — grab, grasp, seize\nlɛ — that\nmà — they\nméèǯì — two\nmɛ̀ — you\nobɪǯɪ́m — emu\nodu — name\nogwu — twenty\nokwunyí — roof\nona — path\nonka — one\nukpálu — lip\nuna — fire\nuwe — you\nà — we\nàgbà — jaw, chin\nàgó — waist\nàhyáŋ́gba — quiver\nàmà — they\nàmɛ̀ — you\nàtɛ — above, up\nàtɛ́ — gazelle\nàwà — we\nàwéhì — left\nàwɔ́tɔ — right\nàwʊ́hì — left\nàʼà — we\nábú — how\náfolo — hare\nágbà — basket\nágbɔ́nɔkɔ̀ — sore, ulcer\nákpéǯúfɔ́ — blind\nákpɪ̀ — scorpion\nákálúǯí — dumb, mute\náŋɔ — hide, pelt\náŋɛǯɛ́ — tortoise\nèkpà — testicle, testicles\nèmí — here\nèǯì — two\né-bì — open\né-dohì — answer\né-du dànyu — pour\né-du kwánɛ̀ — lift, raise\né-du máǯà — hide\né-du tánɛ̀ — location, place\né-du wá — bring\né-du čalu — taste\né-du čò — touch\né-du ŋà — show\né-du ǯì — bury\né-dɔ́ — call, summon\né-fa nà — tear\né-fufu — white\né-fɔ — drag, pull\né-gbá — sweep\né-gbényɔ̀ — forget\né-gbúlu̩ — smell\né-gwà — swim, bathe, wash, dig\né-gwó — beat\né-gwú čɛ́ — break\né-gwú ǯó — burn\né-gwɛ̀ — wash\né-hì — boil",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — general vocabulary 2",
    content:
      "Further Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\né-hí — weave\né-keli — sing\né-kpa nà — tear\né-kpikpa — red\né-kpákòlò — jump, leap\né-kpɔ fɔ — break\né-kpɛ — divide\né-kpɛ̀kɔ — fill\né-kwú — blunt, dull\né-kɔ — build\né-kɔ́ čɛ — learn\né-kɛ́čɛ̀ — push\né-lè bɔ — follow\né-lɔ́ — bite\né-mì — swallow\né-mú … du — grab, grasp, seize\né-mɛ́rú — near\né-nɔ́na — dream\né-nɛ — have, marry\né-ridà — twist\né-ré — close, shut\né-rémá — collect, gather\né-rɔ — throw, fry, roast\né-rɛ́wá — remember\né-ta — shoot\né-tidó — dance\né-tákpa — end, finish\né-táčìfóò — sneeze\né-ténè — ask, inquire, question\né-tìtɔ̀ — urinate\né-tú — untie\né-wálu — gape, yawn\né-wánɛ̀ — fall\né-čeču — defecate\né-čánɛ̀ — begin, start\né-čɛ̀ — rotten\né-ǯì — bind, tie\né-ǯó — burn\né-ǯómá — taste\né-ǯóǯí — steal\né-ǯù — blow\nébi — hunger\nédudu — black\néfiya — armpit\négwó — beat, hit, strike\nékpá — bark\nékpáólí — bark\nékwúlúbibì — charcoal\nékákala — crab\nélúlú — ashes\néǯófe — anus\nì — he, she, it\nìdàgbò — duck\nìdɔ — bat\nìdɛ̀nɛ̀kwù — worm\nìdɛ́ — maggot\nìfi — gut, guts, intestine, intestines\nìgbà — horn\nìhyáǯà — dawn\nìkpa — spoor, track\nìkéde — dove\nìtɔ̀ — urine\nìwɛ́ — feather\nígɛ́ — charcoal\níkwù — cord, rope\níká — wing\níkélí — rib\níkétɪ̀ — sore, ulcer\nílagbà — beard\nímú — mosquito\nínyɛ́ — one\níná — louse\nítɔ́ — saliva\níyeyemi — grandmother\níčí — language\nòbù — vagina\nòdò — yellow\nòdòdó — flower\nòdùdɛ̀ — bat\nòdùfa — green, blue\nòfé — buttock, buttocks\nòkwɔ́mi — grandfather, grandmother\nòkòkòlò — round\nòkódo — navel\nòlùgbɛ — thirst\nòmì — i\nònùnù — tail\nònú — how many\nòpyólí — spear\nòtìnyà — hyena",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — general vocabulary 3",
    content:
      "Further Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nòtíì — tail\nòtíìhì — tail\nòókà — one\nòũ — he, she, it\nódudu — smoke\nódú — name\nókítí — nest, anthill\nólànɛ — west\nólòdùdu — east\nómù — voice\nóyú — fat\nóčú — bile, gall\nù — i\nùbà — drum\nùbìɔ̀fa — nape\nùbìɛ́rɛ̀ — heel\nùgbítì — hard\nùgá — hip\nùkèlègwu — drum\nùlà — fat\nùlùkókó — bitter\nùlɔ́la — soft\nùlɛ́ — sharp\nùmefù — deep\nùrínyɔ̀ — sweet\nùwéwe — many, much\nùwɛ̀ — you\núgbo — place\núgbò — where\núgwù — sweat\núgwúnú — vulture\núkpá — thick\núkpò — clothes, clothing, garment\núkwú — death\núkábú — baboon\núkɔ́ — cough\núlóko — mat\núnyí — house\núta — thigh\nčákáː — all, every\nǹ — i\nɔgbɔ mɛ́lu — hundred\nɔkákwu — hippopotamus\nɔrɔ́ka — midday, noon\nɔ̀bɛ — knife\nɔ̀fɛ̀ — hole\nɔ̀gànɛ̀ — below, down\nɔ̀gɔ̀ — claw, talon\nɔ̀gɛ́bɛ̀ — north\nɔ̀kpù — buttock, buttocks\nɔ̀kwɔ̀ — spear\nɔ̀kányɪ́ — ax, axe\nɔ̀kɛ́kɛ́tɛ́ — ass, donkey\nɔ̀là — word\nɔ̀mɔ́ — there\nɔ̀na — tomorrow\nɔ̀nà ǯiǯì — far\nɔ̀ná — dream\nɔ̀nálɛ́ — yesterday\nɔ̀tàǯia — cap, hat\nɔ̀wɔ̀čo — south\nɔ̀čá — squirrel\nɔ̀ɔ́nà — door, gate, path, road\nɔ́dɔ — bow\nɔ́fá — arrow\nɔ́gbɛ — thin\nɔ́koːmi — boat\nɔ́kpàkpà — correct, right\nɔ́kɔ̀ — boat\nɔ́kɔ̀tɔ̀ — brain, brains\nɔ́la — body\nɔ́ma ɛkpa — baby, infant\nɔ́mɛrɛ̀ — toe\nɔ́ráːtámi — grandfather\nɛta — kidney\nɛ̀ — you\nɛ̀dà — shoe\nɛ̀fà — six\nɛ̀gbà — when\nɛ̀gwá — ten\nɛ̀ka — acid, sour\nɛ̀kàǯi — deaf\nɛ̀lu — five\nɛ̀lá — nine\nɛ̀lɛ̀ — four\nɛ̀nyà — breast, breasts\nɛ̀pí — penis\nɛ̀ta — three\nɛ̀ǯɔ — eight\nɛ́dɔ̀ — ax, axe",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic: "Igala-English lexicon (chikhapo) — general vocabulary 4",
    content:
      "Further Igala-English lexicon entries with tone marking, from the openly licensed chikhapo dataset. Transcription is phonemic, not standard orthography: read ɛ as ẹ, ɔ as ọ, ǯ as j. This list is machine-derived and contains near-duplicates and some mis-glossed entries (for example ómi is glossed 'rain' here, but other sources give ómi = 'water', with 'rain' being the compound ómi oǯálì, literally water-of-sky). Verify with a speaker before relying on any single line.\n\nɛ́gɛ — egg\nɛ́tɔ́ — branch\nɛ́wũ — thing\nɛ́ũ — thing\nɛ́ũʏ̈ či — why\nɛ́ũʏ̈ — what",
    source:
      "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence. Phonemic transcription with tone marks; note it uses IPA-style characters (ɛ ɔ ǯ) rather than standard Igala orthography (ẹ ọ j).",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "example_dialogue",
    topic: "Igala children's story — órbala mi márja",
    content:
      "A short Igala children's story published under an open licence by the African Storybook Initiative. Simple narrative register, written in untoned orthography. Useful as an example of connected Igala prose.\n\nUngbo orbala mi dei? Un li no. Un lin ungbo duu no. Ungbo orbala me dei? È do ofe ate? Ei ei, elia rule kwi efu ejefu. Ungbo orbala mi dei. E defu oji oli ku ma kor outakada nyuu le? Ei ei, e defu ofe mgbo ku ma kor outakada jor le. Ungbo orbala me dei? E du gbo oli kuma nwuwu le? Ei ei, e defu ukpologu unyi. Ngbo orbala me dei? E du gbo ojeta le? Ei ei, eguwu alu oowe kekele. Ngbo orbala me dei? E du gbo agbaa mi? Ei ei, e defu akpati. Ngbo orbala me dei? E defu ukpologu unyi? Ei ei, e dubi ukpo alugbona. Ugbo orbala me dey? Oun dei! imaja efu ngbo ku ma ko ortakada joo. You are free to download, copy, translate or adapt this story and use the illustrations as long as you attribute in the following way: órbala mi márja Author - Ingrid Schechter Translation - Celine Nongo Illustration - Bronwen Heath, Ingrid Schechter Language - Level - First sentences © African Storybook Initiative 2019 Creative Commons: Attribution 4.0 Source www.africanstorybook.org Original source",
    source:
      "African Storybook Initiative, 'órbala mi márja' (by Celine Nongo, 2020) — https://www.africanstorybook.org/reader.php?id=34834 — CC BY 4.0 ('© African Storybook Initiative / Creative Commons: Attribution 4.0', printed in the PDF). Note: flagged approved=0 on ASb, i.e. not editorially vetted by ASb.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "example_dialogue",
    topic: "Igala children's story — Unyi Luwo's",
    content:
      "A short Igala children's story published under an open licence by the African Storybook Initiative. Simple narrative register, written in untoned orthography. Useful as an example of connected Igala prose.\n\nLuwo le ti ugbo aduwa kpai iyeun. I kwonyo owou alu ku ma la ro ajrna. Efu unyi aduwa le, a mone jor mo wéwé. Ma ja keli. Luwo kwefu church. Iye-un liin. Luwo kpo da go eju ona le. E chane kpe be, “Ungbo chunyi walé? Taki chanei lulé. E funyi a lélà lii lé. Taki ka kini, “ayi chunyi waan. Nyi wa de kékélé. Luwo lule to gba pee, I cheli kakini, unyi ki do gbaun le gbogba. E kakini, aiyi chunyi waan. Unyi wa gbogbaan. I defu ule gbogbo. Taki unyi kékélé li le. Taki kakini, a yi nugo chunyi wan. Unyi wa chi nekete ku ma du bubo. Luwo le togba. E fu unyi kekele ko oli dago ododa. E kakini, a iyi chunyi wan. Unyi wa na mo li me jii ododaun. Ugbogbolo le, luwo fi iyeun le ki da waa, taki ruule nya kerebo Iyeun kakini, “alo tunyi!” Ungbo chunyi Luwo le? You are free to download, copy, translate or adapt this story and use the illustrations as long as you attribute in the following way: Unyi Luwo's Author - Little Zebra Books Translation - Celine Nongo Illustration - Jacob Matthess Language - Level - First paragraphs © African Storybook Initiative 2019 Creative Commons: Attribution 4.0 Source www.africanstorybook.org Original source JOCUM and Mercy Air",
    source:
      "African Storybook Initiative, 'Unyi Luwo's' (by Celine Nongo, 2020) — https://www.africanstorybook.org/reader.php?id=34835 — CC BY 4.0 ('© African Storybook Initiative / Creative Commons: Attribution 4.0', printed in the PDF). Note: flagged approved=0 on ASb, i.e. not editorially vetted by ASb.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "example_dialogue",
    topic: "Igala children's story — Ubolu ero chi olaai",
    content:
      "A short Igala children's story published under an open licence by the African Storybook Initiative. Simple narrative register, written in untoned orthography. Useful as an example of connected Igala prose.\n\nBling cho ma ki ya tene ubolu ero nana. Egba du ki ya koola ubolu ero, I kakini, “ubolu ero chi olaai.” Bling cho ma Coach Tsepo kuma ruu ubolu gbitigbiti. Coach un ya buba amaa rubolun. Amone wéwé atene lebo. Ucholo ubollu elile doo gbaa awaa. Amaa rubolun ma koche ubollu ojodu ki wnaa. Ugbodu, ka mone de, ma chane yoo todu ucholo ki ya wa a lila le. Coach ugbo omune le, ya chulaka Coach Tsepo. Coach alachi le, chei wu gbo ane ungbo ku ma rubolu le ka ku machane. E feun e byene gbe ane le. Umuthi! Oun igbe iyii. Bling chane e ruubollu ugbogbolo le. I chene ruule ki lo ke de gool toh. Taki iyane, ugbogbolo le I ne ke du gool tohn. “Bling”? Amone chane dodun egba le. “Bling”? coach Tsepo le ge dodun. “eneun duu ke ya du me kwane ku we rubolu ki nen”! Bling kayi. Ubollu ero cho olaai. Taki kwane ruboluu gbogbo gbe gba ku eko le takpaa. You are free to download, copy, translate or adapt this story and use the illustrations as long as you attribute in the following way: Ubolu ero chi olaai Author - Pimville Library Soccer Translation - Celine Nongo Illustration - Pimville Library Soccer Language - Level - First sentences © African Storybook Initiative 2019 Creative Commons: Attribution 4.0 Source www.africanstorybook.org Original source",
    source:
      "African Storybook Initiative, 'Ubolu ero chi olaai' (by Celine Nongo, 2020) — https://www.africanstorybook.org/reader.php?id=34837 — CC BY 4.0 ('© African Storybook Initiative / Creative Commons: Attribution 4.0', printed in the PDF). Note: flagged approved=0 on ASb, i.e. not editorially vetted by ASb.",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "grammar_rule",
    topic: "Igala phonology — segment inventory, and why sources disagree",
    content:
      "The most authoritative modern description is Salem Ochala Ejeba's work (PhD, University of Port Harcourt, 2016; published as 'A Grammar of Ígálâ', M&J Grand Orbit, Port Harcourt, 2017, 268 pp, ISBN 9789785420876). Glottolog lists it as the most extensive description of the language. It gives Igala **28 consonants and 7 vowels**.\n\nPublished sources disagree badly, and an annotator should know this:\n- Ejeba (2016, 2017): 28 consonants, 7 vowels — treat as the reference.\n- Arokoyo (2020): 23 consonants.\n- Momoh (2023, ACL RAIL workshop): claims 30 vowels and that Igala has no standard orthography. Both claims are wrong — a standard orthography exists and has since 1931/1980. Do not rely on this paper.\n\nThe 7-vowel system (a e ẹ i o ọ u) is the one point all reliable sources agree on, and it is independently confirmed by character frequencies in the Igala Wikipedia corpus.",
    source:
      "Ejeba, Salem Ochala (2017) 'A Grammar of Ígálâ', M&J Grand Orbit — https://muse.jhu.edu/book/49701/ (paywalled); Glottolog bibliography — https://glottolog.org/langdoc.csv?language=igal1242 (CC BY 4.0); Arokoyo (2020), Dialectologia 25 — https://revistes.ub.edu/index.php/dialectologia/article/download/52528/45042 ; Momoh (2023) — https://aclanthology.org/2023.rail-1.12/",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "grammar_rule",
    topic: "Igala tone — three tones, downstep, and what the orthography hides",
    content:
      "Igala is a three-tone language: High, Mid and Low. In the standard orthography, high tone is marked with an acute accent, low tone with a grave accent, and mid tone is left unmarked.\n\nThe important complication is downstep. Adeniyi (2017) shows that a downstepped high tone in Igala is realised at roughly the level of a mid tone, and is therefore usually written as mid. This means the orthography systematically under-represents the tone system: two words written identically may carry different underlying tones.\n\nPractical consequences for this project:\n- Written Igala is not a reliable guide to tone. Do not infer tone from spelling alone.\n- When a speaker disputes a tone marking, they may well be right even when the written form looks standard.\n- Where a source gives IPA with tone (as Wiktionary does), prefer it over the plain orthographic form.\n\nRoger Blench's Igala materials note the same convention: 'Igala has a three-tone system with mid-tone unmarked. In the standard orthography, open vowels are written with subdots.'",
    source:
      "Adeniyi, Kolawole (2017) 'The Limits of Perception in the Tonal Orthographies of three-tone Systems', Linguistik Online 84(5) — https://bop.unibe.ch/linguistik-online/article/view/3844 (open access); Blench & Gross (2005) 'Igala Mammal Names' — https://rogerblench.info/files/language/niger-congo/vn/yoruboid/igala%20mammal%20names.pdf",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic:
      "Key academic literature on Igala, and where it can actually be obtained",
    content:
      "Glottolog's Igala bibliography holds 38 items: 2 grammars, 4 grammar sketches, 12 phonology/text works, 20 wordlists. None of the 38 carries a URL — there is no open-access route to the core literature.\n\nCore works:\n- Ejeba, Salem Ochala (2016) 'A grammar of Igala', PhD, University of Port Harcourt; published 2017 by M&J Grand Orbit. Paywalled (JSTOR, Project MUSE, African Books Collective). NOTE: the author is Salem Ochala Ejeba, not 'Sunday Adejo Ejeba'.\n- Silverstein, Raymond (1973) 'Igala Historical Phonology', PhD, UCLA.\n- Akinkugbe, Femi (1978) comparative Yoruba/Itsekiri/Igala phonology, PhD, Ibadan, 916 pp.\n- Armstrong, Robert G. (1965) Yoruba-Igala comparative wordlists, Journal of West African Languages.\n- Koelle (1854) Polyglotta Africana — public domain, and the only core source that is freely available.\n\nFreely readable exceptions:\n- The whole Journal of West African Languages archive is free, including Ejeba (2023) 'Ígálâ Concord System', JWAL 50.\n- Adeniyi (2017) on tone orthography, Linguistik Online — open access, high value for tone decisions.\n\nOLAC aggregates only five Igala records (the 1970 Bible, Crúbadán, Glottolog, Ethnologue, LINGUIST List). There is NO Igala holding in ELAR, PARADISEC, or the MPI/Language Archive — verified by direct search of all three.",
    source:
      "Glottolog bibliography (machine-readable; the parameter is language=, not languoid=) — https://glottolog.org/langdoc.csv?language=igal1242&iDisplayLength=500 (CC BY 4.0); Journal of West African Languages — https://journalofwestafricanlanguages.org ; OLAC Igala record via Wayback — http://web.archive.org/web/20260519161455id_/http://www.language-archives.org/language/igl",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "cultural_note",
    topic: "Igala proverbs and oral literature — the scholarship that exists",
    content:
      "There is no dedicated published scholarly collection of Igala folktales. What exists is scattered:\n\n- Egbunu, Fidelis Eleojo (2014) 'Igala Proverbs as Bastions of Societal Harmony', Journal of Educational and Social Research 4(6), DOI 10.5901/jesr.2014.v4n6p259. Free PDF; licensed CC BY-NC 4.0. The NonCommercial clause means its content must not be copied into a corpus for a model that may be commercially served — cite it, do not ingest it.\n- Salifu, Onogu & Egwemi (2024) 'an ecocritical consideration of selected traditional Igala tales', Nigerian Theatre Journal 24(1):87-97, DOI 10.4314/ntj.v24i1.8. Licence unknown.\n- Omachonu, G. S. (ed., 2011) 'Igala Language Studies' includes chapters on oral literature and proverbs. Commercial.\n- Idakwoji's 'An Ígálá-English Lexicon' (2015) contains proverbs, idioms, sayings and metaphors alongside its 5,000+ headwords. Commercial.\n\nImplication: Igala proverbs and folktales are overwhelmingly still held by speakers, not by archives. For this project they are something to collect, not something to find.",
    source:
      "Egbunu (2014) free PDF — https://pdfs.semanticscholar.org/adcb/1bc83bff492c17fd204be0b97fdb258bee11.pdf (CC BY-NC 4.0); Salifu et al. (2024) — https://doi.org/10.4314/ntj.v24i1.8 ; Idakwoji (2015) — https://www.amazon.com/dp/1482827867",
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "vocabulary",
    topic:
      "Igala animal names — cross-source variation worth checking with speakers",
    content:
      "Different reliable sources give different Igala words for the same animal. These are not errors to resolve on paper; they are dialect and register variation that speakers should adjudicate.\n\nLeopard: Wiktionary gives ẹ́kọ̀ and ọ́mátāīna; Blench & Gross (2005) record ábìtì.\nElephant: Blench records àdagbá, with éli marked archaic — Wiktionary independently lists both, and also marks éli obsolete. Two sources agreeing on an archaism is a strong signal.\nBuffalo: Blench éfà; Wiktionary ẹ́fà — the same word, differing only in whether the open vowel is written with a subdot.\nLion: Blench ìdù; Wiktionary ìdù (male lion) with ágábá for lioness.\n\nThe subdot discrepancy (éfà vs ẹ́fà) is worth noting generally: sources vary in how consistently they write open vowels, so a search that does not fold ẹ/e and ọ/o will miss matches.\n\nRoger Blench's stated terms for his materials: 'May be freely quoted but please acknowledge source.'",
    source:
      "Blench, Roger & Paul Gross (2005) 'Igala Mammal Names' — https://rogerblench.info/files/language/niger-congo/vn/yoruboid/igala%20mammal%20names.pdf (list compiled 1981; freely quotable with acknowledgement per Blench's stated terms); English Wiktionary Igala lemmas — https://en.wiktionary.org/wiki/Category:Igala_lemmas (CC BY-SA 4.0)",
    verificationStatus: "external_sourced",
  },
];

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

async function embed(text: string): Promise<number[] | null> {
  try {
    const r = await getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return r.data[0].embedding;
  } catch {
    // No API key or API unavailable — store the row without an embedding.
    // searchRag() falls back to keyword search when vectors are missing.
    return null;
  }
}

async function main() {
  const existing = await prisma.ragEntry.findMany({
    where: { language: LANGUAGE },
    select: { topic: true },
  });
  const seen = new Set(existing.map((e) => e.topic));

  let created = 0;
  let skipped = 0;
  let embedded = 0;

  // pgvector is installed in the "extensions" schema, but DATABASE_URL sets
  // search_path to "wikitongues" only, so an unqualified ::vector cast and the
  // <=> operator do not resolve. Operators cannot be schema-qualified in infix
  // form, so the only fix is to put "extensions" on the search path.
  // NOTE: src/lib/rag.ts has the same problem and currently fails silently into
  // keyword search — see tasks/igala-corpus-sources.md.
  let vectorSupported = true;
  try {
    await prisma.$executeRawUnsafe(
      `SET search_path TO wikitongues, extensions`,
    );
    await prisma.$queryRawUnsafe(
      `SELECT ('[1,2,3]'::vector <=> '[1,2,4]'::vector) AS d`,
    );
  } catch {
    vectorSupported = false;
    console.warn(
      "pgvector not reachable — storing entries without embeddings (searchRag falls back to keyword search).",
    );
  }

  for (const entry of entries) {
    if (seen.has(entry.topic)) {
      skipped++;
      continue;
    }

    const vector = vectorSupported
      ? await embed(`${entry.topic}\n${entry.content}`)
      : null;

    if (vector) {
      await prisma.$queryRawUnsafe(
        `INSERT INTO "RagEntry"
           (id, language, "chunkType", topic, content, source, "verificationStatus", embedding, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7::vector, now(), now())`,
        LANGUAGE,
        entry.chunkType,
        entry.topic,
        entry.content,
        entry.source,
        entry.verificationStatus,
        `[${vector.join(",")}]`,
      );
      embedded++;
    } else {
      await prisma.ragEntry.create({
        data: {
          language: LANGUAGE,
          chunkType: entry.chunkType,
          topic: entry.topic,
          content: entry.content,
          source: entry.source,
          verificationStatus: entry.verificationStatus,
        },
      });
    }

    seen.add(entry.topic);
    created++;
  }

  // Backfill: fill in embeddings for this seed's own rows if an earlier run
  // stored them before pgvector was reachable. This only ever writes the
  // embedding column — it never creates, edits or deletes an entry's content.
  let backfilled = 0;
  if (vectorSupported) {
    const topics = entries.map((e) => e.topic);
    const missing = await prisma.$queryRawUnsafe<
      { id: string; topic: string; content: string }[]
    >(
      `SELECT id, topic, content FROM "RagEntry"
       WHERE language = $1 AND embedding IS NULL AND topic = ANY($2::text[])`,
      LANGUAGE,
      topics,
    );
    for (const row of missing) {
      const vector = await embed(`${row.topic}\n${row.content}`);
      if (!vector) break;
      await prisma.$executeRawUnsafe(
        `UPDATE "RagEntry" SET embedding = $1::vector WHERE id = $2`,
        `[${vector.join(",")}]`,
        row.id,
      );
      backfilled++;
    }
  }

  const total = await prisma.ragEntry.count({ where: { language: LANGUAGE } });
  console.log(
    `Igala RAG seed: ${created} created (${embedded} with embeddings), ${skipped} skipped as already present, ${backfilled} embeddings backfilled.`,
  );
  console.log(`RagEntry rows for "${LANGUAGE}" now: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

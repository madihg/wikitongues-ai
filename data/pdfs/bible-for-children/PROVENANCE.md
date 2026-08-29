# Provenance: Bible for Children - Igala booklets

No written permission is on file for these materials beyond Bible for Children's own published distribution terms (bibleforchildren.org states its booklets are free to copy and distribute non-commercially). A verbal grant was reported (2026-08-29) but is not documented in Gmail or Drive; obtain written permission before any use beyond those published terms, and confirm terms before any public data release. Moot for ingestion today: text extraction is DEFEATED (see below), so nothing from these files may enter any store regardless.

- Source: Bible for Children, Inc. (www.M1914.org), Igala PDF listing at https://bibleforchildren.org/PDFs/igala/
- Downloaded: 2026-08-28 (main booklet variant of each of the 6 titles; CB/CB6/Tract/PDA variants of the same content were not downloaded)
- Copyright notice inside the files: (c)2021 Bible for Children, Inc.; translation credited to christian-translation.com

## Files (SHA-256)

- a0fe93967faf70ff13fa4263ff9b749ff6da2b05795950bf93138c9051c6e38b 01_When_God_Made_Everything_Igala.pdf (314,393 B)
- d77bde75b7e45d2468eae07eee14a632171dfe3d2825b0619807b823124407fd 02_The_Start_of_Mans_Sadness_Igala.pdf (439,528 B)
- c364f6efd38a35ba094b7ce89c914bf867b49f2e24b7affc96669b24afb594d3 03_Noah_and_the_Great_Flood_Igala.pdf (397,095 B)
- 45fe134cdf5e2cb0fc476cabf2a29437cd5f81b76f029377fb48ec864741e4cb 36_The_Birth_of_Jesus_Igala.pdf (434,589 B)
- 6974ecb5c815847633efe869392b8bf3fd6eecf7de0af735ab44a5bc47447c74 54_The_First_Easter_Igala.pdf (409,129 B)
- 417191e32528a2d1b13e15102ace2f988319dc0ff0c07bce46c9ed4c27484f28 60_Heaven_Gods_Beautiful_Home_Igala.pdf (302,694 B)

## Text extraction status: DEFEATED - do not ingest extracted text

pdftotext appears to "work" (it returns fluent-looking text), but the output is
silently lossy and orthographically wrong. Mechanism, established by font
forensics (pdffonts, fontTools, pymupdf, page render comparison):

- Each PDF embeds two Comic Sans subsets: a normal TrueType subset (WinAnsi)
  for plain letters, and a CID TrueType subset (Identity-H, no cmap, glyphs
  named glyph00001...) whose outlines were redrawn with a baked-in underline.
- The typesetters used underlined letters (E̲, e̲, o̲, ...) as the print
  convention for Igala's subdot vowels (Ẹ, ẹ, ọ, ...). The underline lives in
  the glyph outline itself - there are zero vector line drawings on the pages.
- The CID font's ToUnicode CMap maps the underlined glyphs to plain ASCII
  (E, e, o, ...). Extraction therefore collapses ẹ/e and ọ/o into identical
  ASCII; no non-ASCII Igala character appears anywhere in the extracted text
  of any of the six booklets (only ©, curly quotes, dashes).

Sample, page 2 of booklet 01:

- Rendered on the page: "E̲ne̲ ki ko̲: Edward Hughes" / "E̲neke ko̲ takadai dufu, iche̲wn kima che eta e̲tan."
- pdftotext output: "Ene ki ko: Edward Hughes" / "Eneke ko takadai dufu, ichewn kima che eta etan."

Note: "wn" sequences (ichewn, chiwn) are genuinely printed on the page - a
digraph of this orthography - not extraction garbage.

Automated recovery is not possible at the text-extraction layer: both subsets
report the same base font name (ComicSansMS) and identical glyph metrics, so
pdftotext/pymupdf span output cannot tell plain from underlined runs. Recovery
would need content-stream parsing (tracking /F* font-resource switches per
text run) or OCR with an underline-aware model. Until then, NOTHING from these
PDFs enters any database, RAG store, or benchmark.

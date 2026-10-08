/**
 * RagEntry chunkTypes for grammar rows, in a module with no imports so both
 * the grammar block (src/lib/arena/grammar-block.ts, which re-exports these)
 * and the v1 search (src/lib/rag.ts) can read them without pulling each
 * other's dependencies in.
 */

/** The chunkType every grammar-block label reads (v4.3, v4.4, v4.5). */
export const GRAMMAR_CHUNK_TYPE = "grammar_rule";

/**
 * The chunkType of the rows seeded for v4.5 only
 * (prisma/seed-rag-v4-5-grammar.ts). Separate chunkTypes rather than a
 * migration: the block query reads rows by chunkType, so these rows reach no
 * grammar-block label but rag-v4-5, and the live, pooled v4.4 arm and the
 * v4.3/v4.4 exams keep reading exactly the store they were measured on (the
 * common-word statistics in rankGrammarRules included). The v1 RagEntry
 * search (src/lib/rag.ts) excludes them too, by V4_5_ONLY_CHUNK_TYPES.
 */
export const GRAMMAR_CHUNK_TYPE_V4_5 = "grammar_rule_v4_5";

/** The v4.5 tone row's own chunkType: read only when the question asks for
 * tone (asksForTone), so its topic words cannot pull it onto a question that
 * merely contains "question", "ask" or "mark". */
export const GRAMMAR_CHUNK_TYPE_V4_5_TONE = "grammar_rule_v4_5_tone";

/** Every chunkType that exists for rag-v4-5 alone. */
export const V4_5_ONLY_CHUNK_TYPES: readonly string[] = [
  GRAMMAR_CHUNK_TYPE_V4_5,
  GRAMMAR_CHUNK_TYPE_V4_5_TONE,
];

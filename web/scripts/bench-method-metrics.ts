import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { computeMethodMetrics } from "../src/lib/method-metrics";
import { toPublicMethodMetrics } from "../src/lib/public-method-metrics";

/**
 * WHERE THE TIME GOES in computeMethodMetrics, against the live database.
 * Read-only. Written 2026-10-10, when the uncached public endpoint
 * (GET /api/public/method-metrics) had grown to 10.5 s and the first visitor
 * after each deploy watched the marketing site's tiles say "loading" for all
 * of it. See the COST note in src/lib/method-metrics.ts for what was found.
 *
 * For each run it prints the wall time, the CPU time, how long at least one
 * read was in flight (so wall minus that is computation), and every read with
 * its start, duration and row count. It ends with a hash of the full result
 * and of the public payload, computedAt removed, so two checkouts run a
 * moment apart can be compared: same hash, same numbers. (The data is live;
 * a judgment submitted between the two runs changes the hash honestly.)
 *
 * It prints counts, timings and hashes only - no answer, no prompt, no name.
 *
 * Round trips dominate from a laptop far from the database and do not on the
 * deployed function, which sits one region away from the pooler; read the
 * CPU line for what a visitor waits on, and the read list for its shape.
 *
 *   npx tsx --env-file=.env.local scripts/bench-method-metrics.ts [runs]
 *
 * The first run is a cold process (nothing compiled yet), which is what the
 * first request after a deploy gets; later runs are warm.
 */
interface ReadTiming {
  name: string;
  start: number;
  end: number;
  rows: number;
}

/** A PrismaClient that times every model read passing through it. */
function timed(real: PrismaClient, reads: ReadTiming[]): PrismaClient {
  return new Proxy(real, {
    get(target, model: string) {
      const delegate = (target as unknown as Record<string, unknown>)[model];
      if (!delegate || typeof delegate !== "object") return delegate;
      return new Proxy(delegate, {
        get(inner, operation: string) {
          const fn = (inner as Record<string, unknown>)[operation];
          if (typeof fn !== "function") return fn;
          return async (...args: unknown[]) => {
            const start = performance.now();
            const result: unknown = await fn.apply(inner, args);
            reads.push({
              name: `${model}.${operation}`,
              start,
              end: performance.now(),
              rows: Array.isArray(result) ? result.length : 1,
            });
            return result;
          };
        },
      });
    },
  });
}

/** Milliseconds during which at least one read was in flight. */
function inFlight(reads: ReadTiming[]): number {
  const spans = reads.map((r) => [r.start, r.end]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let from = Number.NaN;
  let to = Number.NaN;
  for (const [start, end] of spans) {
    if (Number.isNaN(to) || start > to) {
      if (!Number.isNaN(to)) total += to - from;
      from = start;
      to = end;
    } else {
      to = Math.max(to, end);
    }
  }
  if (!Number.isNaN(to)) total += to - from;
  return total;
}

const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const ms = (n: number) => `${n.toFixed(0)}ms`;

async function main() {
  const runs = Math.max(1, Number(process.argv[2] ?? 3));
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    for (let run = 1; run <= runs; run++) {
      const reads: ReadTiming[] = [];
      const cpuBefore = process.cpuUsage();
      const t0 = performance.now();
      const metrics = await computeMethodMetrics(timed(prisma, reads));
      const payload = toPublicMethodMetrics(metrics);
      const wall = performance.now() - t0;
      const cpu = process.cpuUsage(cpuBefore);
      const reading = inFlight(reads);
      console.log(
        `run ${run}${run === 1 ? " (cold)" : ""}: wall ${ms(wall)} | reads in flight ${ms(reading)} | computing ${ms(wall - reading)} | cpu ${ms((cpu.user + cpu.system) / 1000)} | ${reads.length} reads`,
      );
      if (run === runs) {
        for (const r of reads.sort((a, b) => a.start - b.start)) {
          console.log(
            `  +${ms(r.start - t0).padStart(7)} ${ms(r.end - r.start).padStart(7)} ${String(r.rows).padStart(5)} rows  ${r.name}`,
          );
        }
        console.log(
          `  ${metrics.benchmark.frozenPrompts} frozen prompts, ${metrics.candidates.length} arms on the board, ${metrics.likeForLikePrompts} like-for-like prompts`,
        );
        console.log(`  full result   ${sha({ ...metrics, computedAt: null })}`);
        console.log(
          `  public payload ${sha({ ...payload, computedAt: null })} (${JSON.stringify(payload).length} bytes)`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

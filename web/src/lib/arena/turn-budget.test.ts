import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  CHAT_MAX_DURATION_S,
  LONG_INPUT_WARN_CHARS,
  MIN_REASK_BUDGET_MS,
  PLATFORM_MAX_DURATION_S,
  TURN_BUDGET_MS,
  TURN_CUTOFF_NOTICE,
  TURN_SAFETY_MARGIN_MS,
  deadlineAlarm,
  hasBudgetForReask,
  isLongChatInput,
  longInputNotice,
  remainingMs,
  turnDeadlineFrom,
} from "./turn-budget";

/**
 * THE DEADLINE MATH.
 *
 * The failure this replaces was a bodiless 504: the platform killed the
 * function and the reviewer lost the whole answer with no explanation. The only
 * defence is arithmetic - stop early enough, on our own terms, that the
 * platform never gets the chance. So the arithmetic is what is pinned here,
 * including the two properties a future edit could quietly break: that the
 * deadline lands INSIDE the platform's ceiling, and that declaring a larger
 * maxDuration cannot move it.
 */

describe("the turn budget lands inside the platform ceiling", () => {
  it("pins the platform ceiling to what production has actually shown", () => {
    // An observation, not the constant read back to itself: an 89.8s turn
    // COMPLETED in production on 2026-08-31, so any ceiling below 90s is
    // contradicted by the log. The value itself (120, from the "Task timed
    // out after 120 seconds" line of 2026-09-01T15:24:56Z) is documented on
    // the constant; this test guards the bound the evidence fixes.
    expect(PLATFORM_MAX_DURATION_S).toBeGreaterThanOrEqual(90);
    // A declaration can never buy more than the platform gives. Stated as an
    // inequality rather than today's two numbers, so that lowering the
    // declaration or raising the plan's ceiling are both accepted states.
    expect(TURN_BUDGET_MS).toBeLessThanOrEqual(PLATFORM_MAX_DURATION_S * 1000);
  });

  it("spends min(declared, platform) less the closing margin, and nothing else", () => {
    // The usable budget a turn gets, computed here from the exported inputs
    // rather than from TURN_BUDGET_MS's own definition: the smaller of the two
    // durations in seconds, in ms, with the safety margin taken off the end.
    const usableMs =
      Math.min(CHAT_MAX_DURATION_S, PLATFORM_MAX_DURATION_S) * 1000 -
      TURN_SAFETY_MARGIN_MS;
    expect(turnDeadlineFrom(0)).toBe(usableMs);
    expect(TURN_BUDGET_MS - TURN_SAFETY_MARGIN_MS).toBe(usableMs);
    // The margin is real headroom (closing columns takes time) and is not
    // large enough to eat the turn.
    expect(TURN_SAFETY_MARGIN_MS).toBeGreaterThan(0);
    expect(usableMs).toBeGreaterThan(MIN_REASK_BUDGET_MS);
  });

  it("leaves real headroom for closing the columns", () => {
    expect(TURN_SAFETY_MARGIN_MS).toBeGreaterThan(0);
    expect(TURN_SAFETY_MARGIN_MS).toBeLessThan(TURN_BUDGET_MS / 4);
  });

  it("puts the deadline strictly before the platform would kill the function", () => {
    const start = 1_000_000;
    const deadline = turnDeadlineFrom(start);
    expect(deadline).toBeLessThan(start + PLATFORM_MAX_DURATION_S * 1000);
    expect(deadline).toBe(start + TURN_BUDGET_MS - TURN_SAFETY_MARGIN_MS);
    // And it is a real budget, not a deadline that has already passed.
    expect(deadline).toBeGreaterThan(start);
  });

  it("counts down from an absolute moment, not from wherever the caller is", () => {
    const deadline = turnDeadlineFrom(0);
    expect(remainingMs(deadline, 0)).toBe(
      TURN_BUDGET_MS - TURN_SAFETY_MARGIN_MS,
    );
    expect(remainingMs(deadline, deadline)).toBe(0);
    expect(remainingMs(deadline, deadline + 5_000)).toBe(-5_000);
  });
});

describe("hasBudgetForReask", () => {
  const deadline = 500_000;

  it("allows a second generation while more than the minimum remains", () => {
    expect(
      hasBudgetForReask(deadline, deadline - MIN_REASK_BUDGET_MS - 1),
    ).toBe(true);
    expect(hasBudgetForReask(deadline, deadline - MIN_REASK_BUDGET_MS)).toBe(
      true,
    );
  });

  it("refuses one that cannot plausibly finish", () => {
    expect(
      hasBudgetForReask(deadline, deadline - MIN_REASK_BUDGET_MS + 1),
    ).toBe(false);
    expect(hasBudgetForReask(deadline, deadline - 1_000)).toBe(false);
    expect(hasBudgetForReask(deadline, deadline)).toBe(false);
    expect(hasBudgetForReask(deadline, deadline + 60_000)).toBe(false);
  });

  it("says yes unconditionally when there is NO deadline - the exam path", () => {
    // The frozen exam and the eval route pass no budget. Whatever the clock
    // says, they behave as they did when the frozen numbers were produced.
    for (const now of [0, Date.now(), Number.MAX_SAFE_INTEGER]) {
      expect(hasBudgetForReask(undefined, now)).toBe(true);
    }
  });

  it("wants at least half a minute, which is what one generation cost", () => {
    // Anchored to the incident's own timings: single-attempt turns took 33.7s
    // and 34.2s. A threshold below that would authorise re-asks that cannot
    // land, which is the failure mode, not the fix.
    expect(MIN_REASK_BUDGET_MS).toBeGreaterThanOrEqual(30_000);
    // And it must fit inside a turn, or no re-ask could ever run.
    expect(MIN_REASK_BUDGET_MS).toBeLessThan(
      TURN_BUDGET_MS - TURN_SAFETY_MARGIN_MS,
    );
  });
});

describe("the cutoff notice", () => {
  it("explains the cause, the partiality and the way out, in plain words", () => {
    expect(TURN_CUTOFF_NOTICE).toMatch(/time limit/i);
    expect(TURN_CUTOFF_NOTICE).toMatch(/short/i);
    expect(TURN_CUTOFF_NOTICE).toMatch(/split/i);
    // No status codes, no stack traces: "HTTP 504" is exactly what the
    // reviewer saw and exactly what told her nothing.
    expect(TURN_CUTOFF_NOTICE).not.toMatch(/504|HTTP|timeout|maxDuration/i);
  });
});

describe("long-input pre-flight", () => {
  const long = "word ".repeat(LONG_INPUT_WARN_CHARS); // comfortably over

  it("stays quiet for an ordinary question", () => {
    const question = "How do I greet an elder in the morning?";
    expect(isLongChatInput(question)).toBe(false);
    expect(longInputNotice(question)).toBeNull();
    expect(longInputNotice("")).toBeNull();
  });

  it("warns past the threshold and not before it", () => {
    const atThreshold = "x".repeat(LONG_INPUT_WARN_CHARS);
    const overThreshold = "x".repeat(LONG_INPUT_WARN_CHARS + 1);
    expect(isLongChatInput(atThreshold)).toBe(false);
    expect(isLongChatInput(overThreshold)).toBe(true);
    expect(longInputNotice(overThreshold)).not.toBeNull();
  });

  it("measures the trimmed text, so trailing whitespace cannot trip it", () => {
    expect(isLongChatInput(`${"x".repeat(LONG_INPUT_WARN_CHARS)}     `)).toBe(
      false,
    );
  });

  it("suggests splitting, and never says the message will be refused", () => {
    const notice = longInputNotice(long)!;
    expect(notice).toMatch(/shorter parts/i);
    expect(notice).toMatch(/send it as it is/i);
    expect(notice).not.toMatch(/cannot|too long to send|blocked|truncat/i);
  });

  it("reads its length off the text instead of hardcoding a figure", () => {
    const notice = longInputNotice(long)!;
    expect(notice).toContain(long.trim().length.toLocaleString("en-US"));
    const longer = longInputNotice(`${long}${long}`)!;
    expect(longer).not.toBe(notice);
  });
});

describe("deadlineAlarm", () => {
  it("resolves once the deadline arrives", async () => {
    const alarm = deadlineAlarm(Date.now() + 5);
    await expect(alarm.reached).resolves.toBe("deadline");
    alarm.cancel();
  });

  it("fires immediately for a deadline already in the past", async () => {
    const alarm = deadlineAlarm(Date.now() - 60_000);
    await expect(alarm.reached).resolves.toBe("deadline");
    alarm.cancel();
  });

  it("stays silent after cancel - no timer outlives the answer", async () => {
    const alarm = deadlineAlarm(Date.now() + 5);
    alarm.cancel();
    const settled = await Promise.race([
      alarm.reached,
      new Promise<"still-pending">((r) =>
        setTimeout(() => r("still-pending"), 40),
      ),
    ]);
    expect(settled).toBe("still-pending");
  });
});

/**
 * THE DECLARATION ITSELF.
 *
 * `maxDuration` has to be a literal `export const` in the route because Next
 * reads it at build time, which is exactly the shape that invites a hand-typed
 * number - and a hand-typed number in the route is how the declared ceiling
 * and the enforced one drifted apart in the first place. A grep is the only
 * check that can see a build-time export, so this is a grep.
 */
describe("the chat route declares the duration this module owns", () => {
  const routeSource = readFileSync(
    fileURLToPath(
      new URL("../../app/api/arena/chat/route.ts", import.meta.url),
    ),
    "utf8",
  );

  it("declares a literal that equals this module's ceiling", () => {
    // This assertion USED to require the opposite - that the route write
    // `= CHAT_MAX_DURATION_S` - and that requirement broke production: Next
    // validates route segment config statically, before imports resolve, and
    // rejected the build with "Invalid segment configuration export detected".
    // Local `next build` missed it because Vercel builds with turbopack, which
    // enforces the rule; vitest missed it because a grep for the wrong shape
    // passes happily. So the invariant is not "share the identifier" but
    // "share the value": a literal, checked against the constant here.
    const m = routeSource.match(/export const maxDuration = ([^;]+);/);
    expect(m).not.toBeNull();
    const rhs = (m?.[1] ?? "").trim();
    expect(rhs).toMatch(/^\d+$/);
    expect(Number(rhs)).toBe(CHAT_MAX_DURATION_S);
  });

  it("takes its deadline and its cutoff copy from here too", () => {
    // The deadline is computed ONCE, from the request's own start, and the
    // notice is the module's - not a sentence retyped at the call site.
    expect(routeSource).toContain("turnDeadlineFrom(requestStart)");
    expect(routeSource).toContain("error: TURN_CUTOFF_NOTICE");
  });
});

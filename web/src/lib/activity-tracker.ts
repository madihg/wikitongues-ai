import {
  BEAT_INTERVAL_MS,
  IDLE_LIMIT_MS,
  MAX_BEATS_PER_REQUEST,
  MINUTE_MS,
  activeSpan,
  addSpan,
  ledgerBeats,
  mergeLedgers,
  pruneLedger,
  type Beat,
  type Ledger,
  type Surface,
} from "@/lib/activity";

/**
 * The activity beat, browser side, with everything it touches passed in
 * (clock, tab state, storage, network), so it runs in a test with a fake
 * clock. components/use-activity.ts wires it to the real page.
 *
 * It keeps a ledger of active milliseconds per minute and sends it as beats.
 * A beat that cannot be sent stays in the ledger (and in storage, so it
 * survives a reload) and goes later with its own times. The server takes
 * totals, not differences, so sending a beat again is always safe.
 */
export interface BeatBody {
  sentAt: number;
  beats: Beat[];
}

export interface TrackerEnv {
  now(): number;
  /** The tab is in front. */
  visible(): boolean;
  /** True when the server confirmed the beats. False: keep them, try later. */
  send(body: BeatBody): Promise<boolean>;
  load(): Ledger;
  save(ledger: Ledger): void;
}

const MAX_BACKOFF_MS = 10 * MINUTE_MS;

export class ActivityTracker {
  private ledger: Ledger;
  private lastTickAt: number;
  private lastInputAt: number;
  private visible: boolean;
  private busy = new Set<string>();
  private surface: Surface;
  private demo: boolean;
  private sending = false;
  private failures = 0;
  private nextSendAt = 0;

  constructor(
    private env: TrackerEnv,
    surface: Surface,
    demo = false,
  ) {
    const now = env.now();
    this.ledger = pruneLedger(env.load(), now);
    this.lastTickAt = now;
    // Opening a page follows a click or a tap: it counts as an input.
    this.lastInputAt = now;
    this.visible = env.visible();
    this.surface = surface;
    this.demo = demo;
  }

  /** Close the books up to now under the facts that held since the last tick. */
  tick(): void {
    const now = this.env.now();
    const span = activeSpan(this.lastTickAt, now, {
      visible: this.visible,
      busy: this.busy.size > 0,
      lastInputAt: this.lastInputAt,
    });
    if (span) addSpan(this.ledger, span[0], span[1], this.surface, this.demo);
    // Recording or playing keeps the idle window open until it stops.
    if (this.busy.size > 0 && this.visible) this.lastInputAt = now;
    this.lastTickAt = now;
    this.visible = this.env.visible();
  }

  /** A key press, tap, click or scroll. Only the time is kept. */
  input(): void {
    const now = this.env.now();
    // Coming back after a pause: settle the pause before the clock restarts.
    if (now - this.lastInputAt > IDLE_LIMIT_MS) this.tick();
    this.lastInputAt = now;
  }

  setBusy(kind: string, on: boolean): void {
    if (this.busy.has(kind) === on) return;
    this.tick();
    if (on) this.busy.add(kind);
    else this.busy.delete(kind);
    if (this.visible) this.lastInputAt = this.env.now();
  }

  /** The tab came to the front or went behind. */
  visibilityChanged(): void {
    this.tick();
  }

  /** The person moved to another kind of work, or in or out of a demo. */
  setContext(surface: Surface, demo: boolean): void {
    if (surface === this.surface && demo === this.demo) return;
    this.tick();
    this.surface = surface;
    this.demo = demo;
  }

  /** What is waiting to be sent, for tests and for the page-close beacon. */
  pending(): Beat[] {
    return ledgerBeats(this.ledger);
  }

  /** Write the ledger to storage, keeping whatever another tab left there. */
  persist(): void {
    const now = this.env.now();
    this.env.save(pruneLedger(mergeLedgers(this.env.load(), this.ledger), now));
  }

  /** Tick, then send what there is. Called every 30 seconds and on leaving. */
  async beat(force = false): Promise<void> {
    this.tick();
    const now = this.env.now();
    const beats = ledgerBeats(this.ledger);
    if (beats.length === 0) return;
    this.persist();
    if (this.sending || (!force && now < this.nextSendAt)) return;
    this.sending = true;
    let ok = true;
    try {
      for (let i = 0; i < beats.length && ok; i += MAX_BEATS_PER_REQUEST) {
        ok = await this.env.send({
          sentAt: this.env.now(),
          beats: beats.slice(i, i + MAX_BEATS_PER_REQUEST),
        });
      }
    } catch {
      ok = false;
    } finally {
      this.sending = false;
    }
    if (ok) {
      this.failures = 0;
      this.nextSendAt = 0;
      // Finished minutes that the server has are done. The running minute
      // stays and goes again with its new total.
      this.ledger = pruneLedger(this.ledger, this.env.now(), now);
      this.env.save(this.ledger);
    } else {
      this.failures++;
      this.nextSendAt =
        this.env.now() +
        Math.min(MAX_BACKOFF_MS, BEAT_INTERVAL_MS * 2 ** (this.failures - 1));
    }
  }
}

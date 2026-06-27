import Link from "next/link";

export default function LearnerLandingPage() {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="animate-rise font-mono text-xs uppercase tracking-[0.08em] text-accent-text">
        Wikitongues AI · Igala pilot
      </p>

      <h1 className="animate-rise mt-4 text-balance font-display text-[clamp(2.25rem,6vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.02em] text-text-primary [animation-delay:60ms]">
        Teaching AI to speak{" "}
        <span className="italic text-accent-text">Igala</span>
      </h1>

      <div className="animate-rise mt-6 space-y-4 text-[1.0625rem] leading-relaxed text-text-secondary [animation-delay:120ms]">
        <p>
          This is a collaboration between Halim Madi and{" "}
          <a
            href="https://wikitongues.org"
            target="_blank"
            rel="noreferrer"
            className="text-accent-text underline-offset-2 hover:underline"
          >
            Wikitongues
          </a>
          . You are practicing with an AI tutor for{" "}
          <strong className="font-medium text-text-primary">Igala</strong>, a
          tonal language of Kogi State, Nigeria, spoken by around two million
          people.
        </p>
        <p>
          Today&apos;s AI models barely speak Igala, and what they do produce is
          often wrong. The point of this project is to change that, and to build
          the first public benchmark that holds every model accountable for how
          well it actually speaks the language. It is community-led by design.
        </p>
        <p>
          Chat in English or Igala. When the tutor is confident, it answers
          directly; when it is unsure, the answer is flagged for a fluent
          speaker to review. This is an early pilot, so it will make mistakes,
          and the corrections the community makes are exactly what teaches it.
        </p>
      </div>

      <div className="animate-rise mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 [animation-delay:180ms]">
        <Link
          href="/learner/chat"
          className="inline-flex cursor-pointer items-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          Start practicing
        </Link>
        <span className="font-mono text-xs text-text-tertiary">
          Tonal · Kogi State, Nigeria · ~2M speakers
        </span>
      </div>
    </div>
  );
}

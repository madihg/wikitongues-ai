"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, type Theme } from "@/lib/theme";

function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The dark mode switch, at the foot of the sidebar beside Sign out: the one
 * place every account sees on every page. A real switch (role="switch"), 44px
 * tall, labelled in words.
 */
/** The page's theme is one attribute on <html>; watch it rather than copy it. */
function watchTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}
const pageIsDark = () =>
  document.documentElement.getAttribute("data-theme") === "dark";

export function ThemeToggle() {
  // The head script has already painted the stored choice; the switch reads
  // the page, so the two cannot disagree. The server render says light.
  const dark = useSyncExternalStore(watchTheme, pageIsDark, () => false);
  const flip = () => {
    const next: Theme = dark ? "light" : "dark";
    applyTheme(next, store(), document.documentElement);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={flip}
      className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
    >
      <span>Dark mode</span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          dark ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-[left] ${
            dark ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

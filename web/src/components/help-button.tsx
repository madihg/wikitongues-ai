"use client";

import { useState } from "react";

interface HelpButtonProps {
  title: string;
  description: string;
}

export function HelpButton({ title, description }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Help"
        className="fixed bottom-6 right-6 z-40 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface text-sm font-medium text-text-tertiary shadow-sm transition-colors hover:border-accent hover:text-text-secondary"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6">
          <div
            className="fixed inset-0 bg-black/10"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-md">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                {title}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="cursor-pointer text-text-muted hover:text-text-secondary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

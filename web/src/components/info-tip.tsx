"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Inline "i" explainer. Click to toggle a small popover that explains a
 * technical concept (evals, Bradley-Terry, DPO/SFT, held-out, etc.).
 */
export function InfoTip({
  children,
  label = "More information",
  width = "w-64",
}: {
  children: React.ReactNode;
  label?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onEsc);
    }
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-border-strong font-mono text-[10px] leading-none text-text-tertiary transition-colors hover:border-accent hover:text-accent-text"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute left-1/2 top-6 z-50 ${width} -translate-x-1/2 rounded-md border border-border bg-surface-raised p-3 text-left text-xs font-normal leading-relaxed text-text-secondary shadow-md`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

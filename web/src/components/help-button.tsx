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
        className="fixed bottom-6 right-6 z-40 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-500 shadow-sm transition-colors hover:border-gray-400 hover:text-gray-700"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6">
          <div
            className="fixed inset-0 bg-black/10"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="cursor-pointer text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm leading-relaxed text-gray-600">
              {description}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

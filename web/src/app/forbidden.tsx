/** Shown when a layout calls forbidden() (today: the Speech Lab pages). */
export default function Forbidden() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-text-primary">
          403 - Not for this account
        </h1>
        <p className="mt-2 text-sm text-text-tertiary">
          This page is for researchers only. If you think you should have
          access, ask the project lead.
        </p>
      </div>
    </div>
  );
}

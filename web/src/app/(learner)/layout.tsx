"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/");
    }
  }, [session, status, router]);

  if (status === "loading" || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-text-tertiary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div>
          <span className="text-lg font-semibold text-text-primary">
            Wikitongues AI
          </span>
          <span className="ml-3 text-sm text-text-tertiary">Learner</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">
            {session.user.name || session.user.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="cursor-pointer text-sm text-text-tertiary hover:text-text-secondary"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

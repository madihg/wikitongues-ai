"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { canAccess } from "@/lib/personas";

export function RoleGuard({
  allowedRoles,
  children,
  fallback = "/",
}: {
  allowedRoles: string[];
  children: React.ReactNode;
  /** Where a signed-in-but-not-allowed user lands. Defaults to the home
   *  redirect; pages that have a better "this is where your work moved"
   *  destination (e.g. /annotator/corrections -> the annotate flow) pass it. */
  fallback?: string;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const allowed =
    !!session && canAccess(allowedRoles, session.user.role, session.user.email);

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.push("/login");
      return;
    }

    if (!allowed) {
      router.push(fallback);
    }
  }, [session, status, allowed, router, fallback]);

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-text-tertiary">Loading...</div>
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}

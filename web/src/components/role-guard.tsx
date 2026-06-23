"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { canAccess } from "@/lib/personas";

export function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
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
      router.push("/");
    }
  }, [session, status, allowed, router]);

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

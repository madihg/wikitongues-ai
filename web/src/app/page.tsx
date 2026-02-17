"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.push("/login");
    } else {
      router.push("/annotator");
    }
  }, [session, status, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-gray-500">Redirecting...</div>
    </div>
  );
}

"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getRedirectForRole } from "@/lib/roles";

function LoginCard({
  title,
  description,
  registerHref,
  onSubmit,
  error,
  loading,
}: {
  title: string;
  description: string;
  registerHref: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  error: string;
  loading: boolean;
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{description}</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm"
      >
        {error && (
          <div className="rounded-md bg-danger-subtle p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor={`${title}-email`}
            className="block text-sm font-medium text-text-secondary"
          >
            Email
          </label>
          <input
            id={`${title}-email`}
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor={`${title}-password`}
            className="block text-sm font-medium text-text-secondary"
          >
            Password
          </label>
          <input
            id={`${title}-password`}
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-center text-sm text-text-tertiary">
          Don&apos;t have an account?{" "}
          <Link
            href={registerHref}
            className="text-accent-text hover:underline"
          >
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [learnerError, setLearnerError] = useState("");
  const [learnerLoading, setLearnerLoading] = useState(false);
  const [annotatorError, setAnnotatorError] = useState("");
  const [annotatorLoading, setAnnotatorLoading] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (session) {
      router.push(getRedirectForRole(session.user.role));
    }
  }, [session, status, router]);

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>,
    setError: (msg: string) => void,
    setLoading: (v: boolean) => void,
  ) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    const result = await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.refresh();
    }
  }

  if (status === "loading" || session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-text-tertiary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold text-text-primary">
          Wikitongues AI
        </h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Language learning and annotation platform
        </p>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-8 sm:flex-row sm:gap-6">
        <LoginCard
          title="Learner"
          description="Practice and learn languages"
          registerHref="/register?role=learner"
          onSubmit={(e) => handleLogin(e, setLearnerError, setLearnerLoading)}
          error={learnerError}
          loading={learnerLoading}
        />
        <LoginCard
          title="Annotator / Researcher"
          description="Evaluate and annotate model outputs"
          registerHref="/register"
          onSubmit={(e) =>
            handleLogin(e, setAnnotatorError, setAnnotatorLoading)
          }
          error={annotatorError}
          loading={annotatorLoading}
        />
      </div>
    </div>
  );
}

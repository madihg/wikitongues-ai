"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const annotatorLinks = [
  { href: "/annotator", label: "Dashboard" },
  { href: "/annotator/annotate", label: "Annotate" },
  { href: "/annotator/prompts", label: "Prompts" },
  { href: "/annotator/review", label: "Review" },
];

const researcherLinks = [
  { href: "/admin", label: "Researcher Dashboard" },
  { href: "/admin/arena", label: "Model Arena" },
];

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;

  const isResearcher = session.user.role === "RESEARCHER";
  const links = isResearcher
    ? [...annotatorLinks, ...researcherLinks]
    : annotatorLinks;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h1 className="text-lg text-text-primary">Wikitongues AI</h1>
        <p className="mt-1 text-sm text-text-tertiary">Igala language pilot</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/annotator" &&
              link.href !== "/admin" &&
              pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent-subtle text-accent-text"
                  : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-6 py-4">
        <div className="text-sm font-medium text-text-primary">
          {session.user.name || session.user.email}
        </div>
        <div className="text-xs capitalize text-text-tertiary">
          {session.user.role.charAt(0) +
            session.user.role.slice(1).toLowerCase()}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-3 cursor-pointer text-sm text-text-tertiary transition-colors hover:text-text-primary"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

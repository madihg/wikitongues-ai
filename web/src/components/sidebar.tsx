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

const learnerLinks = [{ href: "/learner/chat", label: "Learner Chat" }];

const adminLinks = [{ href: "/admin", label: "Admin Dashboard" }];

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;

  const isResearcher = session.user.role === "RESEARCHER";
  const links = isResearcher
    ? [...annotatorLinks, ...learnerLinks, ...adminLinks]
    : [...annotatorLinks, ...learnerLinks];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-5">
        <h1 className="text-lg font-semibold text-gray-900">Wikitongues AI</h1>
        <p className="mt-1 text-sm text-gray-500">Annotation Platform</p>
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
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-6 py-4">
        <div className="text-sm font-medium text-gray-900">
          {session.user.name || session.user.email}
        </div>
        <div className="text-xs text-gray-500">{session.user.role}</div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

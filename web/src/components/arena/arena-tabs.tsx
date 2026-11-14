"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ViewTabs } from "@/components/admin/view-tabs";
import { ARENA_TABS, arenaMorePage } from "./arena-nav";

/**
 * The bar across every /admin/arena page. On a Text model page it is the four
 * tabs. On a page that moved under More (costs, demo, fine-tune jobs,
 * trajectory) it says where the page lives now and how to get back, so no tab
 * is lit for a page that is not its own.
 */
export function ArenaTabs() {
  const pathname = usePathname() ?? "";
  const more = arenaMorePage(pathname);

  if (more) {
    return (
      <div className="mb-6 border-b border-border pb-2.5 text-sm text-text-tertiary">
        <Link href="/admin/more" className="font-medium text-accent-text">
          &larr; More
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        {more.section}
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-text-secondary">{more.label}</span>
      </div>
    );
  }

  return <ViewTabs tabs={ARENA_TABS} label="Text model sections" />;
}

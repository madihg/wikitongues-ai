"use client";

import { useSession } from "next-auth/react";
import { ViewTabs } from "@/components/admin/view-tabs";
import { useSpeechLayer } from "@/components/lab/use-speech-layer";
import { canUseLab } from "@/lib/lab-flags";
import { DATA_TABS } from "@/lib/admin/routes";

/**
 * The Data view's tabs: what the speakers wrote and recorded, where they
 * disagree, the question bank, and the downloads. The Speech clips tab reads
 * the speech tables, so it is listed only when the server says speech is on
 * for a researcher (the same probe the sidebar makes).
 */
export function DataTabs() {
  const { data: session } = useSession();
  const speech = useSpeechLayer(canUseLab(session?.user?.role));
  const tabs = speech ? DATA_TABS : DATA_TABS.filter((t) => !t.speech);
  return <ViewTabs tabs={tabs} label="Data sections" />;
}

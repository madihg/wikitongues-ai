import { DataTabs } from "@/components/admin/data-tabs";

/**
 * The Data view: what the speakers wrote and recorded, and whether it is
 * right. /admin/annotations (Text answers, the default tab) keeps its own
 * address and renders the same bar. Role gating is inherited from the /admin
 * layout, and the routes behind each tab check the role themselves.
 */
export default function DataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <DataTabs />
      {children}
    </div>
  );
}

import { ArenaTabs } from "@/components/arena/arena-tabs";

/**
 * Every Model Arena page sits under one persistent tab bar, so the section you
 * are in is always visible and you never have to bounce through a hub page.
 * Role gating is inherited from the /admin layout (RESEARCHER only).
 */
export default function ArenaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ArenaTabs />
      {children}
    </div>
  );
}

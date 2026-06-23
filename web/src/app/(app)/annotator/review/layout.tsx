import { RoleGuard } from "@/components/role-guard";

// The handoff review queue is expert/researcher work, not general annotation.
export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard allowedRoles={["RESEARCHER"]}>{children}</RoleGuard>;
}

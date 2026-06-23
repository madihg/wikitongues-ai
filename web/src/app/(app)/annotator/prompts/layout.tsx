import { RoleGuard } from "@/components/role-guard";

// Prompt-catalogue management is a researcher task, not an annotator one.
export default function PromptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard allowedRoles={["RESEARCHER"]}>{children}</RoleGuard>;
}

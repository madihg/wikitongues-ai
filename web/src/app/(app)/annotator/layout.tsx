import { RoleGuard } from "@/components/role-guard";

export default function AnnotatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={["ANNOTATOR", "RESEARCHER"]}>{children}</RoleGuard>
  );
}

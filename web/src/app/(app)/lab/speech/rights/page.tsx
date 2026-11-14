import { prisma } from "@/lib/prisma";
import { requireLabPage } from "@/lib/speech/page-gate";
import { RightsRegister } from "@/components/lab/rights-register";

export default async function RightsPage() {
  await requireLabPage();

  const sources = await prisma.thirdPartyAudioSource.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      licenseText: true,
      rightsStatus: true,
      confirmedById: true,
      confirmedAt: true,
      notes: true,
    },
  });
  const ids = [
    ...new Set(sources.map((s) => s.confirmedById).filter((x): x is string => !!x)),
  ];
  const people = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameOf = new Map(people.map((p) => [p.id, p.name ?? "a researcher"]));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        Outside audio rights
      </h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Audio that did not come from our own speakers stays out of training and
        every export until its source is cleared here.
      </p>
      <div className="mt-6">
        <RightsRegister
          initial={sources.map((s) => ({
            id: s.id,
            name: s.name,
            licenseText: s.licenseText,
            rightsStatus: s.rightsStatus,
            confirmedBy: s.confirmedById
              ? (nameOf.get(s.confirmedById) ?? "a researcher")
              : null,
            confirmedAt: s.confirmedAt ? s.confirmedAt.toISOString() : null,
            notes: s.notes,
          }))}
        />
      </div>
    </div>
  );
}

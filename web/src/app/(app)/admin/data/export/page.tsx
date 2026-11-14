import { ExportPanel } from "@/components/admin/export-panel";

/** Data, Export: the downloads that used to close the Researcher Dashboard. */
export default function DataExportPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-text-primary">Export</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Download the data as files, to read or analyse outside the platform.
          Demo sessions are left out of every file.
        </p>
      </div>
      <ExportPanel />
    </div>
  );
}

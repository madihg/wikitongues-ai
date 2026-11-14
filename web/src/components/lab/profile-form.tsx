"use client";

import { useEffect, useState } from "react";
import { IGALA_DIALECTS } from "@/lib/dialects";
import {
  AGE_BANDS,
  AGE_BAND_LABEL,
  GENDERS,
  GENDER_LABEL,
  type SpeakerProfileInput,
} from "@/lib/speech/profile";

/**
 * The speaker profile form: dialect, age band and gender, each optional with
 * "Prefer not to say" (stored as nothing), and one switch saying whether age
 * band and gender may be shared with the dataset. The switch starts off.
 */

const NONE = "";

export interface ProfileViewProps {
  value: SpeakerProfileInput;
  busy: boolean;
  saved: boolean;
  error: string | null;
  onChange: (v: SpeakerProfileInput) => void;
  onSave: () => void;
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { key: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <select
        value={value ?? NONE}
        onChange={(e) => onChange(e.target.value === NONE ? null : e.target.value)}
        className="mt-1 block min-h-[44px] w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      >
        <option value={NONE}>Prefer not to say</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProfileView(p: ProfileViewProps) {
  const set = (patch: Partial<SpeakerProfileInput>) =>
    p.onChange({ ...p.value, ...patch });
  return (
    <form
      data-testid="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSave();
      }}
      className="space-y-5"
    >
      <Select
        label="Your dialect"
        value={p.value.dialect}
        options={IGALA_DIALECTS.map((d) => ({ key: d.key, label: d.label }))}
        onChange={(v) => set({ dialect: v })}
      />
      <Select
        label="Your age band"
        value={p.value.ageBand}
        options={AGE_BANDS.map((k) => ({ key: k, label: AGE_BAND_LABEL[k] }))}
        onChange={(v) => set({ ageBand: v })}
      />
      <Select
        label="Your gender"
        value={p.value.gender}
        options={GENDERS.map((k) => ({ key: k, label: GENDER_LABEL[k] }))}
        onChange={(v) => set({ gender: v })}
      />
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={p.value.mayShareDemographics}
          onChange={(e) => set({ mayShareDemographics: e.target.checked })}
          className="mt-1 h-5 w-5"
        />
        <span className="text-sm text-text-secondary">
          My age band and gender may be shared with the dataset. Off by
          default: when this is off, they are never included.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={p.busy}
          className="min-h-[44px] cursor-pointer rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save profile
        </button>
        {p.saved && (
          <span role="status" className="text-sm text-text-secondary">
            Saved.
          </span>
        )}
      </div>
      {p.error && (
        <p role="alert" className="text-sm text-danger">
          {p.error}
        </p>
      )}
    </form>
  );
}

const EMPTY: SpeakerProfileInput = {
  dialect: null,
  ageBand: null,
  gender: null,
  mayShareDemographics: false,
};

export function ProfileForm() {
  const [value, setValue] = useState<SpeakerProfileInput>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/lab/speech/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { profile?: SpeakerProfileInput } | null) => {
        if (live && j?.profile) setValue(j.profile);
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!loaded) return <p className="text-sm text-text-tertiary">Loading...</p>;

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/lab/speech/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) throw new Error("The profile could not be saved.");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The profile could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProfileView
      value={value}
      busy={busy}
      saved={saved}
      error={error}
      onChange={(v) => {
        setSaved(false);
        setValue(v);
      }}
      onSave={() => void save()}
    />
  );
}

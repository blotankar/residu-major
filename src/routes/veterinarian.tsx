
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createTreatment,
  fetchMrlReferences,
  fetchVetCattle,
  fetchVetTreatments,
} from "../lib/api";
import type {
  ApiMedicineMRL,
  ApiTreatment,
  CreateTreatmentInput,
  VetCattle,
} from "../lib/api";
import drugDatabase from "../data/drug_database.json";

export const Route = createFileRoute("/veterinarian")({
  component: VetDashboard,
});

type StandardDrug = {
  id: number;
  salt_name: string;
  withdrawal_period_milk: number;
  category?: string;
  regulatory_status?: string;
  description?: string;
};

type MedicineOption = {
  value: string;
  medicineName: string;
  label: string;
  standardDrug?: StandardDrug;
  mrlReference?: ApiMedicineMRL | undefined;
};

const standardDrugs = drugDatabase as StandardDrug[];

function normalizeMedicineName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getLocalDateTime() {
  const now = new Date();

  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function addWithdrawalDays(dateValue: string, days: number) {
  const date = new Date(dateValue);

  if (
    !Number.isFinite(date.getTime()) ||
    !Number.isFinite(days) ||
    days < 0
  ) {
    return "";
  }

  date.setDate(date.getDate() + days);

  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function formatMrlValue(value: string | number | null, unit: string | null) {
  if (value === null || value === undefined || value === "") {
    return "No numerical value recorded";
  }

  return `${value}${unit ? ` ${unit}` : ""}`;
}

type TreatmentForm = {
  cattleId: string;
  medicineName: string;
  dosage: string;
  administeredAt: string;
  withdrawalEnds: string;
  reason: string;
};

function createEmptyForm(): TreatmentForm {
  return {
    cattleId: "",
    medicineName: "",
    dosage: "",
    administeredAt: getLocalDateTime(),
    withdrawalEnds: "",
    reason: "",
  };
}

function VetDashboard() {
  const [cattle, setCattle] = useState<VetCattle[]>([]);
  const [treatments, setTreatments] = useState<ApiTreatment[]>([]);
  const [mrlReferences, setMrlReferences] = useState<ApiMedicineMRL[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mrlError, setMrlError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCattleId, setSelectedCattleId] = useState("");
  const [form, setForm] = useState<TreatmentForm>(createEmptyForm);
  const [selectedMedicineKey, setSelectedMedicineKey] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    setMrlError("");

    try {
      const [cattleRows, treatmentRows] = await Promise.all([
        fetchVetCattle(),
        fetchVetTreatments(),
      ]);

      setCattle(cattleRows);
      setTreatments(treatmentRows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load veterinarian data.",
      );
    }

    // MRL loading is independent so an MRL endpoint issue does not
    // prevent the veterinarian from accessing cattle and treatment records.
    try {
      const references = await fetchMrlReferences();
      setMrlReferences(references);
    } catch (err) {
      setMrlReferences([]);
      setMrlError(
        err instanceof Error
          ? err.message
          : "Could not load MRL reference data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const medicineOptions = useMemo<MedicineOption[]>(() => {
    const options: MedicineOption[] = [];
    const seenNames = new Set<string>();

    // Keep existing withdrawal-period references.
    for (const drug of standardDrugs) {
      const name = drug.salt_name.trim();
      const normalized = normalizeMedicineName(name);

      if (!name || seenNames.has(normalized)) continue;

      seenNames.add(normalized);

      const matchingMrl = mrlReferences.find(
        (reference) =>
          normalizeMedicineName(reference.medicineName) === normalized,
      );

      options.push({
        value: `standard:${drug.id}`,
        medicineName: name,
        label: `${name} — ${drug.withdrawal_period_milk}-day withdrawal reference`,
        standardDrug: drug,
        mrlReference: matchingMrl,
      });
    }

    // Add database MRL medicines that aren't already in the drug list.
    for (const reference of mrlReferences) {
      const name = reference.medicineName.trim();
      const normalized = normalizeMedicineName(name);

      if (!name || seenNames.has(normalized)) continue;

      seenNames.add(normalized);

      options.push({
        value: `mrl:${reference.id}`,
        medicineName: name,
        label: `${name} — MRL reference`,
        mrlReference: reference,
      });
    }

    return options.sort((a, b) =>
      a.medicineName.localeCompare(b.medicineName),
    );
  }, [mrlReferences]);

  const filteredCattle = useMemo(() => {
    const term = search.trim().toLowerCase();

    return cattle.filter((animal) =>
      [
        animal.cattleId,
        animal.name ?? "",
        animal.breed ?? "",
        animal.farmer?.village ?? "",
        animal.farmer?.user?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [cattle, search]);

  const selectedAnimal = cattle.find(
    (animal) => animal.id === selectedCattleId,
  );

  const selectedMedicineOption = medicineOptions.find(
    (option) => option.value === selectedMedicineKey,
  );

  const selectedStandardDrug = selectedMedicineOption?.standardDrug;

  const selectedMrlReference =
    mrlReferences.find(
      (reference) =>
        normalizeMedicineName(reference.medicineName) ===
        normalizeMedicineName(form.medicineName),
    ) ?? null;

  const activeWithdrawals = treatments.filter((treatment) => {
    if (!treatment.withdrawalEnds) return false;

    const end = new Date(treatment.withdrawalEnds).getTime();

    return Number.isFinite(end) && end > Date.now();
  }).length;

  const needsReview = treatments.filter(
    (treatment) =>
      !treatment.withdrawalEnds ||
      !Number.isFinite(new Date(treatment.withdrawalEnds).getTime()),
  ).length;

  function selectCattle(id: string) {
    setSelectedCattleId(id);
    setForm((current) => ({ ...current, cattleId: id }));
  }

  function selectMedicine(value: string) {
    setSelectedMedicineKey(value);
    setError("");
    setNotice("");

    if (value === "custom") {
      setForm((current) => ({
        ...current,
        medicineName: "",
        withdrawalEnds: "",
      }));
      return;
    }

    if (!value) {
      setForm((current) => ({
        ...current,
        medicineName: "",
        withdrawalEnds: "",
      }));
      return;
    }

    const option = medicineOptions.find((item) => item.value === value);

    if (!option) return;

    setForm((current) => ({
      ...current,
      medicineName: option.medicineName,
      withdrawalEnds: option.standardDrug
        ? addWithdrawalDays(
            current.administeredAt,
            option.standardDrug.withdrawal_period_milk,
          )
        : "",
    }));

    if (option.standardDrug) {
      setNotice(
        "A reference withdrawal period has been proposed. Verify it against the exact product label, prescription, formulation, dosage, route, and applicable regulations.",
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!selectedCattleId) {
      setError("Select a registered animal first.");
      return;
    }

    const administeredAt = new Date(form.administeredAt);

    if (!Number.isFinite(administeredAt.getTime())) {
      setError("Enter a valid administration date.");
      return;
    }

    if (administeredAt.getTime() > Date.now()) {
      setError("Administration date cannot be in the future.");
      return;
    }

    let withdrawalEnds: string | null = null;

    if (form.withdrawalEnds) {
      const end = new Date(form.withdrawalEnds);

      if (!Number.isFinite(end.getTime())) {
        setError("Enter a valid withdrawal end date.");
        return;
      }

      if (end < administeredAt) {
        setError("Withdrawal end date cannot be before administration.");
        return;
      }

      withdrawalEnds = end.toISOString();
    }

    const input: CreateTreatmentInput = {
      cattleId: selectedCattleId,
      medicineName: form.medicineName.trim(),
      dosage: form.dosage.trim(),
      administeredAt: administeredAt.toISOString(),
      withdrawalEnds,
      reason: form.reason.trim(),
    };

    if (!input.medicineName || !input.dosage || !input.reason) {
      setError("Medicine, dosage, and reason are required.");
      return;
    }

    setSaving(true);

    try {
      await createTreatment(input);

      setForm(createEmptyForm());
      setSelectedCattleId("");
      setSelectedMedicineKey("");
      setNotice("Treatment recorded successfully.");

      await reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save treatment.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <h1 className="text-3xl font-bold text-emerald-800">
              ResiduGuard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Veterinarian Portal
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="rounded-lg border px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("residuguard.session");
                window.location.href = "/login";
              }}
              className="rounded-lg border px-4 py-2 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8">
        <section>
          <h2 className="text-3xl font-semibold">
            Treatment management
          </h2>
          <p className="mt-2 text-slate-600">
            Select registered cattle and record veterinary treatment.
          </p>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
          >
            {notice}
          </div>
        )}

        {mrlError && (
          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
          >
            <p className="font-semibold">MRL references unavailable</p>
            <p className="mt-1 text-sm">
              {mrlError} Cattle and treatment management can still be used,
              but database-backed MRL information is unavailable until the
              reference endpoint works.
            </p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat title="Registered cattle" value={cattle.length} />
          <Stat title="Treatment records" value={treatments.length} />
          <Stat title="Active withdrawals" value={activeWithdrawals} />
          <Stat title="Needs review" value={needsReview} />
        </section>

        <section className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-xl font-semibold">Find cattle</h3>

            <label className="mt-4 block text-sm font-medium">
              Search by ID, name, breed, or village
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cattle..."
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
              />
            </label>

            <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {loading ? (
                <p className="p-4 text-sm text-slate-500">
                  Loading cattle...
                </p>
              ) : filteredCattle.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                  No cattle records found.
                </p>
              ) : (
                filteredCattle.map((animal) => (
                  <button
                    key={animal.id}
                    type="button"
                    onClick={() => selectCattle(animal.id)}
                    className={`w-full rounded-xl border p-4 text-left ${
                      selectedCattleId === animal.id
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold">
                      {animal.name || animal.cattleId}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {animal.cattleId} ·{" "}
                      {animal.breed || "Breed not recorded"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Farmer: {animal.farmer?.user?.name || "Not recorded"} ·{" "}
                      {animal.farmer?.village || "Village not recorded"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {animal.treatments?.length ?? 0} treatment records
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-xl font-semibold">Record a treatment</h3>
            <p className="mt-1 text-sm text-slate-500">
              Confirm the applicable withdrawal period for the prescribed
              product.
            </p>

            {selectedAnimal && (
              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                Selected:{" "}
                <strong>
                  {selectedAnimal.name || selectedAnimal.cattleId}
                </strong>{" "}
                ({selectedAnimal.cattleId})
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block text-sm font-medium">
                Selected cattle *
                <select
                  required
                  value={selectedCattleId}
                  onChange={(event) => selectCattle(event.target.value)}
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal"
                >
                  <option value="">Choose cattle</option>
                  {cattle.map((animal) => (
                    <option key={animal.id} value={animal.id}>
                      {animal.cattleId} — {animal.name || "Unnamed"} —{" "}
                      {animal.farmer?.user?.name || "Unknown farmer"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium">
                Medicine name *
                <select
                  required
                  value={selectedMedicineKey}
                  onChange={(event) => selectMedicine(event.target.value)}
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal"
                >
                  <option value="">Choose a medicine</option>

                  {medicineOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}

                  <option value="custom">
                    Other — enter medicine manually
                  </option>
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Medicines come from the existing withdrawal reference list
                  and enabled MRL records stored in the database.
                </span>
              </label>

              {selectedMedicineKey === "custom" && (
                <label className="block text-sm font-medium">
                  Doctor&apos;s medicine name *
                  <input
                    required
                    maxLength={200}
                    value={form.medicineName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        medicineName: event.target.value,
                        withdrawalEnds: "",
                      }))
                    }
                    placeholder="Enter the prescribed medicine name"
                    className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Enter the exact prescribed name. If no matching database
                    MRL reference exists, no MRL value will be displayed.
                  </span>
                </label>
              )}

              {selectedMrlReference ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                  <h4 className="font-semibold">
                    Database MRL reference
                  </h4>

                  <p className="mt-2">
                    <span className="font-medium">Medicine:</span>{" "}
                    {selectedMrlReference.medicineName}
                  </p>

                  {selectedMrlReference.activeIngredient && (
                    <p className="mt-1">
                      <span className="font-medium">Active ingredient:</span>{" "}
                      {selectedMrlReference.activeIngredient}
                    </p>
                  )}

                  <p className="mt-1">
                    <span className="font-medium">Reference value:</span>{" "}
                    {formatMrlValue(
                      selectedMrlReference.mrlValue,
                      selectedMrlReference.unit,
                    )}
                  </p>

                  <p className="mt-1">
                    <span className="font-medium">Regulatory status:</span>{" "}
                    {selectedMrlReference.regulatoryStatus}
                  </p>

                  <p className="mt-1">
                    <span className="font-medium">Unit verification:</span>{" "}
                    {selectedMrlReference.unitVerification || "Not recorded"}
                  </p>

                  {selectedMrlReference.sourceTitle && (
                    <p className="mt-1">
                      <span className="font-medium">Source:</span>{" "}
                      {selectedMrlReference.sourceTitle}
                    </p>
                  )}

                  {selectedMrlReference.sourceUrl && (
                    <p className="mt-2">
                      <a
                        href={selectedMrlReference.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all underline"
                      >
                        View reference source
                      </a>
                    </p>
                  )}

                  <p className="mt-3 border-t border-sky-200 pt-3 text-xs leading-relaxed">
                    This is a database reference, not proof that milk is safe.
                    Verify the applicable authority, species, tissue or milk
                    basis, units, product, and regulatory requirements before
                    using this value for a compliance decision.
                  </p>
                </div>
              ) : form.medicineName.trim() ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold">
                    No matching MRL reference found
                  </p>
                  <p className="mt-1">
                    No enabled database reference exactly matches this
                    medicine name. The treatment can still be recorded.
                    Check the spelling or add a verified reference to the
                    database if appropriate.
                  </p>
                </div>
              ) : null}

              <label className="block text-sm font-medium">
                Dosage and instructions *
                <input
                  required
                  maxLength={200}
                  value={form.dosage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dosage: event.target.value,
                    }))
                  }
                  placeholder="Enter prescribed dosage and units"
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                />
              </label>

              <label className="block text-sm font-medium">
                Administration date and time *
                <input
                  required
                  type="datetime-local"
                  max={getLocalDateTime()}
                  value={form.administeredAt}
                  onChange={(event) => {
                    const administeredAt = event.target.value;

                    setForm((current) => ({
                      ...current,
                      administeredAt,
                      withdrawalEnds: selectedStandardDrug
                        ? addWithdrawalDays(
                            administeredAt,
                            selectedStandardDrug.withdrawal_period_milk,
                          )
                        : current.withdrawalEnds,
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                />
              </label>

              <label className="block text-sm font-medium">
                Withdrawal end date and time
                <input
                  type="datetime-local"
                  value={form.withdrawalEnds}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      withdrawalEnds: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  The suggested date uses the existing withdrawal reference,
                  when available. Verify it against the exact product
                  instructions and applicable regulations.
                </span>
              </label>

              {selectedStandardDrug && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">
                    {selectedStandardDrug.salt_name}
                  </p>
                  <p>
                    Reference milk-withdrawal period:{" "}
                    {selectedStandardDrug.withdrawal_period_milk} day(s)
                  </p>

                  {selectedStandardDrug.category && (
                    <p>Category: {selectedStandardDrug.category}</p>
                  )}

                  {selectedStandardDrug.regulatory_status && (
                    <p>
                      Status in reference dataset:{" "}
                      {selectedStandardDrug.regulatory_status}
                    </p>
                  )}

                  {selectedStandardDrug.description && (
                    <p className="mt-2">
                      {selectedStandardDrug.description}
                    </p>
                  )}

                  <p className="mt-2 text-xs leading-relaxed">
                    This is a proposed reference period, not a substitute for
                    the exact product label or veterinary instructions.
                  </p>
                </div>
              )}

              <label className="block text-sm font-medium">
                Reason for treatment *
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Describe the clinical reason"
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                />
              </label>

              <button
                type="submit"
                disabled={saving || loading || cattle.length === 0}
                className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? "Saving treatment..." : "Save treatment record"}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h3 className="text-xl font-semibold">
            Recent treatment records
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Treatment history saved in the database.
          </p>

          {loading && treatments.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              Loading treatment records...
            </p>
          ) : treatments.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              No treatment records found.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Animal</th>
                    <th className="px-3 py-3">Medicine</th>
                    <th className="px-3 py-3">MRL reference</th>
                    <th className="px-3 py-3">Dosage</th>
                    <th className="px-3 py-3">Administered</th>
                    <th className="px-3 py-3">Withdrawal ends</th>
                    <th className="px-3 py-3">Reason</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {treatments.map((treatment) => (
                    <tr key={treatment.id}>
                      <td className="px-3 py-3">
                        {treatment.cattle?.cattleId ??
                          cattle.find(
                            (animal) => animal.id === treatment.cattleId,
                          )?.cattleId ??
                          treatment.cattleId ??
                          "Not recorded"}
                      </td>

                      <td className="px-3 py-3">
                        {treatment.medicineName}
                      </td>

                      <td className="px-3 py-3">
                        {treatment.medicineMrl
                          ? formatMrlValue(
                              treatment.medicineMrl.mrlValue,
                              treatment.medicineMrl.unit,
                            )
                          : "No linked reference"}
                      </td>

                      <td className="px-3 py-3">
                        {treatment.dosage || "Not recorded"}
                      </td>

                      <td className="px-3 py-3">
                        {formatDate(treatment.administeredAt)}
                      </td>

                      <td className="px-3 py-3">
                        {formatDate(treatment.withdrawalEnds)}
                      </td>

                      <td className="px-3 py-3">
                        {treatment.reason || "Not recorded"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs leading-relaxed text-slate-500">
          An elapsed withdrawal period does not itself prove milk is
          residue-free. MRL references and withdrawal periods are different
          concepts. Verify applicable requirements and perform the required
          residue testing before releasing milk.
        </p>
      </div>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
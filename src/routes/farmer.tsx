
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createCattle,
  fetchCattle,
  fetchMedicineMRL,
} from "../lib/api";
import type { ApiCattle, ApiMedicineMRL } from "../lib/api";

export const Route = createFileRoute("/farmer")({
  component: FarmerDashboard,
});

type Status = "HOLD" | "REVIEW" | "NO_TREATMENTS" | "RECORDED";

type CattleForm = {
  cattleId: string;
  name: string;
  breed: string;
  sex: string;
  dateOfBirth: string;
};

const emptyForm: CattleForm = {
  cattleId: "",
  name: "",
  breed: "",
  sex: "",
  dateOfBirth: "",
};

function getStatus(cattle: ApiCattle): Status {
  const treatments = cattle.treatments ?? [];

  if (treatments.length === 0) return "NO_TREATMENTS";

  const now = Date.now();

  if (
    treatments.some((t) => {
      if (!t.withdrawalEnds) return false;
      const end = new Date(t.withdrawalEnds).getTime();
      return Number.isFinite(end) && end > now;
    })
  ) {
    return "HOLD";
  }

  if (
    treatments.some((t) => {
      if (!t.withdrawalEnds) return true;
      return !Number.isFinite(new Date(t.withdrawalEnds).getTime());
    })
  ) {
    return "REVIEW";
  }

  return "RECORDED";
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid date";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: string) {
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}

function statusLabel(status: Status) {
  switch (status) {
    case "HOLD":
      return "Withdrawal hold";
    case "REVIEW":
      return "Needs review";
    case "NO_TREATMENTS":
      return "No recorded treatments";
    case "RECORDED":
      return "Recorded withdrawal ended";
  }
}

function statusClass(status: Status) {
  switch (status) {
    case "HOLD":
      return "bg-red-100 text-red-800";
    case "REVIEW":
      return "bg-amber-100 text-amber-800";
    case "NO_TREATMENTS":
      return "bg-slate-100 text-slate-700";
    case "RECORDED":
      return "bg-emerald-100 text-emerald-800";
  }
}

// Match a treatment medicine with its MRL reference.
function findMrlReference(
  medicineName: string,
  references: ApiMedicineMRL[]
): ApiMedicineMRL | undefined {
  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " ");

  return references.find(
    (reference) =>
      normalize(reference.medicineName) === normalize(medicineName)
  );
}

function FarmerDashboard() {
  const [cattle, setCattle] = useState<ApiCattle[]>([]);
  const [mrlReferences, setMrlReferences] = useState<ApiMedicineMRL[]>([]);
  const [mrlError, setMrlError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [breedFilter, setBreedFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCattle, setSelectedCattle] = useState<ApiCattle | null>(null);
  const [form, setForm] = useState<CattleForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadCattle = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const records = await fetchCattle();
      setCattle(records);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load cattle records."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Load MRL references independently so an MRL error
  // does not prevent cattle records from loading.
  const loadMrlReferences = useCallback(async () => {
    setMrlError("");

    try {
      const references = await fetchMedicineMRL();
      setMrlReferences(references);
    } catch (err) {
      setMrlError(
        err instanceof Error
          ? err.message
          : "Unable to load MRL references."
      );
    }
  }, []);

  useEffect(() => {
    void loadCattle();
    void loadMrlReferences();
  }, [loadCattle, loadMrlReferences]);

  const breeds = useMemo(
    () =>
      Array.from(
        new Set(
          cattle
            .map((c) => c.breed?.trim())
            .filter((breed): breed is string => Boolean(breed))
        )
      ).sort(),
    [cattle]
  );

  const summary = useMemo(() => {
    const statuses = cattle.map((animal) => getStatus(animal));

    return {
      total: cattle.length,
      holds: statuses.filter((s) => s === "HOLD").length,
      review: statuses.filter((s) => s === "REVIEW").length,
      noTreatments: statuses.filter((s) => s === "NO_TREATMENTS").length,
    };
  }, [cattle]);

  const filteredCattle = useMemo(() => {
    const term = search.trim().toLowerCase();

    return cattle.filter((animal) => {
      const matchesSearch =
        !term ||
        animal.cattleId.toLowerCase().includes(term) ||
        (animal.name ?? "").toLowerCase().includes(term);

      const matchesBreed =
        breedFilter === "ALL" || animal.breed === breedFilter;

      const matchesStatus =
        statusFilter === "ALL" || getStatus(animal) === statusFilter;

      return matchesSearch && matchesBreed && matchesStatus;
    });
  }, [cattle, search, breedFilter, statusFilter]);

  const upcomingAlerts = useMemo(() => {
    const alerts: {
      cattleId: string;
      name: string;
      medicine: string;
      date: string;
      days: number;
    }[] = [];

    cattle.forEach((animal) => {
      (animal.treatments ?? []).forEach((treatment) => {
        if (!treatment.withdrawalEnds) return;

        const days = daysUntil(treatment.withdrawalEnds);

        if (days !== null && days >= 0 && days <= 7) {
          alerts.push({
            cattleId: animal.cattleId,
            name: animal.name || animal.cattleId,
            medicine: treatment.medicineName,
            date: treatment.withdrawalEnds,
            days,
          });
        }
      });
    });

    return alerts.sort((a, b) => a.days - b.days);
  }, [cattle]);

  async function handleAddCattle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    if (!form.cattleId.trim()) {
      setError("Cattle ID is required.");
      return;
    }

    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      if (!Number.isFinite(dob.getTime()) || dob.getTime() > Date.now()) {
        setError("Please enter a valid date of birth that is not in the future.");
        return;
      }
    }

    setSaving(true);

    try {
      await createCattle({
        cattleId: form.cattleId.trim(),
        name: form.name.trim() || null,
        breed: form.breed.trim() || null,
        sex: form.sex || null,
        dateOfBirth: form.dateOfBirth || null,
      });

      setForm(emptyForm);
      setShowAddForm(false);
      setNotice("Cattle registered successfully.");
      await loadCattle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to register cattle."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <h1 className="text-3xl font-bold text-emerald-800">
              ResiduGuard
            </h1>
            <p className="mt-1 text-sm text-slate-500">Farmer Dashboard</p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">
              My livestock records
            </span>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("residuguard.session");
                window.location.href = "/login";
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-7 px-5 py-8">
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold text-amber-950">
              Your livestock
            </h2>
            <p className="mt-2 text-slate-600">
              Manage cattle profiles, treatment records and withdrawal alerts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setError("");
              setNotice("");
              setShowAddForm((value) => !value);
            }}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
          >
            {showAddForm ? "Cancel" : "+ Add New Cattle"}
          </button>
        </section>

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadCattle()}
              className="font-semibold underline"
            >
              Try again
            </button>
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

        {showAddForm && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">Register new cattle</h3>
            <p className="mt-1 text-sm text-slate-500">
              Enter the animal details. Treatment records are managed separately.
            </p>

            <form
              onSubmit={handleAddCattle}
              className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <label className="text-sm font-medium">
                Cattle ID *
                <input
                  required
                  value={form.cattleId}
                  onChange={(e) =>
                    setForm({ ...form, cattleId: e.target.value })
                  }
                  placeholder="e.g. CATTLE-003"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                />
              </label>

              <label className="text-sm font-medium">
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Animal name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                />
              </label>

              <label className="text-sm font-medium">
                Breed
                <input
                  value={form.breed}
                  onChange={(e) => setForm({ ...form, breed: e.target.value })}
                  placeholder="e.g. Gir"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                />
              </label>

              <label className="text-sm font-medium">
                Sex
                <select
                  value={form.sex}
                  onChange={(e) => setForm({ ...form, sex: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                >
                  <option value="">Not specified</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                </select>
              </label>

              <label className="text-sm font-medium">
                Date of birth
                <input
                  type="date"
                  value={form.dateOfBirth}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) =>
                    setForm({ ...form, dateOfBirth: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                />
              </label>

              <div className="flex items-end">
                <button
                  disabled={saving}
                  className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {saving ? "Registering..." : "Register cattle"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Registered cattle"
            value={summary.total}
            description="Animals in your returned records"
            color="blue"
          />
          <SummaryCard
            title="Withdrawal holds"
            value={summary.holds}
            description="Recorded withdrawal period still active"
            color="red"
          />
          <SummaryCard
            title="Needs review"
            value={summary.review}
            description="Treatment has missing or invalid withdrawal data"
            color="amber"
          />
          <SummaryCard
            title="No recorded treatments"
            value={summary.noTreatments}
            description="No treatment entries are currently recorded"
            color="slate"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold">Withdrawal alerts</h3>
              <p className="mt-1 text-sm text-slate-500">
                Active recorded periods and periods ending within 7 days.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
              {upcomingAlerts.length} alert
              {upcomingAlerts.length === 1 ? "" : "s"}
            </span>
          </div>

          {upcomingAlerts.length === 0 ? (
            <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              No active or upcoming withdrawal dates were found in the available
              treatment records.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {upcomingAlerts.map((alert, index) => (
                <div
                  key={`${alert.cattleId}-${alert.medicine}-${alert.date}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {alert.name} ({alert.cattleId})
                    </p>
                    <p className="text-sm text-slate-600">
                      Medicine: {alert.medicine}
                    </p>
                    <p className="text-sm text-slate-600">
                      Withdrawal ends: {formatDate(alert.date)}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-amber-900">
                    {alert.days === 0
                      ? "Ends today"
                      : `${alert.days} day${alert.days === 1 ? "" : "s"} remaining`}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            These are record-based alerts, not laboratory confirmation of milk
            safety. Follow the veterinarian's instructions and applicable
            withdrawal requirements.
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h3 className="text-xl font-semibold">Cattle records</h3>
              <p className="mt-1 text-sm text-slate-500">
                Select a cattle record to view its profile and treatment history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadCattle();
                void loadMrlReferences();
              }}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh records"}
            </button>
          </div>

          {mrlError && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
              MRL references could not be loaded. Treatment records are still
              available.{" "}
              <button
                type="button"
                onClick={() => void loadMrlReferences()}
                className="font-semibold underline"
              >
                Retry MRL loading
              </button>
            </div>
          )}

          <div className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-3">
            <label className="text-sm font-medium">
              Search cattle
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by cattle ID or name..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Filter by breed
              <select
                value={breedFilter}
                onChange={(e) => setBreedFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              >
                <option value="ALL">All breeds</option>
                {breeds.map((breed) => (
                  <option key={breed} value={breed}>
                    {breed}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              Filter by status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              >
                <option value="ALL">All statuses</option>
                <option value="HOLD">Withdrawal hold</option>
                <option value="REVIEW">Needs review</option>
                <option value="NO_TREATMENTS">No recorded treatments</option>
                <option value="RECORDED">Recorded withdrawal ended</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500">
              Loading cattle records...
            </div>
          ) : error && cattle.length === 0 ? (
            <div className="p-10 text-center text-slate-600">
              Cattle records could not be loaded. Check your session and
              backend, then select Refresh records.
            </div>
          ) : filteredCattle.length === 0 ? (
            <div className="p-12 text-center">
              <h4 className="font-semibold">No cattle records found</h4>
              <p className="mt-2 text-sm text-slate-500">
                Try changing your search or filters, or register a new animal.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-5 py-4 font-medium">Cattle ID</th>
                      <th className="px-5 py-4 font-medium">Name</th>
                      <th className="px-5 py-4 font-medium">Breed</th>
                      <th className="px-5 py-4 font-medium">Sex</th>
                      <th className="px-5 py-4 font-medium">Village</th>
                      <th className="px-5 py-4 font-medium">Treatments</th>
                      <th className="px-5 py-4 font-medium">Record status</th>
                      <th className="px-5 py-4 font-medium">Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCattle.map((animal) => {
                      const status = getStatus(animal);
                      return (
                        <tr key={animal.id} className="hover:bg-slate-50">
                          <td className="px-5 py-4 font-medium">
                            {animal.cattleId}
                          </td>
                          <td className="px-5 py-4">{animal.name || "—"}</td>
                          <td className="px-5 py-4">{animal.breed || "—"}</td>
                          <td className="px-5 py-4">{animal.sex || "—"}</td>
                          <td className="px-5 py-4">
                            {animal.farmer?.village || "—"}
                          </td>
                          <td className="px-5 py-4">
                            {animal.treatments?.length ?? 0}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}
                            >
                              {statusLabel(status)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => setSelectedCattle(animal)}
                              className="font-semibold text-emerald-800 underline"
                            >
                              View details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {filteredCattle.map((animal) => {
                  const status = getStatus(animal);
                  return (
                    <button
                      key={animal.id}
                      type="button"
                      onClick={() => setSelectedCattle(animal)}
                      className="block w-full rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{animal.cattleId}</p>
                          <p className="text-sm text-slate-600">
                            {animal.name || "Unnamed animal"} ·{" "}
                            {animal.breed || "Breed not recorded"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${statusClass(status)}`}
                        >
                          {statusLabel(status)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-500">
                        {animal.treatments?.length ?? 0} treatment records
                      </p>
                      <span className="mt-2 inline-block text-sm font-semibold text-emerald-800">
                        View profile →
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
            Showing {filteredCattle.length} of {cattle.length} cattle records
          </div>
        </section>

        <p className="text-xs leading-relaxed text-slate-500">
          Important: compliance indicators are calculated from treatment
          information currently recorded in the system. Missing records do not
          establish that an animal or its milk is residue-free. Withdrawal
          requirements should be verified against the prescribed medicine,
          species, dosage, route and veterinarian's instructions.
        </p>
      </main>

      {selectedCattle && (
        <CattleProfile
          cattle={selectedCattle}
          mrlReferences={mrlReferences}
          onClose={() => setSelectedCattle(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  color,
}: {
  title: string;
  value: number;
  description: string;
  color: "blue" | "red" | "amber" | "slate";
}) {
  const styles = {
    blue: "border-blue-200",
    red: "border-red-200",
    amber: "border-amber-200",
    slate: "border-slate-200",
  };

  return (
    <div
      className={`rounded-2xl border ${styles[color]} bg-white p-5 shadow-sm`}
    >
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function CattleProfile({
  cattle,
  mrlReferences,
  onClose,
}: {
  cattle: ApiCattle;
  mrlReferences: ApiMedicineMRL[];
  onClose: () => void;
}) {
  const treatments = cattle.treatments ?? [];
  const status = getStatus(cattle);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cattle-profile-title"
        className="my-6 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
          <div>
            <p className="text-sm font-medium text-emerald-800">
              Cattle profile
            </p>
            <h2
              id="cattle-profile-title"
              className="mt-1 text-2xl font-bold"
            >
              {cattle.name || cattle.cattleId}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{cattle.cattleId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cattle profile"
            className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Breed" value={cattle.breed || "Not recorded"} />
            <Detail label="Sex" value={cattle.sex || "Not recorded"} />
            <Detail
              label="Date of birth"
              value={formatDate(cattle.dateOfBirth)}
            />
            <Detail
              label="Village"
              value={cattle.farmer?.village || "Not recorded"}
            />
            <Detail
              label="Farmer"
              value={cattle.farmer?.user?.name || "Not recorded"}
            />
            <div>
              <p className="text-sm text-slate-500">Record status</p>
              <span
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusClass(status)}`}
              >
                {statusLabel(status)}
              </span>
            </div>
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Treatment history</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {treatments.length} recorded treatment
                  {treatments.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {treatments.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <h4 className="font-semibold text-slate-800">
                  No treatment records found
                </h4>
                <p className="mt-2 text-sm text-slate-500">
                  No treatments have been recorded for this animal in the
                  available system records.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {treatments
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.administeredAt).getTime() -
                      new Date(a.administeredAt).getTime()
                  )
                  .map((treatment) => {
                    const end = treatment.withdrawalEnds
                      ? daysUntil(treatment.withdrawalEnds)
                      : null;

                    const treatmentStatus = !treatment.withdrawalEnds
                      ? "Needs review: withdrawal end date missing"
                      : end === null
                        ? "Needs review: invalid withdrawal end date"
                        : end > 0
                          ? `Withdrawal active: ${end} day${end === 1 ? "" : "s"} remaining`
                          : end === 0
                            ? "Withdrawal end date is today"
                            : "Recorded withdrawal end date has passed";

                    const mrl = findMrlReference(
                      treatment.medicineName,
                      mrlReferences
                    );

                    const safeSourceUrl =
                      mrl?.sourceUrl &&
                      /^https?:\/\//i.test(mrl.sourceUrl)
                        ? mrl.sourceUrl
                        : null;

                    return (
                      <article
                        key={treatment.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="font-semibold">
                              {treatment.medicineName}
                            </h4>
                            <p className="mt-1 text-sm text-slate-500">
                              Administered:{" "}
                              {formatDate(treatment.administeredAt)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              end === null
                                ? "bg-amber-100 text-amber-800"
                                : end > 0
                                  ? "bg-red-100 text-red-800"
                                  : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {treatmentStatus}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Detail
                            label="Dosage"
                            value={treatment.dosage || "Not recorded"}
                          />
                          <Detail
                            label="Withdrawal ends"
                            value={formatDate(treatment.withdrawalEnds)}
                          />
                          <Detail
                            label="Reason"
                            value={treatment.reason || "Not recorded"}
                          />
                        </div>

                        {/* MRL reference information */}
                        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="font-semibold text-blue-950">
                              Regulatory MRL reference
                            </h5>
                            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-blue-800">
                              Reference data
                            </span>
                          </div>

                          {mrl ? (
                            <>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <Detail
                                  label="MRL value"
                                  value={
                                    mrl.mrlValue === null ||
                                    mrl.mrlValue === undefined
                                      ? "Not specified"
                                      : `${mrl.mrlValue}${mrl.unit ? ` ${mrl.unit}` : ""}`
                                  }
                                />
                                <Detail
                                  label="Active ingredient"
                                  value={mrl.activeIngredient || "Not specified"}
                                />
                                <Detail
                                  label="Regulatory status"
                                  value={mrl.regulatoryStatus || "Not specified"}
                                />
                                <Detail
                                  label="Unit verification"
                                  value={mrl.unitVerification || "Not specified"}
                                />
                              </div>

                              {mrl.sourceTitle && (
                                <p className="mt-3 text-sm text-slate-700">
                                  Source: {mrl.sourceTitle}
                                </p>
                              )}

                              {safeSourceUrl && (
                                <a
                                  href={safeSourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-block text-sm font-semibold text-blue-800 underline"
                                >
                                  View reference source
                                </a>
                              )}
                            </>
                          ) : (
                            <p className="mt-3 text-sm text-slate-700">
                              No enabled MRL reference was found for this
                              medicine in the current reference database.
                            </p>
                          )}

                          <p className="mt-3 border-t border-blue-200 pt-3 text-xs leading-relaxed text-slate-600">
                            An MRL is a regulatory maximum residue limit. It
                            is not a measurement of residue in this animal's
                            milk and does not confirm that the milk is safe.
                            Actual residue status requires appropriate testing.
                          </p>
                        </div>
                      </article>
                    );
                  })}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
          Read-only treatment records. Contact the veterinarian if information
          is missing or needs correction. A recorded end date alone is not proof
          of residue-free milk.
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

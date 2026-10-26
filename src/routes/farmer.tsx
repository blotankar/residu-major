import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { createCattle, fetchCattle, type ApiCattle } from "@/lib/api";
import { useSession } from "@/lib/session";
import { RoleGate } from "@/components/residuguard/RoleGate";

export const Route = createFileRoute("/farmer")({
  component: () => (
    <RoleGate role="farmer">
      <Farmer />
    </RoleGate>
  ),
});

type CattleForm = {
  cattleId: string;
  name: string;
  breed: string;
  sex: string;
  dateOfBirth: string;
};

const EMPTY_FORM: CattleForm = {
  cattleId: "",
  name: "",
  breed: "",
  sex: "",
  dateOfBirth: "",
};

function Farmer() {
  const { user, signOut } = useSession();

  const [cattle, setCattle] = useState<ApiCattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CattleForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadCattle() {
    setLoading(true);
    setLoadError(null);

    try {
      const records = await fetchCattle();
      setCattle(records);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load cattle records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialCattle() {
      try {
        setLoading(true);
        setLoadError(null);

        const records = await fetchCattle();

        if (!cancelled) {
          setCattle(records);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load cattle records.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialCattle();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof CattleForm>(field: K, value: CattleForm[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleAddCattle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError(null);
    setSuccessMessage(null);

    const cattleId = form.cattleId.trim();

    if (!cattleId) {
      setFormError("Please enter a unique cattle ID.");
      return;
    }

    if (form.dateOfBirth) {
      const selectedDate = new Date(`${form.dateOfBirth}T00:00:00`);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (Number.isNaN(selectedDate.getTime()) || selectedDate > today) {
        setFormError("Date of birth cannot be in the future.");
        return;
      }
    }

    setSaving(true);

    try {
      await createCattle({
        cattleId,
        name: form.name.trim() || null,
        breed: form.breed.trim() || null,
        sex: form.sex || null,
        dateOfBirth: form.dateOfBirth || null,
      });

      // Reload records from the backend after the database insert.
      const updatedRecords = await fetchCattle();
      setCattle(updatedRecords);

      setForm({ ...EMPTY_FORM });
      setShowAddForm(false);
      setSuccessMessage(`Cattle ${cattleId} was registered successfully.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to register cattle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold text-emerald-800">ResiduGuard</h1>
            <p className="mt-1 text-sm text-slate-500">Farmer Dashboard</p>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user?.fullName ?? "Farmer"}
            </span>

            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-semibold">Your livestock</h2>
            <p className="mt-2 text-sm text-slate-600">
              Manage your registered cattle and their records.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowAddForm((current) => !current);
              setFormError(null);
              setSuccessMessage(null);
            }}
            className="rounded-lg bg-emerald-700 px-5 py-3 font-medium text-white hover:bg-emerald-800"
          >
            {showAddForm ? "Cancel" : "+ Add New Cattle"}
          </button>
        </section>

        {successMessage && (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {successMessage}
          </div>
        )}

        {showAddForm && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Register New Cattle</h3>

            <p className="mt-1 text-sm text-slate-500">
              Enter the animal details below. The cattle ID must be unique.
            </p>

            <form onSubmit={handleAddCattle} className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Cattle ID *</span>
                  <input
                    required
                    maxLength={100}
                    value={form.cattleId}
                    onChange={(event) => updateField("cattleId", event.target.value)}
                    placeholder="e.g. CATTLE-003"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Use your farm's real identification number.
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Animal name</span>
                  <input
                    maxLength={100}
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    placeholder="e.g. Ganga"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Breed</span>
                  <input
                    maxLength={100}
                    value={form.breed}
                    onChange={(event) => updateField("breed", event.target.value)}
                    placeholder="e.g. Gir"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Sex</span>
                  <select
                    value={form.sex}
                    onChange={(event) => updateField("sex", event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">Select sex</option>
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium">Date of birth</span>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={form.dateOfBirth}
                    onChange={(event) => updateField("dateOfBirth", event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:max-w-md"
                  />
                </label>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-700 px-5 py-3 font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Register Cattle"}
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setShowAddForm(false);
                    setForm({ ...EMPTY_FORM });
                    setFormError(null);
                  }}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-medium hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Registered cattle</p>
            <p className="mt-2 text-3xl font-bold">{loading || loadError ? "—" : cattle.length}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Cattle API status</p>
            <p className="mt-2 text-lg font-semibold">
              {loading ? "Loading..." : loadError ? "Unavailable" : "Responding"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Indicates whether the cattle API returned successfully.
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <h3 className="font-semibold">Cattle records</h3>

            <button
              type="button"
              onClick={() => void loadCattle()}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
            >
              Refresh records
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading cattle records...</p>
            ) : loadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h4 className="font-medium text-red-800">Unable to load cattle records</h4>
                <p className="mt-2 text-sm text-red-700">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void loadCattle()}
                  className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm hover:bg-red-100"
                >
                  Try again
                </button>
              </div>
            ) : cattle.length === 0 ? (
              <div className="py-10 text-center">
                <h4 className="font-semibold">No cattle records yet</h4>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
                  No cattle records are associated with your account. Select Add New Cattle to
                  register your first animal.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-4 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  + Register your first cattle
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-3 py-3 font-medium">Cattle ID</th>
                      <th className="px-3 py-3 font-medium">Name</th>
                      <th className="px-3 py-3 font-medium">Breed</th>
                      <th className="px-3 py-3 font-medium">Sex</th>
                      <th className="px-3 py-3 font-medium">Village</th>
                      <th className="px-3 py-3 font-medium">Treatments</th>
                    </tr>
                  </thead>

                  <tbody>
                    {cattle.map((animal) => (
                      <tr key={animal.id} className="border-b border-slate-100 last:border-0">
                        <td className="whitespace-nowrap px-3 py-4 font-medium">
                          {animal.cattleId}
                        </td>
                        <td className="px-3 py-4">{animal.name || "—"}</td>
                        <td className="px-3 py-4">{animal.breed || "—"}</td>
                        <td className="px-3 py-4">{animal.sex || "—"}</td>
                        <td className="px-3 py-4">{animal.farmer?.village || "—"}</td>
                        <td className="px-3 py-4">{animal.treatments?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}


import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Milk,
  Ban,
  Truck,
  Users,
  Search,
  Plus,
  CheckCircle,
  ClipboardCheck,
  FlaskConical,
  RotateCcw,
} from "lucide-react";

import {
  createMilkBatch,
  createResidueScreening,
  fetchCattle,
  fetchMilkBatches,
  fetchCollectionCentreProfile,
  searchCentreFarmers,
  assignCattleToCentre,
  fetchMedicineMRL,
  type ApiCattle,
  type ApiMilkBatch,
  type ApiMedicineMRL,
  type CollectionCentreFarmer,
  type CollectionCentreProfile,
} from "@/lib/api";

import { PortalShell } from "@/components/residuguard/PortalShell";
import { RoleGate } from "@/components/residuguard/RoleGate";
import { StatCard } from "@/components/residuguard/StatCard";
import { StatusBadge } from "@/components/residuguard/StatusBadge";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatDate, type Status } from "@/lib/residuguard-data";

export const Route = createFileRoute("/collection-centre")({
  head: () => ({
    meta: [
      {
        title: "Collection Centre Dashboard — ResiduGuard",
      },
      {
        name: "description",
        content:
          "Collection centre view: screen incoming milk against withdrawal status and create milk batch IDs.",
      },
      {
        property: "og:title",
        content: "Collection Centre Dashboard — ResiduGuard",
      },
      {
        property: "og:description",
        content:
          "Accept eligible milk, hold animals under withdrawal and issue milk batch IDs.",
      },
    ],
  }),

  component: () => (
    <RoleGate role="collection_centre">
      <CentreDashboard />
    </RoleGate>
  ),
});

// Calculate today's date boundaries using Indian Standard Time.
function getIndiaDayRange() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const start = new Date(`${today}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

// --------------------------------------------------
// RESIDUE SCREENING FORM
// --------------------------------------------------

type ResidueScreeningFormProps = {
  batch: ApiMilkBatch;
  onSaved: () => Promise<void>;
  onCancel: () => void;
};

type ScreeningMeasurementRow = {
  rowId: string;
  medicineMrlId: string;
  measuredValue: string;
  measuredUnit: string;
};

function createMeasurementRow(): ScreeningMeasurementRow {
  return {
    rowId: crypto.randomUUID(),
    medicineMrlId: "",
    measuredValue: "",
    measuredUnit: "",
  };
}

function rowIsInvalid(value: number): boolean {
  return !Number.isFinite(value) || value < 0;
}

function ResidueScreeningForm({
  batch,
  onSaved,
  onCancel,
}: ResidueScreeningFormProps) {
  const [sampleId, setSampleId] = useState("");
  const [testKitName, setTestKitName] = useState("");
  const [testKitBatchNumber, setTestKitBatchNumber] = useState("");

  const [testedAt, setTestedAt] = useState(() => {
    const now = new Date();

    const local = new Date(
      now.getTime() - now.getTimezoneOffset() * 60_000,
    );

    return local.toISOString().slice(0, 16);
  });

  const [medicines, setMedicines] = useState<ApiMedicineMRL[]>([]);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [medicineError, setMedicineError] = useState<string | null>(null);

  const [measurements, setMeasurements] = useState<
    ScreeningMeasurementRow[]
  >([createMeasurementRow()]);

  const [panelComplete, setPanelComplete] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Load medicines enabled for residue screening.
  useEffect(() => {
    let active = true;

    fetchMedicineMRL()
      .then((records) => {
        if (!active) return;

        const enabledRecords = records.filter(
          (medicine) =>
            medicine.isScreeningEnabled &&
            medicine.mrlValue !== null &&
            medicine.unit?.trim(),
        );

        setMedicines(enabledRecords);

        if (enabledRecords.length === 0) {
          setMedicineError(
            "No verified medicines are currently enabled for residue screening. Contact the administrator.",
          );
        }
      })
      .catch((error) => {
        if (!active) return;

        setMedicineError(
          error instanceof Error
            ? error.message
            : "Unable to load screening medicines.",
        );
      })
      .finally(() => {
        if (active) setLoadingMedicines(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateMeasurement(
    rowId: string,
    updates: Partial<ScreeningMeasurementRow>,
  ) {
    setMeasurements((previous) =>
      previous.map((row) =>
        row.rowId === rowId ? { ...row, ...updates } : row,
      ),
    );
  }

  function handleMedicineChange(
    rowId: string,
    medicineMrlId: string,
  ) {
    const medicine = medicines.find(
      (item) => item.id === medicineMrlId,
    );

    updateMeasurement(rowId, {
      medicineMrlId,
      measuredUnit: medicine?.unit ?? "",
    });
  }

  function addMeasurement() {
    setMeasurements((previous) => [
      ...previous,
      createMeasurementRow(),
    ]);
  }

  function removeMeasurement(rowId: string) {
    setMeasurements((previous) =>
      previous.length > 1
        ? previous.filter((row) => row.rowId !== rowId)
        : previous,
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!sampleId.trim()) {
      toast.error("Enter a unique sample ID.");
      return;
    }

    if (!testKitName.trim()) {
      toast.error("Enter the laboratory or test method.");
      return;
    }

    if (!testedAt) {
      toast.error("Select the testing date and time.");
      return;
    }

    if (measurements.length === 0) {
      toast.error("Add at least one residue measurement.");
      return;
    }

    const selectedMedicineIds = measurements.map(
      (row) => row.medicineMrlId,
    );

    if (selectedMedicineIds.some((id) => !id)) {
      toast.error("Select a medicine for every measurement.");
      return;
    }

    if (
      new Set(selectedMedicineIds).size !== selectedMedicineIds.length
    ) {
      toast.error("Each medicine can only be entered once per sample.");
      return;
    }

    const parsedMeasurements = measurements.map((row) => ({
      medicineMrlId: row.medicineMrlId,
      measuredValue: Number(row.measuredValue),
      measuredUnit: row.measuredUnit.trim(),
    }));

    if (
      measurements.some((row) => !row.measuredValue.trim()) ||
      parsedMeasurements.some(
        (measurement) =>
          rowIsInvalid(measurement.measuredValue) ||
          !measurement.measuredUnit,
      )
    ) {
      toast.error(
        "Enter a valid non-negative concentration and unit for every medicine.",
      );
      return;
    }

    setSaving(true);

    try {
      await createResidueScreening(batch.id, {
        sampleId: sampleId.trim(),
        testKitName: testKitName.trim(),
        testedAt: new Date(testedAt).toISOString(),
        panelComplete,
        measurements: parsedMeasurements,

        ...(testKitBatchNumber.trim()
          ? { testKitBatchNumber: testKitBatchNumber.trim() }
          : {}),

        ...(remarks.trim()
          ? { remarks: remarks.trim() }
          : {}),

        ...(reportUrl.trim()
          ? { reportUrl: reportUrl.trim() }
          : {}),
      });

      toast.success(
        "Residue measurements submitted for MRL evaluation.",
      );

      await onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save residue measurements.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-5 rounded-lg border border-border bg-muted/20 p-5"
    >
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <FlaskConical className="h-5 w-5" />
          Quantitative Residue Screening
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Batch: {batch.batchId}. Enter measured residue concentrations
          from a quantitative laboratory report. The backend will
          compare them against the applicable MRL values.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Sample ID *
          <input
            required
            maxLength={100}
            value={sampleId}
            onChange={(event) => setSampleId(event.target.value)}
            placeholder="e.g. SAMPLE-2026-001"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          Laboratory / Test Method *
          <input
            required
            maxLength={150}
            value={testKitName}
            onChange={(event) => setTestKitName(event.target.value)}
            placeholder="e.g. LC-MS/MS"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          Report / Test Reference
          <input
            maxLength={100}
            value={testKitBatchNumber}
            onChange={(event) =>
              setTestKitBatchNumber(event.target.value)
            }
            placeholder="Enter report reference"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          Date and Time Tested *
          <input
            type="datetime-local"
            required
            value={testedAt}
            onChange={(event) => setTestedAt(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="font-semibold">Residue Measurements</h4>

          <p className="mt-1 text-xs text-muted-foreground">
            Enter the actual measured concentrations from the laboratory
            report. MRL values are retrieved by the backend.
          </p>
        </div>

        {loadingMedicines && (
          <p className="text-sm text-muted-foreground">
            Loading approved screening medicines...
          </p>
        )}

        {medicineError && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {medicineError}
          </p>
        )}

        {measurements.map((row, index) => {
          const selectedMedicine = medicines.find(
            (medicine) => medicine.id === row.medicineMrlId,
          );

          const alreadySelected = new Set(
            measurements
              .filter((item) => item.rowId !== row.rowId)
              .map((item) => item.medicineMrlId),
          );

          return (
            <div
              key={row.rowId}
              className="space-y-3 rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  Measurement {index + 1}
                </p>

                {measurements.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMeasurement(row.rowId)}
                  >
                    <Ban className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm font-medium sm:col-span-1">
                  Medicine *
                  <select
                    required
                    value={row.medicineMrlId}
                    disabled={
                      loadingMedicines || medicines.length === 0
                    }
                    onChange={(event) =>
                      handleMedicineChange(
                        row.rowId,
                        event.target.value,
                      )
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
                  >
                    <option value="">Select medicine</option>

                    {medicines.map((medicine) => (
                      <option
                        key={medicine.id}
                        value={medicine.id}
                        disabled={alreadySelected.has(medicine.id)}
                      >
                        {medicine.medicineName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-medium">
                  Measured Concentration *
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={row.measuredValue}
                    onChange={(event) =>
                      updateMeasurement(row.rowId, {
                        measuredValue: event.target.value,
                      })
                    }
                    placeholder="e.g. 0.002"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
                  />
                </label>

                <label className="space-y-1 text-sm font-medium">
                  Unit *
                  <input
                    required
                    value={row.measuredUnit}
                    onChange={(event) =>
                      updateMeasurement(row.rowId, {
                        measuredUnit: event.target.value,
                      })
                    }
                    placeholder={
                      selectedMedicine?.unit ?? "Select medicine first"
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
                  />
                </label>
              </div>

              {selectedMedicine && (
                <p className="text-xs text-muted-foreground">
                  Reference unit: {selectedMedicine.unit}. The backend
                  will verify unit compatibility before calculating.
                </p>
              )}
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={addMeasurement}
          disabled={
            loadingMedicines ||
            medicines.length === 0 ||
            measurements.length >= medicines.length
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add another medicine
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="panelComplete"
            checked={panelComplete}
            onCheckedChange={(checked) =>
              setPanelComplete(checked === true)
            }
          />

          <div>
            <label
              htmlFor="panelComplete"
              className="cursor-pointer text-sm font-semibold"
            >
              Laboratory test panel is complete
            </label>

            <p className="mt-1 text-xs text-muted-foreground">
              Confirm only when the laboratory has completed the
              required validated testing panel for this sample.
              An incomplete panel cannot qualify the batch as SAFE.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Remarks
          <textarea
            rows={3}
            maxLength={1000}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Optional laboratory observations..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          Laboratory Report URL
          <input
            type="url"
            value={reportUrl}
            onChange={(event) => setReportUrl(event.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
          />

          <span className="block text-xs text-muted-foreground">
            Optional link to the original laboratory report.
          </span>
        </label>
      </div>

      <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        The final POSITIVE, NEGATIVE or INVALID result will be
        calculated by the backend. No result can be selected manually.
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>

        <Button
          type="submit"
          disabled={
            saving || loadingMedicines || medicines.length === 0
          }
        >
          <ClipboardCheck className="mr-2 h-4 w-4" />
          {saving
            ? "Evaluating measurements..."
            : "Submit for MRL Evaluation"}
        </Button>
      </div>
    </form>
  );
}

// --------------------------------------------------
// COLLECTION CENTRE DASHBOARD
// --------------------------------------------------

function CentreDashboard() {
  const [cattle, setCattle] = useState<ApiCattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [batches, setBatches] = useState<ApiMilkBatch[]>([]);
  const [volumeL, setVolumeL] = useState("50");
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [screeningBatchId, setScreeningBatchId] =
    useState<string | null>(null);

  const [centreProfile, setCentreProfile] =
    useState<CollectionCentreProfile | null>(null);

  const [farmerSearch, setFarmerSearch] = useState("");
  const [farmerResults, setFarmerResults] = useState<
    CollectionCentreFarmer[]
  >([]);

  const [searchingFarmers, setSearchingFarmers] = useState(false);
  const [farmerSearchError, setFarmerSearchError] =
    useState<string | null>(null);

  const [hasSearched, setHasSearched] = useState(false);

  const [selectedFarmer, setSelectedFarmer] =
    useState<CollectionCentreFarmer | null>(null);

  const [selectedCows, setSelectedCows] = useState<string[]>([]);
  const [assigningCows, setAssigningCows] = useState(false);

  // Load collection centre cattle, batches and profile.
  async function refreshCollectionData() {
    const [cattleRecords, batchRecords, profile] = await Promise.all([
      fetchCattle(),
      fetchMilkBatches(),
      fetchCollectionCentreProfile(),
    ]);

    setCattle(cattleRecords);
    setBatches(batchRecords);
    setCentreProfile(profile);

    setSelected((previous) => {
      const safeIds = cattleRecords
        .filter((cow) => {
          const latest = cow.treatments[0];

          return (
            !latest ||
            (latest.withdrawalEnds !== null &&
              new Date(latest.withdrawalEnds).getTime() < Date.now())
          );
        })
        .map((cow) => cow.id);

      return previous.filter((id) => safeIds.includes(id));
    });

    setError(null);
  }

  useEffect(() => {
    refreshCollectionData()
      .catch((err) => {
        console.error("Failed to load collection centre data:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load collection data.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  // Search farmers using Farmer ID or farmer name.
  async function handleFarmerSearch(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const query = farmerSearch.trim();

    if (!query) {
      setFarmerSearchError("Enter a Farmer ID or farmer name.");
      setFarmerResults([]);
      setSelectedFarmer(null);
      setHasSearched(false);
      return;
    }

    setSearchingFarmers(true);
    setFarmerSearchError(null);
    setSelectedFarmer(null);
    setSelectedCows([]);
    setHasSearched(true);

    try {
      const results = await searchCentreFarmers(query);

      setFarmerResults(results);

      if (results.length === 0) {
        setFarmerSearchError("No matching farmers found.");
      } else if (results.length === 1) {
        setSelectedFarmer(results[0] ?? null);
      }
    } catch (err) {
      setFarmerResults([]);

      setFarmerSearchError(
        err instanceof Error
          ? err.message
          : "Unable to search farmers.",
      );
    } finally {
      setSearchingFarmers(false);
    }
  }

  function handleSelectFarmer(farmer: CollectionCentreFarmer) {
    setSelectedFarmer(farmer);
    setSelectedCows([]);
    setFarmerSearchError(null);
  }

  function toggleCowSelection(cowId: string, checked: boolean) {
    setSelectedCows((previous) =>
      checked
        ? [...new Set([...previous, cowId])]
        : previous.filter((id) => id !== cowId),
    );
  }

  async function handleAssignSelectedCows() {
    if (!selectedFarmer || selectedCows.length === 0) {
      toast.error("Select at least one cow.");
      return;
    }

    setAssigningCows(true);
    setFarmerSearchError(null);

    try {
      await assignCattleToCentre(selectedCows);

      toast.success(
        `${selectedCows.length} cow(s) added to your collection centre.`,
      );

      setSelectedCows([]);

      await refreshCollectionData();

      const results = await searchCentreFarmers(farmerSearch.trim());
      setFarmerResults(results);

      const updatedFarmer = results.find(
        (farmer) => farmer.id === selectedFarmer.id,
      );

      if (updatedFarmer) {
        setSelectedFarmer(updatedFarmer);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to assign selected cows.";

      setFarmerSearchError(message);
      toast.error(message);
    } finally {
      setAssigningCows(false);
    }
  }

  // Calculate withdrawal eligibility for every assigned cow.
  const intake = useMemo(
    () =>
      cattle.map((cow) => {
        const latest = cow.treatments[0];

        const clearsOn = latest?.withdrawalEnds
          ? new Date(latest.withdrawalEnds)
          : undefined;

        const held = Boolean(
          latest && (!clearsOn || clearsOn.getTime() >= Date.now()),
        );

        return {
          cow,
          wd: {
            status: (held ? "HOLD" : "SAFE") as Status,

            reason: held
              ? clearsOn
                ? `Milk is held until ${formatDate(clearsOn)}.`
                : "Latest treatment has no confirmed withdrawal end date."
              : latest
                ? `Latest withdrawal ended ${formatDate(clearsOn!)}.`
                : "No antibiotic treatment recorded.",

            clearsOn,
          },
        };
      }),
    [cattle],
  );

  // Identify cattle that have already contributed to a batch today.
  const { start: todayStart, end: tomorrowStart } = getIndiaDayRange();

  const cattleAlreadyBatchedToday = useMemo(() => {
    const ids = new Set<string>();

    batches.forEach((batch) => {
      const batchDate = new Date(batch.date);

      if (batchDate >= todayStart && batchDate < tomorrowStart) {
        batch.contributingAnimals.forEach((animal) => {
          ids.add(animal.cattle.id);
        });
      }
    });

    return ids;
  }, [batches, todayStart, tomorrowStart]);

  // Remove cattle already used today from today's intake list.
  const availableIntake = useMemo(
    () =>
      intake.filter(
        (record) => !cattleAlreadyBatchedToday.has(record.cow.id),
      ),
    [intake, cattleAlreadyBatchedToday],
  );

  const eligible = availableIntake.filter(
    (record) => record.wd.status === "SAFE",
  );

  // Remove already-batched cattle from the current selection too.
  useEffect(() => {
    setSelected((previous) =>
      previous.filter((id) => !cattleAlreadyBatchedToday.has(id)),
    );
  }, [cattleAlreadyBatchedToday]);

  function toggle(id: string, checked: boolean) {
    setSelected((previous) =>
      checked
        ? [...new Set([...previous, id])]
        : previous.filter((item) => item !== id),
    );
  }

  async function createBatch() {
    const quantity = Number(volumeL);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBatchError("Enter a valid milk quantity greater than zero.");
      return;
    }

    if (selected.length === 0) {
      setBatchError("Select at least one eligible animal.");
      return;
    }

    setSavingBatch(true);
    setBatchError(null);

    try {
      const result = await createMilkBatch({
        cattleIds: selected,
        volumeL: quantity,
      });

      await refreshCollectionData();

      setSelected([]);

      toast.success(`Milk batch ${result.milkBatch.batchId} created`, {
        description: `${quantity} L recorded with its contributing eligible animals.`,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to create milk batch.";

      setBatchError(message);

      try {
        await refreshCollectionData();
      } catch (refreshError) {
        console.error(
          "Failed to refresh collection data:",
          refreshError,
        );
      }
    } finally {
      setSavingBatch(false);
    }
  }

  const farmersCount = new Set(
    cattle.map((cow) => cow.farmer.user.name),
  ).size;

  return (
    <PortalShell
      role="collection_centre"
      title="Collection Centre Dashboard"
      subtitle={`${centreProfile?.code ?? "Loading centre code..."} · Manage farmer assignments, screen incoming milk, and create milk batches.`}
    >
      {/* STATISTICS */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Farmers Registered"
          value={farmersCount}
          icon={Users}
        />

        <StatCard
          label="Animals Eligible Today"
          value={eligible.length}
          icon={Milk}
          tone="safe"
        />

        <StatCard
          label="Animals Blocked (HOLD)"
          value={intake.filter((record) => record.wd.status === "HOLD").length}
          icon={Ban}
          tone="hold"
        />

        <StatCard
          label="Batches Dispatched"
          value={
            batches.filter(
              (batch) => batch.processingBatches.length > 0,
            ).length
          }
          icon={Truck}
          tone="info"
        />
      </div>

      {/* FARMER SEARCH AND COW ASSIGNMENT */}
      <section className="panel mt-6 p-5">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5" />
            Search and Add Farmers' Cows
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Search using Farmer ID or farmer name. Select the cows you
            want to add to your collection centre.
          </p>
        </div>

        <form
          onSubmit={handleFarmerSearch}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              type="text"
              value={farmerSearch}
              onChange={(event) => setFarmerSearch(event.target.value)}
              placeholder="Search by Farmer ID or farmer name..."
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <Button type="submit" disabled={searchingFarmers}>
            {searchingFarmers ? "Searching..." : "Search Farmer"}
          </Button>
        </form>

        {farmerSearchError && (
          <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {farmerSearchError}
          </p>
        )}

        {/* FARMER SEARCH RESULTS */}
        {hasSearched && farmerResults.length > 0 && (
          <div className="mt-5 space-y-3">
            <h3 className="text-sm font-semibold">
              Matching Farmers ({farmerResults.length})
            </h3>

            {farmerResults.map((farmer) => (
              <button
                key={farmer.id}
                type="button"
                onClick={() => handleSelectFarmer(farmer)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  selectedFarmer?.id === farmer.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{farmer.name}</p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Farmer ID: {farmer.id}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Village: {farmer.village}
                      {farmer.phone ? ` · Phone: ${farmer.phone}` : ""}
                    </p>

                    <p className="mt-1 text-sm">
                      Registered cows: {farmer.cattle.length}
                    </p>
                  </div>

                  {selectedFarmer?.id === farmer.id && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* SELECTED FARMER'S COWS */}
        {selectedFarmer && (
          <div className="mt-6 border-t border-border pt-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold">
                Cows registered under {selectedFarmer.name}
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Select the cows you want to add to your collection centre.
              </p>
            </div>

            {selectedFarmer.cattle.length === 0 ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                This farmer has no registered cows.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Select</TableHead>
                        <TableHead>Cow ID</TableHead>
                        <TableHead>Cow Name</TableHead>
                        <TableHead>Assignment Status</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {selectedFarmer.cattle.map((cow) => (
                        <TableRow key={cow.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCows.includes(cow.id)}
                              disabled={cow.assignedToAnotherCentre}
                              onCheckedChange={(value) =>
                                toggleCowSelection(
                                  cow.id,
                                  Boolean(value),
                                )
                              }
                              aria-label={`Select cow ${cow.cattleId}`}
                            />
                          </TableCell>

                          <TableCell className="font-medium">
                            {cow.cattleId}
                          </TableCell>

                          <TableCell>{cow.name ?? "Unnamed"}</TableCell>

                          <TableCell>
                            {cow.assignedToAnotherCentre ? (
                              <span className="text-sm text-destructive">
                                Assigned to another centre
                              </span>
                            ) : cow.assignedToThisCentre ? (
                              <span className="text-sm text-safe">
                                Already in your centre
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Not assigned
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {selectedCows.length} cow(s) selected
                  </p>

                  <Button
                    onClick={handleAssignSelectedCows}
                    disabled={
                      selectedCows.length === 0 || assigningCows
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />

                    {assigningCows
                      ? "Adding cows..."
                      : `Add selected cows to my centre (${selectedCows.length})`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* DASHBOARD TABS */}
      <Tabs defaultValue="intake" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="intake">
            Milk Intake Screening
          </TabsTrigger>

          <TabsTrigger value="batches">
            Milk Batches
          </TabsTrigger>

          <TabsTrigger value="blocked">
            Blocked Animals
          </TabsTrigger>
        </TabsList>

        {/* MILK INTAKE SCREENING */}
        <TabsContent value="intake" className="mt-5">
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Today's intake screening
                </h2>

                <p className="text-sm text-muted-foreground">
                  Animals already included in today's batch are removed
                  from this list. Animals under an active withdrawal period
                  cannot be added to a pooled batch.
                </p>
              </div>

              <Button
                onClick={createBatch}
                disabled={
                  selected.length === 0 ||
                  savingBatch ||
                  loading ||
                  Boolean(error)
                }
              >
                {savingBatch
                  ? "Creating batch..."
                  : `Create milk batch (${selected.length} animals)`}
              </Button>
            </div>

            <label className="mt-4 block max-w-xs text-sm font-medium">
              Milk quantity (L)

              <input
                type="number"
                min="0.001"
                step="0.001"
                required
                value={volumeL}
                onChange={(event) => setVolumeL(event.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>

            {loading && (
              <p className="mt-4 text-sm text-muted-foreground">
                Loading cattle from PostgreSQL...
              </p>
            )}

            {(error || batchError) && (
              <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error || batchError}
              </p>
            )}

            {!loading && !error && cattle.length === 0 && (
              <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                No cattle have been assigned to your collection centre yet.
                Search for a farmer above and add their cattle to begin
                intake screening.
              </p>
            )}

            {!loading && !error && cattle.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                {availableIntake.length === 0 ? (
                  <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
                    No cattle available for today's intake. All assigned
                    cattle may already have contributed to a batch today.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Pool</TableHead>
                        <TableHead>Cow</TableHead>
                        <TableHead>Farmer</TableHead>
                        <TableHead>Village</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Eligibility</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {availableIntake.map(({ cow, wd }) => (
                        <TableRow key={cow.id}>
                          <TableCell>
                            <Checkbox
                              checked={selected.includes(cow.id)}
                              disabled={wd.status === "HOLD"}
                              onCheckedChange={(value) =>
                                toggle(cow.id, Boolean(value))
                              }
                              aria-label={`Pool milk from ${cow.cattleId}`}
                            />
                          </TableCell>

                          <TableCell className="font-medium">
                            {cow.cattleId} · {cow.name ?? "Unnamed"}
                          </TableCell>

                          <TableCell>{cow.farmer.user.name}</TableCell>
                          <TableCell>{cow.farmer.village}</TableCell>

                          <TableCell className="max-w-sm text-sm text-muted-foreground">
                            {wd.reason}
                          </TableCell>

                          <TableCell>
                            <StatusBadge status={wd.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* MILK BATCHES AND RESIDUE SCREENING */}
        <TabsContent value="batches" className="mt-5">
          <div className="panel overflow-x-auto p-5">
            <div className="mb-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Milk className="h-5 w-5" />
                Milk Batch Management
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Record quantitative residue measurements and monitor
                the MRL screening status of every milk batch.
              </p>
            </div>

            {batches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {loading
                  ? "Loading milk batches..."
                  : "No milk batches recorded yet."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Milk Batch ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Contributing Animals</TableHead>
                    <TableHead>Screening</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dispatched To</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {batches.map((batch) => {
                    const screenings = batch.residueScreenings ?? [];
                    const latestScreening = screenings[0];

                    const hasPositiveScreening = screenings.some(
                      (screening) => screening.result === "POSITIVE",
                    );

                    const canScreen =
                      !hasPositiveScreening &&
                      (batch.status === "PENDING_SCREENING" ||
                        (batch.status === "HOLD" &&
                          latestScreening?.result === "INVALID"));

                    const isExpanded = screeningBatchId === batch.id;

                    return (
                      <Fragment key={batch.id}>
                        <TableRow>
                          <TableCell className="font-medium">
                            {batch.batchId}
                          </TableCell>

                          <TableCell>
                            {formatDate(batch.date)}
                          </TableCell>

                          <TableCell>
                            {Number(batch.volumeL)} L
                          </TableCell>

                          <TableCell className="max-w-xs text-sm text-muted-foreground">
                            {batch.contributingAnimals
                              .map(({ cattle: cow }) => cow.cattleId)
                              .join(", ")}
                          </TableCell>

                          <TableCell>
                            {latestScreening ? (
                              <div className="space-y-1">
                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                    latestScreening.result === "NEGATIVE"
                                      ? "bg-safe/10 text-safe"
                                      : latestScreening.result === "POSITIVE"
                                        ? "bg-destructive/10 text-destructive"
                                        : "bg-hold/10 text-hold"
                                  }`}
                                >
                                  {latestScreening.result}
                                </span>

                                <p className="text-xs text-muted-foreground">
                                  {formatDate(latestScreening.testedAt)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not tested
                              </span>
                            )}
                          </TableCell>

                          <TableCell>
                            <StatusBadge
                              status={batch.status as Status}
                            />
                          </TableCell>

                          <TableCell>
                            {batch.processingBatches[0]?.processingBatch
                              .batchId ?? "At collection centre"}
                          </TableCell>

                          <TableCell>
                            {canScreen ? (
                              <Button
                                size="sm"
                                variant={isExpanded ? "outline" : "default"}
                                onClick={() =>
                                  setScreeningBatchId(
                                    isExpanded ? null : batch.id,
                                  )
                                }
                              >
                                {latestScreening?.result === "INVALID" ? (
                                  <>
                                    <RotateCcw className="mr-1 h-4 w-4" />
                                    Retest
                                  </>
                                ) : (
                                  <>
                                    <FlaskConical className="mr-1 h-4 w-4" />
                                    Screen
                                  </>
                                )}
                              </Button>
                            ) : hasPositiveScreening ? (
                              <span className="text-xs font-medium text-destructive">
                                Confirmatory clearance required
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Screening complete
                              </span>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* EXPANDABLE SCREENING FORM AND HISTORY */}
                        <TableRow>
                          <TableCell colSpan={8} className="p-0">
                            {isExpanded && (
                              <div className="space-y-5 p-4">
                                <ResidueScreeningForm
                                  batch={batch}
                                  onCancel={() =>
                                    setScreeningBatchId(null)
                                  }
                                  onSaved={async () => {
                                    setScreeningBatchId(null);
                                    await refreshCollectionData();
                                  }}
                                />
                              </div>
                            )}

                            {screenings.length > 0 && (
                              <div className="space-y-3 p-4">
                                <h3 className="flex items-center gap-2 text-sm font-semibold">
                                  <ClipboardCheck className="h-4 w-4" />
                                  Screening History ({screenings.length})
                                </h3>

                                <div className="space-y-3">
                                  {screenings.map((screening) => (
                                    <div
                                      key={screening.id}
                                      className="rounded-md border border-border p-3"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-semibold">
                                            Sample: {screening.sampleId}
                                          </p>

                                          <p className="text-xs text-muted-foreground">
                                            {screening.testKitName}
                                            {screening.testKitBatchNumber
                                              ? ` · Report reference: ${screening.testKitBatchNumber}`
                                              : ""}
                                          </p>
                                        </div>

                                        <span
                                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                            screening.result === "NEGATIVE"
                                              ? "bg-safe/10 text-safe"
                                              : screening.result === "POSITIVE"
                                                ? "bg-destructive/10 text-destructive"
                                                : "bg-hold/10 text-hold"
                                          }`}
                                        >
                                          {screening.result}
                                        </span>
                                      </div>

                                      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                        <p>
                                          Tested:{" "}
                                          {formatDate(screening.testedAt)}
                                        </p>

                                        <p>
                                          Operator:{" "}
                                          {screening.testedBy?.name ??
                                            "Collection Centre Operator"}
                                        </p>

                                        <p>
                                          Test panel:{" "}
                                          {screening.panelComplete
                                            ? "Complete"
                                            : "Incomplete"}
                                        </p>

                                        {screening.remarks && (
                                          <p>
                                            Remarks: {screening.remarks}
                                          </p>
                                        )}
                                      </div>

                                      {screening.measurements?.length > 0 && (
                                        <div className="mt-4 overflow-x-auto">
                                          <p className="mb-2 text-sm font-semibold">
                                            Measured Residues and MRL Comparison
                                          </p>

                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Medicine</TableHead>
                                                <TableHead>Measured Value</TableHead>
                                                <TableHead>Applicable MRL</TableHead>
                                                <TableHead>Result</TableHead>
                                              </TableRow>
                                            </TableHeader>

                                            <TableBody>
                                              {screening.measurements.map(
                                                (measurement) => (
                                                  <TableRow key={measurement.id}>
                                                    <TableCell className="font-medium">
                                                      {measurement.medicineNameAtTest}
                                                    </TableCell>

                                                    <TableCell>
                                                      {measurement.measuredValue}{" "}
                                                      {measurement.measuredUnit}
                                                    </TableCell>

                                                    <TableCell>
                                                      {measurement.mrlValueAtTest}{" "}
                                                      {measurement.mrlUnitAtTest}
                                                    </TableCell>

                                                    <TableCell>
                                                      <StatusBadge
                                                        status={
                                                          measurement.result as Status
                                                        }
                                                      />
                                                    </TableCell>
                                                  </TableRow>
                                                ),
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      )}

                                      {screening.reportUrl && (
                                        <a
                                          href={screening.reportUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="mt-2 inline-block text-xs font-medium text-primary underline"
                                        >
                                          View laboratory report
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {hasPositiveScreening && (
                                  <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                                    This batch has a recorded positive
                                    result. It remains on HOLD. Routine
                                    retesting cannot release this batch;
                                    confirmatory investigation and
                                    authorized clearance are required.
                                  </p>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* BLOCKED ANIMALS */}
        <TabsContent value="blocked" className="mt-5">
          <div className="grid gap-4 md:grid-cols-2">
            {intake
              .filter((record) => record.wd.status === "HOLD")
              .map(({ cow, wd }) => (
                <div key={cow.id} className="panel p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-semibold text-heading">
                        {cow.cattleId} · {cow.name ?? "Unnamed"}
                      </p>

                      <p className="text-sm text-muted-foreground">
                        {cow.farmer.user.name} · {cow.farmer.village}
                      </p>
                    </div>

                    <StatusBadge status="HOLD" />
                  </div>

                  <p className="mt-3 text-sm">{wd.reason}</p>

                  {wd.clearsOn && (
                    <p className="mt-2 text-sm font-semibold text-hold">
                      Accept milk again from {formatDate(wd.clearsOn)}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

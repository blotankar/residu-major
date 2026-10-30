
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Milk,
  Ban,
  Truck,
  Users,
  Search,
  Plus,
  CheckCircle,
} from "lucide-react";

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

import {
  createMilkBatch,
  fetchCattle,
  fetchMilkBatches,
  fetchCollectionCentreProfile,
  searchCentreFarmers,
  assignCattleToCentre,
  type ApiCattle,
  type ApiMilkBatch,
  type CollectionCentreFarmer,
  type CollectionCentreProfile,
} from "@/lib/api";

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

function CentreDashboard() {
  const [cattle, setCattle] = useState<ApiCattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [batches, setBatches] = useState<ApiMilkBatch[]>([]);
  const [volumeL, setVolumeL] = useState("50");
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [centreProfile, setCentreProfile] =
    useState<CollectionCentreProfile | null>(null);

  const [farmerSearch, setFarmerSearch] = useState("");
  const [farmerResults, setFarmerResults] = useState<CollectionCentreFarmer[]>([]);
  const [searchingFarmers, setSearchingFarmers] = useState(false);
  const [farmerSearchError, setFarmerSearchError] = useState<string | null>(null);
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
  async function handleFarmerSearch(event: React.FormEvent<HTMLFormElement>) {
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
        err instanceof Error ? err.message : "Unable to search farmers.",
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
        err instanceof Error ? err.message : "Unable to assign selected cows.";

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

  function toggle(id: string, on: boolean) {
    setSelected((previous) =>
      on
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

      // Refresh both cattle and batches so used cattle disappear immediately.
      await refreshCollectionData();

      setSelected([]);

      toast.success(`Milk batch ${result.milkBatch.batchId} created`, {
        description: `${quantity} L recorded with its contributing eligible animals.`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to create milk batch.";

      setBatchError(message);

      // Refresh in case another request already used any selected cattle.
      try {
        await refreshCollectionData();
      } catch (refreshError) {
        console.error("Failed to refresh collection data:", refreshError);
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
      {/* Statistics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Farmers Registered" value={farmersCount} icon={Users} />

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
            batches.filter((batch) => batch.processingBatches.length > 0).length
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
            Search using Farmer ID or farmer name. Select the cows you want to
            add to your collection centre.
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

        {/* Farmer search results */}
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

        {/* Selected farmer's individual cows */}
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
                                toggleCowSelection(cow.id, Boolean(value))
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
                    disabled={selectedCows.length === 0 || assigningCows}
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

      {/* EXISTING DASHBOARD TABS */}
      <Tabs defaultValue="intake" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="intake">Milk Intake Screening</TabsTrigger>
          <TabsTrigger value="batches">Milk Batches</TabsTrigger>
          <TabsTrigger value="blocked">Blocked Animals</TabsTrigger>
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
                  Animals already included in today's batch are removed from
                  this list. Animals under an active withdrawal period cannot
                  be added to a pooled batch.
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
                Search for a farmer above and add their cattle to begin intake
                screening.
              </p>
            )}

            {!loading && !error && cattle.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                {availableIntake.length === 0 ? (
                  <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
                    No cattle available for today's intake. All assigned cattle
                    may already have contributed to a batch today.
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

        {/* MILK BATCHES */}
        <TabsContent value="batches" className="mt-5">
          <div className="panel overflow-x-auto p-5">
            {batches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {loading
                  ? "Loading milk batches..."
                  : "No milk batches recorded yet."}
              </p>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milk Batch ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Contributing animals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dispatched to</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">
                      {batch.batchId}
                    </TableCell>

                    <TableCell>{formatDate(batch.date)}</TableCell>
                    <TableCell>{Number(batch.volumeL)} L</TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {batch.contributingAnimals
                        .map(({ cattle: cow }) => cow.cattleId)
                        .join(", ")}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={batch.status} />
                    </TableCell>

                    <TableCell>
                      {batch.processingBatches[0]?.processingBatch.batchId ??
                        "At collection centre"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

                  {wd.clearsOn ? (
                    <p className="mt-2 text-sm font-semibold text-hold">
                      Accept milk again from {formatDate(wd.clearsOn)}
                    </p>
                  ) : null}
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

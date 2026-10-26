import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Milk, Ban, Truck, Users } from "lucide-react";

import { PortalShell } from "@/components/residuguard/PortalShell";
import { RoleGate } from "@/components/residuguard/RoleGate";
import { StatCard } from "@/components/residuguard/StatCard";
import { StatusBadge } from "@/components/residuguard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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
  type ApiCattle,
  type ApiMilkBatch,
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

function CentreDashboard() {
  const [cattle, setCattle] = useState<ApiCattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [batches, setBatches] = useState<ApiMilkBatch[]>([]);
  const [volumeL, setVolumeL] = useState("50");
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Load cattle from PostgreSQL through the backend API
  useEffect(() => {
    Promise.all([fetchCattle(), fetchMilkBatches()])
      .then(([cattleRecords, batchRecords]) => {
        setCattle(cattleRecords);
        setBatches(batchRecords);
        setSelected(cattleRecords
          .filter((cow) => {
            const latest = cow.treatments[0];
            return !latest || (
              latest.withdrawalEnds !== null &&
              new Date(latest.withdrawalEnds).getTime() < Date.now()
            );
          })
          .map((cow) => cow.id));
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load cattle:", err);
        setError(err instanceof Error ? err.message : "Unable to load collection data.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const intake = useMemo(
    () => cattle.map((cow) => {
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

  const eligible = intake.filter(
    (record) => record.wd.status === "SAFE",
  );

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
    setSavingBatch(true);
    setBatchError(null);
    try {
      const result = await createMilkBatch({
        cattleIds: selected,
        volumeL: quantity,
      });
      setBatches(await fetchMilkBatches());
      setSelected([]);
      toast.success(`Milk batch ${result.milkBatch.batchId} created`, {
        description: `${quantity} L recorded with its contributing eligible animals.`,
      });
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Unable to create milk batch.");
    } finally {
      setSavingBatch(false);
    }
  }

  const farmersCount = new Set(cattle.map((cow) => cow.farmer.user.name)).size;

  return (
    <PortalShell
      role="collection_centre"
      title="Collection Centre Dashboard"
      subtitle="Kolewadi Collection Centre · CC-SAT-07 · Morning shift, 21 Sep 2026"
    >
      {/* Statistics */}
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
          value={intake.length - eligible.length}
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

        {/* =========================
            MILK INTAKE SCREENING
           ========================= */}
        <TabsContent value="intake" className="mt-5">
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Today's intake screening
                </h2>

                <p className="text-sm text-muted-foreground">
                  Animals under an active withdrawal period cannot
                  be added to a pooled batch.
                </p>
              </div>

              <Button
                onClick={createBatch}
                disabled={selected.length === 0 || savingBatch || loading || Boolean(error)}
              >
                {savingBatch ? "Creating batch..." : `Create milk batch (${selected.length} animals)`}
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
                No cattle records found.
              </p>
            )}

            {!loading && !error && cattle.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        Pool
                      </TableHead>

                      <TableHead>Cow</TableHead>

                      <TableHead>Farmer</TableHead>

                      <TableHead>Village</TableHead>

                      <TableHead>Reason</TableHead>

                      <TableHead>Eligibility</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {intake.map(({ cow, wd }) => (
                      <TableRow key={cow.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.includes(cow.id)}
                            disabled={wd.status === "HOLD"}
                            onCheckedChange={(value) =>
                              toggle(
                                cow.id,
                                Boolean(value),
                              )
                            }
                            aria-label={`Pool milk from ${cow.cattleId}`}
                          />
                        </TableCell>

                        <TableCell className="font-medium">
                          {cow.cattleId} · {cow.name ?? "Unnamed"}
                        </TableCell>

                        <TableCell>
                          {cow.farmer.user.name}
                        </TableCell>

                        <TableCell>
                          {cow.farmer.village}
                        </TableCell>

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
              </div>
            )}

          </div>
        </TabsContent>

        {/* =========================
            MILK BATCHES
           ========================= */}
        <TabsContent value="batches" className="mt-5">
          <div className="panel overflow-x-auto p-5">
            {batches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {loading ? "Loading milk batches..." : "No milk batches recorded yet."}
              </p>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milk Batch ID</TableHead>

                  <TableHead>Date</TableHead>

                  <TableHead>Volume</TableHead>

                  <TableHead>
                    Contributing animals
                  </TableHead>

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

                    <TableCell>
                      {formatDate(batch.date)}
                    </TableCell>

                    <TableCell>
                      {Number(batch.volumeL)} L
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {batch.contributingAnimals.map(({ cattle: cow }) => cow.cattleId).join(", ")}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={batch.status} />
                    </TableCell>

                    <TableCell>
                      {batch.processingBatches[0]?.processingBatch.batchId ?? "At collection centre"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* =========================
            BLOCKED ANIMALS
           ========================= */}
        <TabsContent value="blocked" className="mt-5">
          <div className="grid gap-4 md:grid-cols-2">
            {intake
              .filter(
                (record) => record.wd.status === "HOLD",
              )
              .map(({ cow, wd }) => (
                <div
                  key={cow.id}
                  className="panel p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-semibold text-heading">
                        {cow.cattleId} ·{" "}
                        {cow.name ?? "Unnamed"}
                      </p>

                      <p className="text-sm text-muted-foreground">
                        {cow.farmer.user.name} ·{" "}
                        {cow.farmer.village}
                      </p>
                    </div>

                    <StatusBadge status="HOLD" />
                  </div>

                  <p className="mt-3 text-sm">
                    {wd.reason}
                  </p>

                  {wd.clearsOn ? (
                    <p className="mt-2 text-sm font-semibold text-hold">
                      Accept milk again from{" "}
                      {formatDate(wd.clearsOn)}
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
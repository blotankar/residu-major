import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Boxes,
  ClipboardCheck,
  Factory as FactoryIcon,
  FileSearch,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { PortalShell } from "@/components/residuguard/PortalShell";
import { RoleGate } from "@/components/residuguard/RoleGate";
import { StatCard } from "@/components/residuguard/StatCard";
import { StatusBadge } from "@/components/residuguard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  completeFactoryProduction,
  createFactoryDispatch,
  createFactoryProduction,
  fetchFactoryDashboard,
  fetchFactoryDispatches,
  fetchFactoryIntake,
  fetchFactoryInventory,
  fetchFactoryProduction,
  fetchFactoryReports,
  fetchFactoryTrace,
  inspectFactoryBatch,
  receiveFactoryBatch,
  type FactoryDashboardData,
  type FactoryDispatch,
  type FactoryIntakeBatch,
  type FactoryProductLot,
  type FactoryProductionCompletion,
  type FactoryProductionRun,
  type FactoryReportData,
} from "@/lib/api";
import { formatDate } from "@/lib/residuguard-data";

export const Route = createFileRoute("/factory")({
  head: () => ({
    meta: [
      { title: "Factory Dashboard — ResiduGuard" },
      {
        name: "description",
        content:
          "Manage milk intake, inspections, production, inventory, dispatch, and traceability.",
      },
    ],
  }),
  component: () => (
    <RoleGate role="factory">
      <FactoryDashboard />
    </RoleGate>
  ),
});

type FactoryData = {
  dashboard: FactoryDashboardData;
  intake: FactoryIntakeBatch[];
  production: FactoryProductionRun[];
  inventory: FactoryProductLot[];
  dispatches: FactoryDispatch[];
  reports: FactoryReportData;
};

const emptyData: FactoryData = {
  dashboard: {
    metrics: {
      batchesReceivedToday: 0,
      pendingInspections: 0,
      acceptedBatches: 0,
      heldBatches: 0,
      rejectedBatches: 0,
      receivedQuantityL: 0,
      acceptedQuantityL: 0,
      activeProductionRuns: 0,
      finishedInventoryL: 0,
      dispatchesToday: 0,
    },
    alerts: [],
    recentActivity: [],
  },
  intake: [],
  production: [],
  inventory: [],
  dispatches: [],
  reports: { receipts: [], productionRuns: [], productLots: [], dispatches: [], inspections: [] },
};

function todayInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function localDateTimeInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function latestInspection(batch: FactoryIntakeBatch) {
  return batch.qualityInspections[0];
}

function FactoryDashboard() {
  const [data, setData] = useState<FactoryData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [intakeStatus, setIntakeStatus] = useState("");
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [receiptTimes, setReceiptTimes] = useState<Record<string, string>>({});
  const [inspectionBatchId, setInspectionBatchId] = useState("");
  const [inspection, setInspection] = useState({
    temperatureC: "",
    fatPercent: "",
    snfPercent: "",
    acidityPercent: "",
    adulterationResult: "INCONCLUSIVE" as "PASS" | "FAIL" | "INCONCLUSIVE",
    status: "ON_HOLD" as "ACCEPTED" | "ON_HOLD" | "REJECTED",
    remarks: "",
  });
  const [productionBatchIds, setProductionBatchIds] = useState<string[]>([]);
  const [product, setProduct] = useState("");
  const [productionDate, setProductionDate] = useState(todayInput);
  const [completionId, setCompletionId] = useState("");
  const [outputVolume, setOutputVolume] = useState("");
  const [wastage, setWastage] = useState("");
  const [dispatchItems, setDispatchItems] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState("");
  const [transportDetails, setTransportDetails] = useState("");
  const [traceQuery, setTraceQuery] = useState("");
  const [traceResult, setTraceResult] = useState<unknown>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  const loadData = useCallback(async () => {
    const [dashboard, intake, production, inventory, dispatches, reports] = await Promise.all([
      fetchFactoryDashboard(),
      fetchFactoryIntake(),
      fetchFactoryProduction(),
      fetchFactoryInventory(),
      fetchFactoryDispatches(),
      fetchFactoryReports(),
    ]);
    setData({ dashboard, intake, production, inventory, dispatches, reports });
  }, []);

  const reload = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshing(true);
      setError(null);
      try {
        await loadData();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load factory data.";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadData],
  );

  useEffect(() => {
    void reload().catch(() => {});
  }, [reload]);

  const filteredIntake = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return data.intake.filter((batch) => {
      const inspectionStatus = latestInspection(batch)?.status;
      const matchesSearch =
        !normalizedSearch ||
        batch.batchId.toLowerCase().includes(normalizedSearch) ||
        batch.collectionCentre.name.toLowerCase().includes(normalizedSearch) ||
        batch.collectionCentre.code.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        !intakeStatus ||
        (intakeStatus === "PENDING_RECEIPT" && !batch.factoryReceipt) ||
        (intakeStatus === "RECEIVED" && Boolean(batch.factoryReceipt)) ||
        (intakeStatus === "PENDING_INSPECTION" &&
          Boolean(batch.factoryReceipt) &&
          batch.qualityInspections.length === 0) ||
        inspectionStatus === intakeStatus;
      return matchesSearch && matchesStatus;
    });
  }, [data.intake, search, intakeStatus]);

  const eligibleProductionBatches = data.intake.filter((batch) => {
    const inspectionResult = latestInspection(batch);
    return (
      batch.factoryReceipt &&
      inspectionResult?.status === "ACCEPTED" &&
      inspectionResult.adulterationResult === "PASS" &&
      batch.processingBatches.length === 0
    );
  });

  async function receiveBatch(batch: FactoryIntakeBatch) {
    const quantity = Number(receiptQuantities[batch.id] ?? batch.volumeL);
    try {
      const receivedAt = receiptTimes[batch.id];
      await receiveFactoryBatch(batch.id, {
        receivedQuantityL: quantity,
        ...(receivedAt ? { receivedAt: new Date(receivedAt).toISOString() } : {}),
      });
      await reload();
      toast.success(`${batch.batchId} receipt recorded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to record receipt.");
    }
  }

  async function submitInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inspectionBatchId) return;
    try {
      await inspectFactoryBatch(inspectionBatchId, {
        temperatureC: Number(inspection.temperatureC),
        fatPercent: Number(inspection.fatPercent),
        snfPercent: Number(inspection.snfPercent),
        acidityPercent: Number(inspection.acidityPercent),
        adulterationResult: inspection.adulterationResult,
        status: inspection.status,
        ...(inspection.remarks.trim() ? { remarks: inspection.remarks.trim() } : {}),
      });
      await reload();
      setInspection({
        temperatureC: "",
        fatPercent: "",
        snfPercent: "",
        acidityPercent: "",
        adulterationResult: "INCONCLUSIVE",
        status: "ON_HOLD",
        remarks: "",
      });
      toast.success("Inspection recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save inspection.");
    }
  }

  async function submitProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product.trim() || !productionBatchIds.length) return;
    try {
      const result = await createFactoryProduction({
        product: product.trim(),
        date: new Date(`${productionDate}T12:00:00`).toISOString(),
        milkBatchIds: productionBatchIds,
      });
      await reload();
      setProduct("");
      setProductionBatchIds([]);
      toast.success(`Production run ${result.productionRun.batchId} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create production run.");
    }
  }

  async function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completionId) return;
    try {
      const result: FactoryProductionCompletion = await completeFactoryProduction(completionId, {
        outputVolumeL: Number(outputVolume),
        wastageL: Number(wastage),
      });
      await reload();
      setCompletionId("");
      setOutputVolume("");
      setWastage("");
      toast.success(`Finished product lot ${result.productLot.lotId} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to complete production.");
    }
  }

  async function submitDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = Object.entries(dispatchItems)
      .map(([lotId, quantity]) => ({ lotId, quantityL: Number(quantity) }))
      .filter((item) => Number.isFinite(item.quantityL) && item.quantityL > 0);
    if (!destination.trim() || items.length === 0) {
      toast.error("Enter a destination and a positive quantity for at least one lot.");
      return;
    }
    try {
      const result = await createFactoryDispatch({
        destination: destination.trim(),
        items,
        ...(transportDetails.trim() ? { transportDetails: transportDetails.trim() } : {}),
      });
      await reload();
      setDestination("");
      setTransportDetails("");
      setDispatchItems({});
      toast.success(`Dispatch ${result.dispatch.dispatchId} recorded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to dispatch inventory.");
    }
  }

  async function submitTrace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTraceError(null);
    setTraceResult(null);
    try {
      setTraceResult(await fetchFactoryTrace(traceQuery.trim()));
    } catch (err) {
      setTraceError(err instanceof Error ? err.message : "Traceability lookup failed.");
    }
  }

  async function filterReports(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const reports = await fetchFactoryReports({ from: reportFrom, to: reportTo });
      setData((current) => ({ ...current, reports }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to filter reports.");
    }
  }

  const metrics = data.dashboard.metrics;
  const pendingReceipts = filteredIntake.filter((batch) => !batch.factoryReceipt);
  const pendingInspectionBatches = filteredIntake.filter((batch) => {
    const quality = latestInspection(batch);
    return batch.factoryReceipt && (!quality || quality.status === "ON_HOLD");
  });
  const availableLots = data.inventory.filter(
    (lot) => lot.status === "AVAILABLE" && Number(lot.currentQuantityL) > 0,
  );

  return (
    <PortalShell
      role="factory"
      title="Factory Dashboard"
      subtitle="Milk intake, quality inspections, production, inventory, and dispatch"
    >
      <div className="mb-5 flex justify-end">
        <Button
          variant="outline"
          onClick={() => void reload(true).catch(() => {})}
          disabled={refreshing}
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          Refresh data
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void reload(true).catch(() => {})}>
            Try again
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Loading factory records…
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="intake">Milk intake</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="production">Production</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
            <TabsTrigger value="traceability">Traceability</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Milk batches received today"
                value={metrics.batchesReceivedToday}
                icon={Boxes}
                tone="info"
              />
              <StatCard
                label="Pending inspections"
                value={metrics.pendingInspections}
                icon={ClipboardCheck}
                tone="hold"
              />
              <StatCard
                label="Received / accepted milk"
                value={`${metrics.receivedQuantityL.toFixed(1)} / ${metrics.acceptedQuantityL.toFixed(1)} L`}
                icon={FactoryIcon}
              />
              <StatCard
                label="Active production runs"
                value={metrics.activeProductionRuns}
                icon={FactoryIcon}
              />
              <StatCard
                label="Accepted / held / rejected"
                value={`${metrics.acceptedBatches} / ${metrics.heldBatches} / ${metrics.rejectedBatches}`}
                icon={ClipboardCheck}
              />
              <StatCard
                label="Finished inventory"
                value={`${metrics.finishedInventoryL.toFixed(1)} L`}
                icon={PackageCheck}
                tone="safe"
              />
              <StatCard
                label="Dispatches today"
                value={metrics.dispatchesToday}
                icon={Truck}
                tone="info"
              />
              <StatCard
                label="Lots available to dispatch"
                value={availableLots.length}
                icon={Boxes}
              />
            </div>

            <section className="panel p-5">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-semibold">Batch alerts</h2>
              </div>
              {data.dashboard.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No held or rejected batches require attention.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.dashboard.alerts.map((alert) => (
                    <li
                      key={alert.batchId}
                      className="flex flex-wrap items-center gap-2 rounded-md bg-hold-soft p-3 text-sm text-hold"
                    >
                      <StatusBadge status={alert.status} />
                      <span className="font-medium">{alert.batchId}</span>
                      <span>{alert.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="text-lg font-semibold">Recent factory activity</h2>
              {data.dashboard.recentActivity.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No factory activity recorded yet.
                </p>
              ) : (
                <ol className="mt-4 divide-y divide-border">
                  {data.dashboard.recentActivity.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span className="font-medium">
                        {event.eventType.replaceAll("_", " ").toLowerCase()}
                      </span>
                      <time className="text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </TabsContent>

          <TabsContent value="intake" className="mt-5">
            <section className="panel p-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_15rem]">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search batch or collection centre"
                  aria-label="Search milk batches"
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={intakeStatus}
                  onChange={(event) => setIntakeStatus(event.target.value)}
                  aria-label="Filter intake status"
                >
                  <option value="">All intake statuses</option>
                  <option value="PENDING_RECEIPT">Awaiting receipt</option>
                  <option value="RECEIVED">Received</option>
                  <option value="PENDING_INSPECTION">Awaiting inspection</option>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
              {pendingReceipts.length === 0 && filteredIntake.length === 0 ? (
                <EmptyState message="No milk batches match this filter." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Collection centre</TableHead>
                        <TableHead>Collected</TableHead>
                        <TableHead>Sent (L)</TableHead>
                        <TableHead>Received (L)</TableHead>
                        <TableHead>Quality</TableHead>
                        <TableHead>Receipt action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIntake.map((batch) => {
                        const quality = latestInspection(batch);
                        return (
                          <TableRow key={batch.id}>
                            <TableCell className="font-medium">{batch.batchId}</TableCell>
                            <TableCell>
                              {batch.collectionCentre.name}
                              <span className="block text-xs text-muted-foreground">
                                {batch.collectionCentre.code}
                              </span>
                            </TableCell>
                            <TableCell>{formatDate(batch.date)}</TableCell>
                            <TableCell>{Number(batch.volumeL).toFixed(3)}</TableCell>
                            <TableCell>
                              {batch.factoryReceipt ? (
                                Number(batch.factoryReceipt.receivedQuantityL).toFixed(3)
                              ) : (
                                <Input
                                  aria-label={`Received quantity for ${batch.batchId}`}
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  className="min-w-24"
                                  value={receiptQuantities[batch.id] ?? String(batch.volumeL)}
                                  onChange={(event) =>
                                    setReceiptQuantities((current) => ({
                                      ...current,
                                      [batch.id]: event.target.value,
                                    }))
                                  }
                                />
                              )}
                              {batch.factoryReceipt?.discrepancyNote ? (
                                <span className="block max-w-48 text-xs text-hold">
                                  {batch.factoryReceipt.discrepancyNote}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {quality ? (
                                <StatusBadge status={quality.status} />
                              ) : batch.factoryReceipt ? (
                                "Inspection pending"
                              ) : (
                                "Not received"
                              )}
                            </TableCell>
                            <TableCell>
                              {!batch.factoryReceipt ? (
                                <div className="flex min-w-52 flex-col gap-2">
                                  <Input
                                    aria-label={`Receipt time for ${batch.batchId}`}
                                    type="datetime-local"
                                    value={receiptTimes[batch.id] ?? ""}
                                    onChange={(event) =>
                                      setReceiptTimes((current) => ({
                                        ...current,
                                        [batch.id]: event.target.value,
                                      }))
                                    }
                                  />
                                  <Button
                                    size="sm"
                                    disabled={batch.status !== "SAFE"}
                                    onClick={() => void receiveBatch(batch)}
                                  >
                                    Record receipt
                                  </Button>
                                </div>
                              ) : batch.factoryReceipt.receivedAt ? (
                                formatDate(batch.factoryReceipt.receivedAt)
                              ) : (
                                "Received"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="quality" className="mt-5 space-y-5">
            <form onSubmit={submitInspection} className="panel grid gap-4 p-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <h2 className="text-lg font-semibold">Record quality inspection</h2>
                <p className="text-sm text-muted-foreground">
                  Enter measured values and the inspector’s test outcome. This system does not
                  supply or infer regulatory thresholds.
                </p>
              </div>
              <label className="space-y-1 text-sm font-medium">
                Received batch
                <select
                  required
                  value={inspectionBatchId}
                  onChange={(event) => setInspectionBatchId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3"
                >
                  <option value="">Select a received batch</option>
                  {pendingInspectionBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchId}
                    </option>
                  ))}
                </select>
              </label>
              <NumericField
                label="Temperature (°C)"
                value={inspection.temperatureC}
                onChange={(value) =>
                  setInspection((current) => ({ ...current, temperatureC: value }))
                }
              />
              <NumericField
                label="Fat (%)"
                min="0"
                value={inspection.fatPercent}
                onChange={(value) =>
                  setInspection((current) => ({ ...current, fatPercent: value }))
                }
              />
              <NumericField
                label="SNF (%)"
                min="0"
                value={inspection.snfPercent}
                onChange={(value) =>
                  setInspection((current) => ({ ...current, snfPercent: value }))
                }
              />
              <NumericField
                label="Acidity (%)"
                min="0"
                value={inspection.acidityPercent}
                onChange={(value) =>
                  setInspection((current) => ({ ...current, acidityPercent: value }))
                }
              />
              <label className="space-y-1 text-sm font-medium">
                Adulteration test result
                <select
                  value={inspection.adulterationResult}
                  onChange={(event) =>
                    setInspection((current) => ({
                      ...current,
                      adulterationResult: event.target.value as typeof current.adulterationResult,
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3"
                >
                  <option value="PASS">Pass</option>
                  <option value="FAIL">Fail</option>
                  <option value="INCONCLUSIVE">Inconclusive</option>
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Inspection outcome
                <select
                  value={inspection.status}
                  onChange={(event) =>
                    setInspection((current) => ({
                      ...current,
                      status: event.target.value as typeof current.status,
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3"
                >
                  <option value="ACCEPTED">Accepted</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium md:col-span-2">
                Remarks
                <textarea
                  value={inspection.remarks}
                  onChange={(event) =>
                    setInspection((current) => ({ ...current, remarks: event.target.value }))
                  }
                  maxLength={2000}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
                />
              </label>
              <div className="md:col-span-2">
                <Button type="submit" disabled={!inspectionBatchId}>
                  Save inspection
                </Button>
              </div>
            </form>
            <section className="panel p-5">
              <h2 className="text-lg font-semibold">Recorded inspections</h2>
              {data.reports.inspections.length === 0 ? (
                <EmptyState message="No quality inspections have been recorded." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Inspected</TableHead>
                      <TableHead>Inspector</TableHead>
                      <TableHead>Temp °C</TableHead>
                      <TableHead>Fat %</TableHead>
                      <TableHead>SNF %</TableHead>
                      <TableHead>Acidity %</TableHead>
                      <TableHead>Adulteration</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.reports.inspections.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.milkBatch.batchId}</TableCell>
                        <TableCell>{formatDate(item.inspectedAt)}</TableCell>
                        <TableCell>{item.inspector.name}</TableCell>
                        <TableCell>{item.temperatureC}</TableCell>
                        <TableCell>{item.fatPercent}</TableCell>
                        <TableCell>{item.snfPercent}</TableCell>
                        <TableCell>{item.acidityPercent}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.adulterationResult} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </TabsContent>

          <TabsContent value="production" className="mt-5 space-y-5">
            <form onSubmit={submitProduction} className="panel grid gap-4 p-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <h2 className="text-lg font-semibold">Start production run</h2>
                <p className="text-sm text-muted-foreground">
                  Only received batches whose latest inspection is accepted and has a passing
                  adulteration test can be allocated.
                </p>
              </div>
              <label className="space-y-1 text-sm font-medium">
                Product type
                <Input
                  required
                  maxLength={200}
                  value={product}
                  onChange={(event) => setProduct(event.target.value)}
                  placeholder="Product name"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Production date
                <Input
                  required
                  type="date"
                  value={productionDate}
                  onChange={(event) => setProductionDate(event.target.value)}
                />
              </label>
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium">Eligible source batches</p>
                {eligibleProductionBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No eligible batches available.</p>
                ) : (
                  eligibleProductionBatches.map((batch) => (
                    <label
                      key={batch.id}
                      className="flex items-center gap-2 rounded-md border border-border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={productionBatchIds.includes(batch.id)}
                        onChange={(event) =>
                          setProductionBatchIds((current) =>
                            event.target.checked
                              ? [...current, batch.id]
                              : current.filter((id) => id !== batch.id),
                          )
                        }
                      />
                      <span>
                        {batch.batchId} ·{" "}
                        {Number(batch.factoryReceipt?.receivedQuantityL ?? 0).toFixed(3)} L
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={!product.trim() || productionBatchIds.length === 0}>
                  Create production run
                </Button>
              </div>
            </form>

            <section className="panel p-5">
              <h2 className="text-lg font-semibold">Production history</h2>
              {data.production.length === 0 ? (
                <EmptyState message="No production runs recorded." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Run</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Input (L)</TableHead>
                        <TableHead>Output / waste (L)</TableHead>
                        <TableHead>Source batches</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.production.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">{run.batchId}</TableCell>
                          <TableCell>{run.product}</TableCell>
                          <TableCell>{formatDate(run.date)}</TableCell>
                          <TableCell>
                            {Number(run.inputVolumeL ?? run.volumeL).toFixed(3)}
                          </TableCell>
                          <TableCell>
                            {run.outputVolumeL ?? "—"} / {run.wastageL ?? "—"}
                          </TableCell>
                          <TableCell>
                            {run.sourceMilkBatches
                              .map((entry) => entry.milkBatch.batchId)
                              .join(", ")}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>
                          <TableCell>
                            {run.status === "PROCESSING" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setCompletionId(run.id);
                                  setOutputVolume("");
                                  setWastage("");
                                }}
                              >
                                Record output
                              </Button>
                            ) : (
                              run.productLots.map((lot) => lot.lotId).join(", ")
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {completionId ? (
                <form
                  onSubmit={submitCompletion}
                  className="mt-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[1fr_1fr_auto_auto]"
                >
                  <NumericField
                    label="Output (L)"
                    min="0.001"
                    value={outputVolume}
                    onChange={setOutputVolume}
                  />
                  <NumericField label="Wastage (L)" min="0" value={wastage} onChange={setWastage} />
                  <Button type="submit" className="self-end">
                    Complete run
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="self-end"
                    onClick={() => setCompletionId("")}
                  >
                    Cancel
                  </Button>
                </form>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="inventory" className="mt-5">
            <section className="panel p-5">
              <div className="mb-4 flex items-center gap-2">
                <Boxes className="size-5 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">Finished-product lots and stock movements</h2>
              </div>
              {data.inventory.length === 0 ? (
                <EmptyState message="No finished inventory is available yet." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lot</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Production run</TableHead>
                        <TableHead>Produced (L)</TableHead>
                        <TableHead>Available (L)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Movements</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.inventory.map((lot) => (
                        <TableRow key={lot.id}>
                          <TableCell className="font-medium">{lot.lotId}</TableCell>
                          <TableCell>{lot.productName}</TableCell>
                          <TableCell>{lot.processingBatch.batchId}</TableCell>
                          <TableCell>{Number(lot.producedQuantityL).toFixed(3)}</TableCell>
                          <TableCell>{Number(lot.currentQuantityL).toFixed(3)}</TableCell>
                          <TableCell>
                            <StatusBadge status={lot.status} />
                          </TableCell>
                          <TableCell>
                            {lot.movements
                              .map(
                                (movement) => `${movement.movementType}: ${movement.quantityL} L`,
                              )
                              .join("; ") || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="dispatch" className="mt-5 space-y-5">
            <form onSubmit={submitDispatch} className="panel space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Dispatch finished product</h2>
                <p className="text-sm text-muted-foreground">
                  Enter dispatch quantities; the server checks live lot balances and updates
                  dispatch and inventory records atomically.
                </p>
              </div>
              {availableLots.length === 0 ? (
                <EmptyState message="No available finished-product stock to dispatch." />
              ) : (
                availableLots.map((lot) => (
                  <label
                    key={lot.id}
                    className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_12rem]"
                  >
                    <span>
                      {lot.lotId} · {lot.productName} · {Number(lot.currentQuantityL).toFixed(3)} L
                      available
                    </span>
                    <Input
                      aria-label={`Dispatch quantity for ${lot.lotId}`}
                      type="number"
                      min="0"
                      max={lot.currentQuantityL}
                      step="0.001"
                      value={dispatchItems[lot.lotId] ?? ""}
                      onChange={(event) =>
                        setDispatchItems((current) => ({
                          ...current,
                          [lot.lotId]: event.target.value,
                        }))
                      }
                      placeholder="Quantity (L)"
                    />
                  </label>
                ))
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  Destination
                  <Input
                    required
                    maxLength={500}
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Transport details
                  <Input
                    maxLength={2000}
                    value={transportDetails}
                    onChange={(event) => setTransportDetails(event.target.value)}
                  />
                </label>
              </div>
              <Button type="submit" disabled={availableLots.length === 0}>
                Record dispatch
              </Button>
            </form>
            <section className="panel p-5">
              <h2 className="text-lg font-semibold">Dispatch history</h2>
              {data.dispatches.length === 0 ? (
                <EmptyState message="No dispatches recorded." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dispatch</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Lots and quantities</TableHead>
                        <TableHead>Recorded by</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.dispatches.map((dispatch) => (
                        <TableRow key={dispatch.id}>
                          <TableCell>{dispatch.dispatchId}</TableCell>
                          <TableCell>{formatDate(dispatch.dispatchedAt)}</TableCell>
                          <TableCell>{dispatch.destination}</TableCell>
                          <TableCell>
                            {dispatch.items
                              .map((item) => `${item.productLot.lotId}: ${item.quantityL} L`)
                              .join(", ")}
                          </TableCell>
                          <TableCell>{dispatch.createdBy.name}</TableCell>
                          <TableCell>
                            <StatusBadge status={dispatch.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="traceability" className="mt-5">
            <section className="panel p-5">
              <div className="mb-4 flex items-center gap-2">
                <FileSearch className="size-5 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">
                  Trace a milk batch, product lot, or dispatch
                </h2>
              </div>
              <form onSubmit={submitTrace} className="flex flex-col gap-3 sm:flex-row">
                <Input
                  required
                  value={traceQuery}
                  onChange={(event) => setTraceQuery(event.target.value)}
                  placeholder="Enter a batch, lot, or dispatch ID"
                  aria-label="Traceability identifier"
                />
                <Button type="submit">Search traceability</Button>
              </form>
              {traceError ? (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {traceError}
                </p>
              ) : null}
              {traceResult ? (
                <pre className="mt-5 max-h-[36rem] overflow-auto rounded-lg bg-surface p-4 text-xs leading-relaxed">
                  {JSON.stringify(traceResult, null, 2)}
                </pre>
              ) : null}
              {!traceResult && !traceError ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Trace results include source collection, receipt, inspection, production, product
                  lots, and any dispatches available to this factory.
                </p>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="reports" className="mt-5 space-y-5">
            <form
              onSubmit={filterReports}
              className="panel grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="space-y-1 text-sm font-medium">
                From
                <Input
                  type="date"
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                To
                <Input
                  type="date"
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                />
              </label>
              <Button type="submit" className="self-end">
                Apply date filter
              </Button>
            </form>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Intake receipts" value={data.reports.receipts.length} icon={Boxes} />
              <StatCard
                label="Inspections"
                value={data.reports.inspections.length}
                icon={ClipboardCheck}
              />
              <StatCard
                label="Production runs"
                value={data.reports.productionRuns.length}
                icon={FactoryIcon}
              />
              <StatCard label="Dispatches" value={data.reports.dispatches.length} icon={Truck} />
            </div>
            <section className="panel p-5">
              <h2 className="text-lg font-semibold">Report records</h2>
              {data.reports.receipts.length === 0 &&
              data.reports.productionRuns.length === 0 &&
              data.reports.dispatches.length === 0 ? (
                <EmptyState message="No report records match the selected date range." />
              ) : (
                <div className="space-y-4">
                  {data.reports.receipts.length ? (
                    <ReportSection title="Milk intake">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Batch</TableHead>
                            <TableHead>Centre</TableHead>
                            <TableHead>Received</TableHead>
                            <TableHead>Quantity (L)</TableHead>
                            <TableHead>Inspection</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.reports.receipts.map((receipt) => (
                            <TableRow key={receipt.id}>
                              <TableCell>{receipt.milkBatch.batchId}</TableCell>
                              <TableCell>{receipt.milkBatch.collectionCentre.name}</TableCell>
                              <TableCell>{formatDate(receipt.receivedAt)}</TableCell>
                              <TableCell>{Number(receipt.receivedQuantityL).toFixed(3)}</TableCell>
                              <TableCell>
                                {receipt.milkBatch.qualityInspections[0]?.status ?? "Pending"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ReportSection>
                  ) : null}
                  {data.reports.productLots.length ? (
                    <ReportSection title="Finished product and inventory">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lot</TableHead>
                            <TableHead>Produced (L)</TableHead>
                            <TableHead>Remaining (L)</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.reports.productLots.map((lot) => (
                            <TableRow key={lot.id}>
                              <TableCell>{lot.lotId}</TableCell>
                              <TableCell>{lot.producedQuantityL}</TableCell>
                              <TableCell>{lot.currentQuantityL}</TableCell>
                              <TableCell>
                                <StatusBadge status={lot.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ReportSection>
                  ) : null}
                  {data.reports.dispatches.length ? (
                    <ReportSection title="Dispatch history">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Dispatch</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Destination</TableHead>
                            <TableHead>Items</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.reports.dispatches.map((dispatch) => (
                            <TableRow key={dispatch.id}>
                              <TableCell>{dispatch.dispatchId}</TableCell>
                              <TableCell>{formatDate(dispatch.dispatchedAt)}</TableCell>
                              <TableCell>{dispatch.destination}</TableCell>
                              <TableCell>{dispatch.items.length}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ReportSection>
                  ) : null}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      )}
    </PortalShell>
  );
}

function NumericField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <Input
        required
        type="number"
        min={min}
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

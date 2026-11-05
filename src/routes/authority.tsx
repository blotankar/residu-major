
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Link2,
  Building2,
  FileCheck2,
} from "lucide-react";

import { PortalShell } from "@/components/residuguard/PortalShell";
import { RoleGate } from "@/components/residuguard/RoleGate";
import { StatCard } from "@/components/residuguard/StatCard";
import { StatusBadge } from "@/components/residuguard/StatusBadge";

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
  fetchAuthorityDashboard,
  fetchAuthorityCompliance,
  fetchAuthorityAuditLedger,
  fetchAuthoritySupplyChain,
  fetchAuthorityMRL,
  type AuthorityDashboardData,
  type AuthorityComplianceRecord,
  type AuthorityAuditEvent,
  type AuthoritySupplyChainData,
  type ApiMedicineMRL,
} from "@/lib/api";

export const Route = createFileRoute("/authority")({
  head: () => ({
    meta: [
      { title: "Authority Dashboard — ResiduGuard" },
      {
        name: "description",
        content:
          "Regulatory view: compliance across farms and centres, MRL reference data and blockchain audit records.",
      },
      {
        property: "og:title",
        content: "Authority Dashboard — ResiduGuard",
      },
      {
        property: "og:description",
        content:
          "Oversight of withdrawal compliance, held batches and traceability records.",
      },
    ],
  }),

  component: () => (
    <RoleGate role="authority">
      <AuthorityDashboard />
    </RoleGate>
  ),
});

const eventLabels: Record<string, string> = {
  TREATMENT_RECORDED: "Treatment recorded",
  WITHDRAWAL_CLEARED: "Withdrawal cleared",
  MILK_BATCH_CREATED: "Milk batch created",
  BATCH_HELD: "Batch held",
  BATCH_DISPATCHED: "Batch dispatched",
  PROCESSING_LINKED: "Processing batch linked",
  AUDIT_CHECK: "Audit check",
  RESIDUE_SCREENING_RECORDED: "Residue screening recorded",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN");
}

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";

  const number = Number(value);

  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "—";
}

function AuthorityDashboard() {
  const [dashboard, setDashboard] =
    useState<AuthorityDashboardData | null>(null);

  const [compliance, setCompliance] =
    useState<AuthorityComplianceRecord[]>([]);

  const [ledger, setLedger] =
    useState<AuthorityAuditEvent[]>([]);

  const [supplyChain, setSupplyChain] =
    useState<AuthoritySupplyChainData | null>(null);

  const [mrlReferences, setMrlReferences] =
    useState<ApiMedicineMRL[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAuthorityData() {
      try {
        setLoading(true);
        setError(null);

        const [
          dashboardData,
          complianceData,
          ledgerData,
          supplyChainData,
          mrlData,
        ] = await Promise.all([
          fetchAuthorityDashboard(),
          fetchAuthorityCompliance(),
          fetchAuthorityAuditLedger(),
          fetchAuthoritySupplyChain(),
          fetchAuthorityMRL(),
        ]);

        if (!active) return;

        setDashboard(dashboardData);
        setCompliance(complianceData);
        setLedger(ledgerData);
        setSupplyChain(supplyChainData);
        setMrlReferences(mrlData);
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load Authority dashboard data.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAuthorityData();

    return () => {
      active = false;
    };
  }, []);

  const milkBatches = supplyChain?.milkBatches ?? [];
  const processingBatches = supplyChain?.processingBatches ?? [];
  const dispatches = supplyChain?.dispatches ?? [];

  const batchCompliance = dashboard?.batchCompliance;

  return (
    <PortalShell
      role="authority"
      title="Regulatory Authority Dashboard"
      subtitle=" "
    >
      {loading && (
        <div className="panel p-6 text-center text-muted-foreground">
          Loading regulatory data...
        </div>
      )}

      {!loading && error && (
        <div className="panel border border-destructive/30 p-5">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="size-5" />
            Unable to load Authority dashboard
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {error}
          </p>

          <button
            type="button"
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && dashboard && (
        <>
          {/* DASHBOARD STATISTICS */}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Registered Animals"
              value={dashboard.registeredAnimals}
              icon={Building2}
            />

            <StatCard
              label="Treatments On Record"
              value={dashboard.treatmentsOnRecord}
              icon={FileCheck2}
              tone="info"
            />

            <StatCard
              label="Animals Under Withdrawal"
              value={dashboard.animalsUnderWithdrawal}
              icon={AlertTriangle}
              tone="hold"
            />

            <StatCard
              label="Batch Compliance"
              value={`${batchCompliance?.safePercentage ?? 0}%`}
              hint={`${batchCompliance?.safe ?? 0} safe · ${batchCompliance?.onHold ?? 0} on hold`}
              icon={ShieldCheck}
              tone="safe"
            />
          </div>

          <Tabs defaultValue="compliance" className="mt-8">
            <TabsList className="flex-wrap">
              <TabsTrigger value="compliance">
                Compliance Overview
              </TabsTrigger>

              <TabsTrigger value="ledger">
                Audit Ledger
              </TabsTrigger>

              <TabsTrigger value="chain">
                Supply Chain
              </TabsTrigger>

              <TabsTrigger value="mrl">
                MRL Reference
              </TabsTrigger>
            </TabsList>

            {/* ================================== */}
            {/* COMPLIANCE */}
            {/* ================================== */}

            <TabsContent value="compliance" className="mt-5">
              <div className="panel overflow-x-auto p-5">
                <h2 className="text-lg font-semibold">
                  Animal treatment and withdrawal compliance
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Current withdrawal status based on recorded treatment dates.
                </p>

                <Table className="mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cow</TableHead>
                      <TableHead>Farmer</TableHead>
                      <TableHead>Antibiotic</TableHead>
                      <TableHead>Veterinarian</TableHead>
                      <TableHead>Clears on</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {compliance.map((animal) => (
                      <TableRow key={animal.id}>
                        <TableCell className="font-medium">
                          {animal.cattleId}
                          {animal.animalName
                            ? ` · ${animal.animalName}`
                            : ""}
                        </TableCell>

                        <TableCell>
                          {animal.farmer}
                        </TableCell>

                        <TableCell>
                          {animal.antibiotic}
                        </TableCell>

                        <TableCell>
                          {animal.veterinarian}
                        </TableCell>

                        <TableCell>
                          {formatDate(animal.withdrawalClearanceDate)}
                        </TableCell>

                        <TableCell>
                          <StatusBadge
                            status={
                              animal.status === "Under withdrawal"
                                ? "HOLD"
                                : animal.status === "Cleared"
                                  ? "SAFE"
                                  : "PENDING"
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}

                    {compliance.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No animal records found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ================================== */}
            {/* AUDIT LEDGER */}
            {/* ================================== */}

            <TabsContent value="ledger" className="mt-5">
              <div className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Blockchain and traceability event records
                    </h2>

                    <p className="text-sm text-muted-foreground">
                      Events recorded in the ResiduGuard database,
                      with their associated blockchain transaction details.
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm font-semibold">
                    <Link2 className="size-4" aria-hidden />
                    {ledger.length} events
                  </span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Blockchain Status</TableHead>
                        <TableHead>Transaction ID</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {ledger.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-medium">
                            {event.id}
                          </TableCell>

                          <TableCell>
                            {eventLabels[event.eventType] ??
                              event.eventType}
                          </TableCell>

                          <TableCell>
                            <div>{event.entityType}</div>
                            <div className="text-xs text-muted-foreground">
                              {event.entityId}
                            </div>
                          </TableCell>

                          <TableCell>
                            {event.blockchainStatus ?? "Not recorded"}
                          </TableCell>

                          <TableCell className="max-w-[14rem] truncate font-mono text-xs">
                            {event.blockchainTxId ?? "—"}
                          </TableCell>

                          <TableCell>
                            {formatDateTime(event.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}

                      {ledger.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-8 text-center text-muted-foreground"
                          >
                            No traceability events found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* ================================== */}
            {/* SUPPLY CHAIN */}
            {/* ================================== */}

            <TabsContent value="chain" className="mt-5">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* MILK BATCHES */}

                <div className="panel overflow-x-auto p-5">
                  <h2 className="text-lg font-semibold">
                    Milk batches
                  </h2>

                  <Table className="mt-4">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Centre</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>Screening</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {milkBatches.map((batch) => {
                        const screening = batch.residueScreenings[0];

                        return (
                          <TableRow key={batch.id}>
                            <TableCell className="font-medium">
                              {batch.batchId}
                            </TableCell>

                            <TableCell>
                              {batch.collectionCentre?.code ?? "—"}
                            </TableCell>

                            <TableCell>
                              {formatNumber(batch.volumeL)} L
                            </TableCell>

                            <TableCell>
                              {screening?.result ?? "Pending"}
                            </TableCell>

                            <TableCell>
                              <StatusBadge status={batch.status} />
                            </TableCell>
                          </TableRow>
                        );
                      })}

                      {milkBatches.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-8 text-center text-muted-foreground"
                          >
                            No milk batches found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* PROCESSING BATCHES */}

                <div className="panel overflow-x-auto p-5">
                  <h2 className="text-lg font-semibold">
                    Processing batches
                  </h2>

                  <Table className="mt-4">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Source batches</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {processingBatches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell className="font-medium">
                            {batch.batchId}
                          </TableCell>

                          <TableCell>
                            {batch.product}
                          </TableCell>

                          <TableCell className="text-sm text-muted-foreground">
                            {batch.sourceMilkBatches
                              .map((source) => source.milkBatch.batchId)
                              .join(", ") || "—"}
                          </TableCell>

                          <TableCell>
                            <StatusBadge status={batch.status} />
                          </TableCell>
                        </TableRow>
                      ))}

                      {processingBatches.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-8 text-center text-muted-foreground"
                          >
                            No processing batches found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* DISPATCHES */}

              <div className="panel mt-4 overflow-x-auto p-5">
                <h2 className="text-lg font-semibold">
                  Product dispatches
                </h2>

                <Table className="mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dispatch ID</TableHead>
                      <TableHead>Factory</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Dispatched on</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {dispatches.map((dispatch) => (
                      <TableRow key={dispatch.id}>
                        <TableCell className="font-medium">
                          {dispatch.dispatchId}
                        </TableCell>

                        <TableCell>
                          {dispatch.factory?.name ?? "—"}
                        </TableCell>

                        <TableCell>
                          {dispatch.destination}
                        </TableCell>

                        <TableCell>
                          {dispatch.items
                            .map((item) => item.productLot.lotId)
                            .join(", ") || "—"}
                        </TableCell>

                        <TableCell>
                          {formatDate(dispatch.dispatchedAt)}
                        </TableCell>

                        <TableCell>
                          <StatusBadge status={dispatch.status} />
                        </TableCell>
                      </TableRow>
                    ))}

                    {dispatches.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No dispatch records found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ================================== */}
            {/* MRL REFERENCES */}
            {/* ================================== */}

            <TabsContent value="mrl" className="mt-5">
              <div className="panel overflow-x-auto p-5">
                <h2 className="text-lg font-semibold">
                  MRL reference register
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Published regulatory limits held as reference information.
                  ResiduGuard does not generate laboratory measurements.
                </p>

                <Table className="mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Active ingredient</TableHead>
                      <TableHead>Published MRL</TableHead>
                      <TableHead>Regulatory status</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {mrlReferences.map((medicine) => (
                      <TableRow key={medicine.id}>
                        <TableCell className="font-medium">
                          {medicine.medicineName}
                        </TableCell>

                        <TableCell>
                          {medicine.activeIngredient ?? "—"}
                        </TableCell>

                        <TableCell>
                          {medicine.mrlValue !== null
                            ? `${medicine.mrlValue} ${medicine.unit ?? ""}`
                            : "—"}
                        </TableCell>

                        <TableCell>
                          {medicine.regulatoryStatus ?? "—"}
                        </TableCell>

                        <TableCell>
                          {medicine.sourceUrl ? (
                            <a
                              href={medicine.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-info underline underline-offset-2"
                            >
                              {medicine.sourceTitle ?? "View source"}
                            </a>
                          ) : (
                            medicine.sourceTitle ?? "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                    {mrlReferences.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No MRL references found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </PortalShell>
  );
}

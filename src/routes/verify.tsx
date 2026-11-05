import { createFileRoute } from "@tanstack/react-router";
import residuguardLogo from "@/assets/residuguard-logo.png";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Factory,
  FileSearch,
  MapPin,
  Package,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
});

const API_BASE = "http://localhost:3000";

type FarmOrigin = {
  farmName?: string | undefined;
  location?: string | undefined;
  linkedAt?: string | undefined;
};

type TraceEvent = {
  eventType?: string | undefined;
  organization?: string | undefined;
  location?: string | undefined;
  timestamp?: string | undefined;
  vehicleId?: string | undefined;
  quantityLitres?: number | undefined;
  qualityStatus?: string | undefined;
  productLotId?: string | undefined;
};

type SourceMilkBatch = {
  batchId: string;
  collectionCentre?:
    | string
    | {
        name?: string | undefined;
        location?: string | undefined;
      }
    | undefined;
  collectionDate?: string | undefined;
  quantityLitres?: number | undefined;
  farmOrigins: FarmOrigin[];
  events: TraceEvent[];
};

type ProductionInfo = {
  batchId?: string | undefined;
  product?: string | undefined;
  date?: string | undefined;
  volumeL?: number | undefined;
  inputVolumeL?: number | undefined;
  outputVolumeL?: number | undefined;
  wastageL?: number | undefined;
  packs?: number | undefined;
  status?: string | undefined;
  completedAt?: string | undefined;
};

type ProductInfo = {
  productName: string;
  productLotId: string;
  dispatchedQuantityL?: number | undefined;
  producedQuantityL?: number | undefined;
  lotStatus?: string | undefined;
  production?: ProductionInfo | undefined;
};

type DispatchInfo = {
  dispatchId: string;
  destination?: string | undefined;
  dispatchedAt?: string | undefined;
  vehicleId?: string | undefined;
  transportDetails?: string | undefined;
  status?: string | undefined;
};

type TraceResult = {
  lookupId: string;
  lookupType?: "BATCH" | "PRODUCT" | "DISPATCH" | undefined;
  batchId: string;
  product?: string | undefined;
  production?: ProductionInfo | undefined;
  dispatch?: DispatchInfo | undefined;
  products?: ProductInfo[] | undefined;
  sourceMilkBatches: SourceMilkBatch[];
  farmOrigins: FarmOrigin[];
  events: TraceEvent[];
  traceabilitySource: string[];
};

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeFarmOrigins(value: unknown): FarmOrigin[] {
  if (!Array.isArray(value)) return [];

  return value.map((item: any) => ({
    farmName: item?.farmName ?? "Farm",
    location: item?.location ?? "Location unavailable",
    linkedAt: item?.linkedAt,
  }));
}

function normalizeEvents(value: unknown): TraceEvent[] {
  if (!Array.isArray(value)) return [];

  return value.map((item: any) => ({
    eventType: item?.eventType ?? "UNKNOWN_EVENT",
    organization: item?.organization,
    location: item?.location,
    timestamp: item?.timestamp,
    vehicleId: item?.vehicleId,
    quantityLitres: asNumber(item?.quantityLitres),
    qualityStatus: item?.qualityStatus,
    productLotId: item?.productLotId,
  }));
}

function normalizeSourceBatches(value: unknown): SourceMilkBatch[] {
  if (!Array.isArray(value)) return [];

  return value.map((item: any) => {
    const centre = item?.collectionCentre;

    return {
      batchId: item?.batchId ?? "Unknown batch",

      collectionCentre: centre,

      collectionDate:
        item?.collectionDate ??
        item?.collectedAt ??
        centre?.collectedAt,

      quantityLitres: asNumber(item?.quantityLitres),

      farmOrigins: normalizeFarmOrigins(item?.farmOrigins),

      events: normalizeEvents(item?.events),
    };
  });
}

function normalizeProduction(value: any): ProductionInfo | undefined {
  if (!value || typeof value !== "object") return undefined;

  return {
    batchId: value.batchId,
    product: value.product,
    date: value.date,
    volumeL: asNumber(value.volumeL),
    inputVolumeL: asNumber(value.inputVolumeL),
    outputVolumeL: asNumber(value.outputVolumeL),
    wastageL: asNumber(value.wastageL),
    packs: asNumber(value.packs),
    status: value.status,
    completedAt: value.completedAt,
  };
}

function normalizeProduct(value: any): ProductInfo {
  return {
    productName: value?.productName ?? "Milk product",
    productLotId: value?.productLotId ?? "Unknown lot",
    dispatchedQuantityL: asNumber(value?.dispatchedQuantityL),
    producedQuantityL: asNumber(value?.producedQuantityL),
    lotStatus: value?.lotStatus,
    production: normalizeProduction(value?.production),
  };
}

function normalizeTraceResponse(
  data: any,
  lookupId: string,
): TraceResult {
  // Dispatch lookup: DSP-...
  if (
    data?.lookupType === "DISPATCH" &&
    data?.dispatch &&
    Array.isArray(data?.products) &&
    Array.isArray(data?.sourceMilkBatches)
  ) {
    const sourceMilkBatches = normalizeSourceBatches(
      data.sourceMilkBatches,
    );

    const products = data.products.map(normalizeProduct);

    const farmOrigins = sourceMilkBatches.flatMap(
      (batch) => batch.farmOrigins,
    );

    const events = sourceMilkBatches.flatMap(
      (batch) => batch.events,
    );

    return {
      lookupId,
      lookupType: "DISPATCH",
      batchId: lookupId,
      dispatch: {
        dispatchId: data.dispatch.dispatchId ?? lookupId,
        destination: data.dispatch.destination,
        dispatchedAt: data.dispatch.dispatchedAt,
        vehicleId: data.dispatch.vehicleId,
        transportDetails: data.dispatch.transportDetails,
        status: data.dispatch.status,
      },
      products,
      sourceMilkBatches,
      farmOrigins,
      events,
      traceabilitySource: data.traceabilitySource ?? [
        "PostgreSQL",
        "Hyperledger Fabric",
      ],
    };
  }

  // Direct milk batch lookup
  if (
    data?.batchId &&
    Array.isArray(data?.events) &&
    Array.isArray(data?.farmOrigins)
  ) {
    return {
      lookupId,
      lookupType: "BATCH",
      batchId: data.batchId,
      product: data.product,
      sourceMilkBatches: [],
      farmOrigins: normalizeFarmOrigins(data.farmOrigins),
      events: normalizeEvents(data.events),
      traceabilitySource: data.traceabilitySource ?? [
        "Hyperledger Fabric",
      ],
    };
  }

  // Product lot / production batch lookup
  if (
    data?.product &&
    data?.production &&
    Array.isArray(data?.sourceMilkBatches)
  ) {
    const sourceMilkBatches = normalizeSourceBatches(
      data.sourceMilkBatches,
    );

    return {
      lookupId,
      lookupType: "PRODUCT",
      batchId: data.product.productLotId ?? lookupId,
      product: data.product.productName,
      production: normalizeProduction(data.production),
      sourceMilkBatches,
      farmOrigins: sourceMilkBatches.flatMap(
        (batch) => batch.farmOrigins,
      ),
      events: sourceMilkBatches.flatMap(
        (batch) => batch.events,
      ),
      traceabilitySource: data.traceabilitySource ?? [
        "PostgreSQL",
        "Hyperledger Fabric",
      ],
    };
  }

  throw new Error("Invalid traceability response from server.");
}

function formatDate(value?: string) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLitres(value?: number) {
  if (value === undefined) return "Not available";
  return `${value.toLocaleString("en-IN")} L`;
}

function readableEvent(value?: string) {
  if (!value) return "Supply Chain Event";

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({
  status,
}: {
  status?: string | undefined;
}) {
  const normalized = status?.toUpperCase() ?? "";

  const isGood = [
    "COMPLETED",
    "DISPATCHED",
    "AVAILABLE",
    "RECEIVED",
    "PASSED",
    "APPROVED",
  ].includes(normalized);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        isGood
          ? "bg-green-50 text-green-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {status ?? "Status unavailable"}
    </span>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle?: string | undefined;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="rounded-xl bg-green-50 p-2.5 text-green-700">
        <Icon size={20} />
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value?: string | number | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-800">
        {value ?? "Not available"}
      </p>
    </div>
  );
}

function VerifyPage() {
  const [batchId, setBatchId] = useState("");
  const [result, setResult] = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify(e?: FormEvent) {
    e?.preventDefault();

    const lookupId = batchId.trim();

    if (!lookupId) {
      setError("Please enter a product lot ID or dispatch ID.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/traceability/${encodeURIComponent(lookupId)}`,
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "No record found. Please check the ID printed on your milk packet or dispatch record.",
          );
        }

        throw new Error(
          data?.message ??
            data?.error ??
            "Unable to retrieve traceability information.",
        );
      }

      setResult(normalizeTraceResponse(data, lookupId));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const isDispatch = result?.lookupType === "DISPATCH";

  const uniqueFarmOrigins = result
    ? Array.from(
        new Map(
          result.farmOrigins.map((farm, index) => [
            `${farm.farmName}-${farm.location}-${farm.linkedAt ?? index}`,
            farm,
          ]),
        ).values(),
      )
    : [];

  return (
    <div className="min-h-screen bg-[#f8faf8]">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
<div className="flex items-center gap-3">
  <img
    src={residuguardLogo}
    alt="ResiduGuard Logo"
    className="h-11 w-11 object-contain"
  />

  <div className="leading-tight">
    <span className="block text-xl font-extrabold tracking-tight text-gray-900">
      Residu<span className="text-green-700">Guard</span>
    </span>
    <span className="block text-[9px] font-medium uppercase tracking-widest text-gray-500">
      Dairy Traceability Portal
    </span>
  </div>
</div>
          <a
            href="/"
            className="text-sm font-semibold text-gray-600 transition hover:text-green-700"
          >
            Back to Home
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <ShieldCheck size={29} />
          </div>

          <p className="text-sm font-bold uppercase tracking-widest text-green-700">
            Consumer Verification
          </p>

          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            Verify Your Milk
            <span className="text-green-700"> Traceability</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-gray-500 sm:text-base">
            Enter the product lot ID printed on your milk packet or a
            dispatch ID to explore its supply chain journey and verify
            recorded blockchain information.
          </p>
        </div>

        <div className="mx-auto mt-9 max-w-2xl rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
          <form onSubmit={handleVerify}>
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              Product Lot ID / Dispatch ID
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                placeholder="e.g. LOT-... or DSP-..."
                className="h-12 flex-1"
              />

              <Button
                type="submit"
                disabled={loading}
                className="h-12 bg-green-700 px-6 text-white hover:bg-green-800"
              >
                {loading ? (
                  <>
                    <RefreshCw className="mr-2 animate-spin" size={17} />
                    Verifying
                  </>
                ) : (
                  <>
                    <FileSearch className="mr-2" size={17} />
                    Verify
                  </>
                )}
              </Button>
            </div>

            <p className="mt-3 text-xs text-gray-400">
              Search using a LOT- product ID or DSP- dispatch ID.
            </p>
          </form>

          {error && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              <XCircle className="mt-0.5 shrink-0" size={19} />
              <p>{error}</p>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-10 space-y-7">
            <div className="flex flex-col gap-3 rounded-2xl border border-green-100 bg-green-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 shrink-0 text-green-700"
                  size={23}
                />

                <div>
                  <h2 className="font-bold text-green-900">
                    Traceability record retrieved
                  </h2>
                  <p className="mt-1 text-sm text-green-800">
                    The available records were retrieved successfully.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {result.traceabilitySource.map((source) => (
                  <span
                    key={source}
                    className="rounded-full border border-green-200 bg-white px-3 py-1 text-xs font-semibold text-green-800"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </div>

            {/* DISPATCH DETAILS */}
            {result.dispatch && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
                <SectionTitle
                  icon={Truck}
                  title="Dispatch Information"
                  subtitle="Details recorded when the products left the factory"
                />

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem
                    label="Dispatch ID"
                    value={result.dispatch.dispatchId}
                  />
                  <InfoItem
                    label="Destination"
                    value={result.dispatch.destination}
                  />
                  <InfoItem
                    label="Dispatch Date"
                    value={formatDate(result.dispatch.dispatchedAt)}
                  />
                  <InfoItem
                    label="Vehicle ID"
                    value={result.dispatch.vehicleId}
                  />
                  <InfoItem
                    label="Transport Details"
                    value={result.dispatch.transportDetails}
                  />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Dispatch Status
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={result.dispatch.status} />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* DISPATCHED PRODUCTS */}
            {result.products && result.products.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
                <SectionTitle
                  icon={PackageCheck}
                  title="Dispatched Products"
                  subtitle="Product lots included in this dispatch"
                />

                <div className="space-y-4">
                  {result.products.map((product, index) => (
                    <div
                      key={`${product.productLotId}-${index}`}
                      className="rounded-xl border border-gray-100 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-bold text-gray-900">
                            {product.productName}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500">
                            Lot ID: {product.productLotId}
                          </p>
                        </div>

                        <StatusBadge status={product.lotStatus} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <InfoItem
                          label="Dispatched Quantity"
                          value={formatLitres(product.dispatchedQuantityL)}
                        />
                        <InfoItem
                          label="Produced Quantity"
                          value={formatLitres(product.producedQuantityL)}
                        />
                      </div>

                      {product.production && (
                        <div className="mt-4 rounded-lg bg-gray-50 p-4">
                          <p className="mb-3 text-sm font-bold text-gray-800">
                            Production Information
                          </p>

                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            <InfoItem
                              label="Production Batch"
                              value={product.production.batchId}
                            />
                            <InfoItem
                              label="Input Volume"
                              value={formatLitres(
                                product.production.inputVolumeL,
                              )}
                            />
                            <InfoItem
                              label="Output Volume"
                              value={formatLitres(
                                product.production.outputVolumeL,
                              )}
                            />
                            <InfoItem
                              label="Wastage"
                              value={formatLitres(
                                product.production.wastageL,
                              )}
                            />
                            <InfoItem
                              label="Packages"
                              value={product.production.packs}
                            />
                            <InfoItem
                              label="Production Status"
                              value={product.production.status}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* PRODUCT / PRODUCTION OVERVIEW */}
            {!isDispatch && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
                <SectionTitle
                  icon={Package}
                  title="Product Overview"
                  subtitle="Information about the verified product"
                />

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem
                    label="Lookup ID"
                    value={result.lookupId}
                  />

                  <InfoItem
                    label="Product"
                    value={result.product ?? "Milk"}
                  />

                  <InfoItem
                    label="Product / Batch ID"
                    value={result.batchId}
                  />

                  {result.production && (
                    <>
                      <InfoItem
                        label="Production Batch"
                        value={result.production.batchId}
                      />
                      <InfoItem
                        label="Production Date"
                        value={formatDate(result.production.date)}
                      />
                      <InfoItem
                        label="Production Status"
                        value={result.production.status}
                      />
                      <InfoItem
                        label="Input Volume"
                        value={formatLitres(
                          result.production.inputVolumeL,
                        )}
                      />
                      <InfoItem
                        label="Output Volume"
                        value={formatLitres(
                          result.production.outputVolumeL,
                        )}
                      />
                      <InfoItem
                        label="Wastage"
                        value={formatLitres(
                          result.production.wastageL,
                        )}
                      />
                      <InfoItem
                        label="Packages"
                        value={result.production.packs}
                      />
                    </>
                  )}
                </div>
              </section>
            )}

            {/* SOURCE MILK BATCHES */}
            {result.sourceMilkBatches.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
                <SectionTitle
                  icon={Factory}
                  title="Source Milk Batches"
                  subtitle="Collection batches used in the production and supply chain"
                />

                <div className="space-y-4">
                  {result.sourceMilkBatches.map((batch, index) => {
                    const centre =
                      typeof batch.collectionCentre === "string"
                        ? batch.collectionCentre
                        : batch.collectionCentre?.name;

                    return (
                      <div
                        key={`${batch.batchId}-${index}`}
                        className="rounded-xl border border-gray-100 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                              Source Batch
                            </p>
                            <h3 className="mt-1 font-bold text-gray-900">
                              {batch.batchId}
                            </h3>
                          </div>

                          <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                            {formatLitres(batch.quantityLitres)}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <InfoItem
                            label="Collection Centre"
                            value={centre}
                          />
                          <InfoItem
                            label="Collection Date"
                            value={formatDate(batch.collectionDate)}
                          />
                        </div>

                        {batch.farmOrigins.length > 0 && (
                          <div className="mt-4 border-t border-gray-100 pt-4">
                            <p className="mb-3 text-sm font-bold text-gray-800">
                              Linked Farm Origins
                            </p>

                            <div className="space-y-2">
                              {batch.farmOrigins.map((farm, farmIndex) => (
                                <div
                                  key={farmIndex}
                                  className="flex items-start gap-2 rounded-lg bg-gray-50 p-3"
                                >
                                  <MapPin
                                    size={16}
                                    className="mt-0.5 shrink-0 text-green-700"
                                  />

                                  <div>
                                    <p className="text-sm font-semibold text-gray-800">
                                      {farm.farmName}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {farm.location}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* FARM ORIGINS */}
            {uniqueFarmOrigins.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
                <SectionTitle
                  icon={MapPin}
                  title="Farm Origins"
                  subtitle="Farm-level origin information available in the public traceability records"
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {uniqueFarmOrigins.map((farm, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-xl border border-gray-100 p-4"
                    >
                      <div className="rounded-lg bg-green-50 p-2 text-green-700">
                        <MapPin size={18} />
                      </div>

                      <div>
                        <p className="font-semibold text-gray-900">
                          {farm.farmName}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {farm.location}
                        </p>
                        {farm.linkedAt && (
                          <p className="mt-1 text-xs text-gray-400">
                            Linked: {formatDate(farm.linkedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SUPPLY CHAIN TIMELINE */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
              <SectionTitle
                icon={Clock}
                title="Supply Chain Journey"
                subtitle="Recorded events associated with the source milk batches"
              />

              {result.events.length === 0 ? (
                <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">
                  No supply chain events are available for this record yet.
                </p>
              ) : (
                <div className="relative ml-3 space-y-6 border-l-2 border-green-100 pl-7">
                  {[...result.events]
                    .sort((a, b) => {
                      const first = a.timestamp
                        ? new Date(a.timestamp).getTime()
                        : 0;
                      const second = b.timestamp
                        ? new Date(b.timestamp).getTime()
                        : 0;
                      return first - second;
                    })
                    .map((event, index) => (
                      <div
                        key={`${event.eventType}-${index}`}
                        className="relative"
                      >
                        <div className="absolute -left-[35px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-green-600 bg-white" />

                        <div className="rounded-xl border border-gray-100 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <h3 className="font-bold text-gray-900">
                              {readableEvent(event.eventType)}
                            </h3>

                            <span className="text-xs text-gray-400">
                              {formatDate(event.timestamp)}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <InfoItem
                              label="Organization"
                              value={event.organization}
                            />
                            <InfoItem
                              label="Location"
                              value={event.location}
                            />

                            {event.vehicleId && (
                              <InfoItem
                                label="Vehicle ID"
                                value={event.vehicleId}
                              />
                            )}

                            {event.quantityLitres !== undefined && (
                              <InfoItem
                                label="Quantity"
                                value={formatLitres(event.quantityLitres)}
                              />
                            )}

                            {event.qualityStatus && (
                              <InfoItem
                                label="Quality Status"
                                value={event.qualityStatus}
                              />
                            )}

                            {event.productLotId && (
                              <InfoItem
                                label="Product Lot"
                                value={event.productLotId}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* PRIVACY AND BLOCKCHAIN INFORMATION */}
            <section className="rounded-2xl border border-green-100 bg-green-50 p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={23}
                  className="mt-0.5 shrink-0 text-green-700"
                />

                <div>
                  <h2 className="font-bold text-green-900">
                    Blockchain-backed traceability
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-green-800">
                    ResiduGuard uses Hyperledger Fabric to maintain
                    tamper-evident supply chain records. The information
                    displayed here is limited to consumer-accessible
                    traceability details. Private farmer identities,
                    cattle records, and veterinary treatment information
                    are not displayed.
                  </p>

                  <p className="mt-3 text-xs leading-5 text-green-700">
                    Blockchain records help verify that submitted events
                    have not been silently altered. They do not independently
                    verify the physical accuracy of measurements or
                    information entered by participants.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {!result && !loading && (
          <div className="mx-auto mt-10 max-w-2xl text-center">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <ShieldCheck size={14} />
                Consumer access
              </span>
              <ArrowRight size={13} />
              <span className="flex items-center gap-1">
                <Package size={14} />
                Product traceability
              </span>
              <ArrowRight size={13} />
              <span className="flex items-center gap-1">
                <Factory size={14} />
                Supply chain records
              </span>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-gray-100 bg-white py-6">
        <div className="mx-auto max-w-6xl px-5 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} ResiduGuard. Milk Traceability
          and Verification Portal.
        </div>
      </footer>
    </div>
  );
}

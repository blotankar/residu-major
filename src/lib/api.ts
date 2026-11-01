
const API_URL = (import.meta.env["VITE_API_URL"] || "http://localhost:3000").replace(/\/$/, "");
const SESSION_KEY = "residuguard.session";

export type ApiCattle = {
  id: string;
  cattleId: string;
  name: string | null;
  breed: string | null;
  sex: string | null;
  dateOfBirth?: string | null;
  farmer: {
    village: string;
    user: {
      name: string;
    };
  };
  treatments: {
    id: string;
    medicineName: string;
    dosage: string | null;
    administeredAt: string;
    withdrawalEnds: string | null;
    reason: string | null;
  }[];
};

export type ApiMedicineMRL = {
  id: string;
  medicineName: string;
  activeIngredient: string | null;
  mrlValue: number | string | null;
  unit: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  regulatoryStatus: string | null;
  unitVerification: string | null;
  isDashboardEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VetCattle = {
  id: string;
  cattleId: string;
  name: string | null;
  breed: string | null;
  sex: string | null;
  dateOfBirth?: string | null;
  farmer: {
    village: string | null;
    user: {
      name: string;
    };
  };
  treatments: {
    id: string;
    medicineName: string;
    dosage: string | null;
    administeredAt: string;
    withdrawalEnds: string | null;
    reason: string | null;
  }[];
};

export type ApiTreatment = {
  id: string;
  cattleId: string;
  medicineName: string;
  dosage: string | null;
  administeredAt: string;
  withdrawalEnds: string | null;
  reason: string | null;
  cattle?: {
    cattleId: string;
  } | null;
  medicineMrl?: {
    id: string;
    medicineName: string;
    mrlValue: number | string | null;
    unit: string | null;
  } | null;
};

export type CollectionCentreProfile = {
  id: string;
  name: string;
  code: string;
  village: string | null;
  phone: string | null;
};

export type CollectionCentreFarmer = {
  id: string;
  name: string;
  village: string;
  phone: string | null;
  cattle: {
    id: string;
    cattleId: string;
    name: string | null;
    assignedToThisCentre: boolean;
    assignedToAnotherCentre: boolean;
  }[];
};

export type CreateTreatmentInput = {
  cattleId: string;
  medicineName: string;
  dosage: string;
  administeredAt: string;
  withdrawalEnds: string | null;
  reason: string;
};

function getAuthToken(): string {
  if (typeof window === "undefined") {
    throw new Error("Authentication is only available in the browser.");
  }

  const saved = localStorage.getItem(SESSION_KEY);

  if (!saved) {
    throw new Error("Please log in to access cattle records.");
  }

  try {
    const session = JSON.parse(saved) as {
      token?: unknown;
    };

    if (typeof session.token !== "string" || !session.token) {
      throw new Error("Your session has no authentication token. Please log in again.");
    }

    return session.token;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Your saved session is invalid. Please log in again.");
    }

    throw error;
  }
}

export function fetchCollectionCentreProfile() {
  return apiRequest<CollectionCentreProfile>(
    "/api/collection-centre/profile",
  );
}

export function searchCentreFarmers(search: string) {
  return apiRequest<CollectionCentreFarmer[]>(
    `/api/collection-centre/farmers/search?search=${encodeURIComponent(search)}`,
  );
}

export function assignCattleToCentre(cattleIds: string[]) {
  return apiRequest<{ message: string; assignedCount: number }>(
    "/api/collection-centre/cattle/assign",
    {
      method: "POST",
      body: JSON.stringify({ cattleIds }),
    },
  );
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    throw new Error("Your session is invalid or expired. Please log in again.");
  }

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "The API request failed.");
  }

  return result as T;
}

export async function fetchCattle(): Promise<ApiCattle[]> {
  return apiRequest<ApiCattle[]>("/api/cattle");
}

export type CreateCattleInput = {
  cattleId: string;
  name?: string | null;
  breed?: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
};

export async function createCattle(
  input: CreateCattleInput,
): Promise<ApiCattle> {
  const result = await apiRequest<{ cattle: ApiCattle }>("/api/cattle", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return result.cattle;
}

export type ApiMilkBatch = {
  id: string;
  batchId: string;
  date: string;
  volumeL: number;
  status: string;
  collectionCentre: { name: string; code: string };
  contributingAnimals: {
    cattle: {
      id: string;
      cattleId: string;
      name: string | null;
      farmer: { user: { name: string } };
    };
  }[];
  processingBatches: {
    processingBatch: { batchId: string; factory: { name: string } };
  }[];
};

export function fetchMilkBatches() {
  return apiRequest<ApiMilkBatch[]>("/api/milk-batches");
}

export function createMilkBatch(input: {
  cattleIds: string[];
  volumeL: number;
}) {
  return apiRequest<{ milkBatch: ApiMilkBatch }>("/api/milk-batches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchMedicineMRL() {
  return apiRequest<ApiMedicineMRL[]>("/api/mrl");
}

export function fetchMrlReferences() {
  return apiRequest<ApiMedicineMRL[]>("/api/mrl");
}

export function fetchVetCattle() {
  return apiRequest<VetCattle[]>("/api/vet/cattle");
}

export function fetchVetTreatments() {
  return apiRequest<ApiTreatment[]>("/api/vet/treatments");
}

export function createTreatment(input: CreateTreatmentInput) {
  return apiRequest<{ treatment: ApiTreatment }>("/api/vet/treatments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type FactoryIntakeBatch = {
  id: string;
  batchId: string;
  date: string;
  volumeL: number;
  status: string;
  collectionCentre: {
    id: string;
    name: string;
    code: string;
    village: string | null;
  };
  factoryReceipt: {
    id: string;
    receivedQuantityL: string;
    receivedAt: string;
    discrepancyNote: string | null;
  } | null;
  qualityInspections: {
    id: string;
    temperatureC: string;
    fatPercent: string;
    snfPercent: string;
    acidityPercent: string;
    qualityResult: "PASS" | "FAIL" | "INCONCLUSIVE";
    status: "ACCEPTED" | "ON_HOLD" | "REJECTED";
    remarks: string | null;
    inspectedAt: string;
    inspector: { name: string };
  }[];
  processingBatches: { id: string }[];
};

export type FactoryInspectionInput = {
  temperatureC: number;
  fatPercent: number;
  snfPercent: number;
  acidityPercent: number;
  remarks?: string;
  inspectedAt?: string;
};

export type FactoryInspection = {
  id: string;
  milkBatchId: string;
  inspectorUserId: string;
  temperatureC: string;
  fatPercent: string;
  snfPercent: string;
  acidityPercent: string;
  qualityResult: "PASS" | "FAIL" | "INCONCLUSIVE";
  status: "ACCEPTED" | "ON_HOLD" | "REJECTED";
  remarks: string | null;
  inspectedAt: string;
  createdAt: string;
};

export type FactoryInspectionResponse = {
  message: string;
  inspection: FactoryInspection;
  decision: {
    qualityResult: "PASS" | "FAIL" | "INCONCLUSIVE";
    status: "ACCEPTED" | "ON_HOLD" | "REJECTED";
    reasons: string[];
  };
};

export type FactoryDashboardData = {
  metrics: {
    batchesReceivedToday: number;
    pendingInspections: number;
    acceptedBatches: number;
    heldBatches: number;
    rejectedBatches: number;
    receivedQuantityL: number;
    acceptedQuantityL: number;
    activeProductionRuns: number;
    finishedInventoryL: number;
    dispatchesToday: number;
  };
  alerts: {
    batchId: string;
    status: "ON_HOLD" | "REJECTED";
    message: string;
  }[];
  recentActivity: {
    id: string;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }[];
};

export type FactoryProductionRun = {
  id: string;
  batchId: string;
  date: string;
  volumeL: number;
  inputVolumeL: string | null;
  outputVolumeL: string | null;
  wastageL: string | null;
  product: string;
  packs: number;
  status: string;
  completedAt: string | null;
  operator: { name: string } | null;
  sourceMilkBatches: {
    milkBatch: {
      id: string;
      batchId: string;
      factoryReceipt: { receivedQuantityL: string } | null;
    };
  }[];
  productLots: {
    id: string;
    lotId: string;
    producedQuantityL: string;
  }[];
};

export type FactoryProductLot = {
  id: string;
  lotId: string;
  productName: string;
  producedQuantityL: string;
  currentQuantityL: string;
  status: "AVAILABLE" | "HOLD" | "RECALLED" | "DEPLETED";
  processingBatch: {
    batchId: string;
    product: string;
    date: string;
  };
  movements: {
    id: string;
    movementType: "PRODUCTION_OUTPUT" | "DISPATCH";
    quantityL: string;
    reference: string | null;
    createdAt: string;
  }[];
};

export type BlockchainSyncStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PARTIAL"
  | "FAILED";

export type FactoryDispatch = {
  id: string;
  dispatchId: string;
  destination: string;
  dispatchedAt: string;
  vehicleId: string | null;
  transportDetails: string | null;
  status: "DISPATCHED" | "CANCELLED";
  items: {
    id: string;
    quantityL: string;
    productLot: {
      lotId: string;
      productName: string;
    };
  }[];
  createdBy: { name: string };

  // These fields are supplied by the dispatch API when available.
  blockchainStatus?: BlockchainSyncStatus;
  blockchainMessage?: string;
};

export type FactoryDispatchFabricResult = {
  lotId: string;
  milkBatchId?: string;
  batchId: string;
  eventId: string;
  status: "CONFIRMED" | "FAILED" | "PENDING";
  message?: string;
  transactionId?: string;
};

export type FactoryDispatchResponse = {
  dispatch: FactoryDispatch;
  blockchainStatus: BlockchainSyncStatus;
  blockchainMessage?: string;
  fabricResults?: FactoryDispatchFabricResult[];
};

export type FactoryReportData = {
  receipts: {
    id: string;
    receivedQuantityL: string;
    receivedAt: string;
    milkBatch: {
      batchId: string;
      collectionCentre: { name: string; code: string };
      qualityInspections: { status: string }[];
    };
  }[];
  productionRuns: FactoryProductionRun[];
  productLots: FactoryProductLot[];
  dispatches: FactoryDispatch[];
  inspections: {
    id: string;
    status: string;
    temperatureC: string;
    fatPercent: string;
    snfPercent: string;
    acidityPercent: string;
    qualityResult: "PASS" | "FAIL" | "INCONCLUSIVE";
    inspectedAt: string;
    milkBatch: { batchId: string };
    inspector: { name: string };
  }[];
};

export type FactoryProductionCompletion = {
  productionRun: FactoryProductionRun;
  productLot: {
    id: string;
    lotId: string;
    productName: string;
    producedQuantityL: string;
    currentQuantityL: string;
  };
};

export function fetchFactoryDashboard() {
  return apiRequest<FactoryDashboardData>("/api/factory/dashboard");
}

export function fetchFactoryIntake(
  params: { search?: string; status?: string } = {},
) {
  const query = new URLSearchParams();

  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);

  const suffix = query.size ? `?${query.toString()}` : "";

  return apiRequest<FactoryIntakeBatch[]>(
    `/api/factory/intake${suffix}`,
  );
}

export function receiveFactoryBatch(
  id: string,
  input: {
    receivedQuantityL: number;
    receivedAt?: string;
    discrepancyNote?: string;
  },
) {
  return apiRequest(`/api/factory/intake/${encodeURIComponent(id)}/receive`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function inspectFactoryBatch(
  id: string,
  input: FactoryInspectionInput,
): Promise<FactoryInspectionResponse> {
  return apiRequest<FactoryInspectionResponse>(
    `/api/factory/intake/${encodeURIComponent(id)}/inspect`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function fetchFactoryProduction() {
  return apiRequest<FactoryProductionRun[]>("/api/factory/production");
}

export function createFactoryProduction(input: {
  product: string;
  date: string;
  milkBatchIds: string[];
}) {
  return apiRequest<{ productionRun: FactoryProductionRun }>(
    "/api/factory/production",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function completeFactoryProduction(
  id: string,
  input: { outputVolumeL: number; wastageL: number },
) {
  return apiRequest<FactoryProductionCompletion>(
    `/api/factory/production/${encodeURIComponent(id)}/complete`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function fetchFactoryInventory() {
  return apiRequest<FactoryProductLot[]>("/api/factory/inventory");
}

export function fetchFactoryDispatches() {
  return apiRequest<FactoryDispatch[]>("/api/factory/dispatch");
}

export function createFactoryDispatch(input: {
  destination: string;
  vehicleId: string;
  dispatchedAt?: string;
  transportDetails?: string;
  items: { lotId: string; quantityL: number }[];
}) {
  return apiRequest<FactoryDispatchResponse>(
    "/api/factory/dispatch",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function retryFactoryDispatchBlockchain(dispatchId: string) {
  return apiRequest<FactoryDispatchResponse>(
    `/api/factory/dispatch/${encodeURIComponent(dispatchId)}/retry-blockchain`,
    {
      method: "POST",
    },
  );
}

export function fetchFactoryTrace(id: string) {
  return apiRequest<{
    type: string;
    record: Record<string, unknown>;
  }>(`/api/factory/trace/${encodeURIComponent(id)}`);
}

export function fetchFactoryReports(
  params: { from?: string; to?: string } = {},
) {
  const query = new URLSearchParams();

  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  const suffix = query.size ? `?${query.toString()}` : "";

  return apiRequest<FactoryReportData>(
    `/api/factory/reports${suffix}`,
  );
}

export type FactoryCollectionCentre = {
  id: string;
  name: string;
  code: string;
  village: string | null;
};

export type FactoryCentreMilkBatch = {
  id: string;
  batchId: string;
  date: string;
  volumeL: number;
  status: string;
  collectionCentreId: string;
};

export async function searchFactoryCollectionCentres(search: string) {
  return apiRequest<FactoryCollectionCentre[]>(
    `/api/factory/collection-centres/search?search=${encodeURIComponent(search)}`,
  );
}

export async function fetchFactoryCentreBatches(centreId: string) {
  return apiRequest<FactoryCentreMilkBatch[]>(
    `/api/factory/collection-centres/${encodeURIComponent(centreId)}/batches`,
  );
}

export async function addFactoryIntakeBatches(input: {
  milkBatchIds: string[];
}) {
  return apiRequest<{ message: string; addedCount: number }>(
    "/api/factory/intake/add",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

// ResiduGuard demo dataset (prototype — no laboratory testing, no residue measurement).
// All statuses are derived from RECORDED treatment + withdrawal information only.

export type RoleId =
  "farmer" | "veterinarian" | "collection_centre" | "factory" | "authority" | "consumer";

export type Status = "SAFE" | "HOLD";

export interface Cattle {
  id: string;
  name: string;
  breed: string;
  farmId: string;
  farmerName: string;
  village: string;
  health: "Healthy" | "Under treatment" | "Recovering";
  lactation: number;
}

export interface Treatment {
  id: string;
  cowId: string;
  drug: string;
  drugClass: string;
  dose: string;
  route: "Intramuscular" | "Intramammary" | "Oral" | "Intravenous";
  reason: string;
  vetName: string;
  vetRegNo: string;
  startDate: string; // ISO date
  courseDays: number;
  withdrawalDays: number; // milk withdrawal period per label / regulatory reference
  notes?: string;
}

export interface MilkBatch {
  id: string;
  centre: string;
  centreCode: string;
  date: string;
  volumeL: number;
  contributingCows: string[];
  farmers: string[];
  status: Status;
  dispatchedTo?: string; // processing batch id
}

export interface ProcessingBatch {
  id: string;
  factory: string;
  product: string;
  date: string;
  milkBatchIds: string[];
  volumeL: number;
  packs: number;
  status: Status;
}

export interface LedgerEvent {
  id: string;
  type:
    | "TREATMENT_RECORDED"
    | "WITHDRAWAL_CLEARED"
    | "MILK_BATCH_CREATED"
    | "BATCH_HELD"
    | "BATCH_DISPATCHED"
    | "PROCESSING_LINKED"
    | "AUDIT_CHECK";
  refId: string;
  actor: string;
  timestamp: string;
  hash: string;
  prevHash: string;
}

/** Reference-only regulatory MRL table. No measurement is performed by this system. */
export const mrlReference = [
  {
    drug: "Oxytetracycline",
    drugClass: "Tetracycline",
    mrlMilk: "100 µg/kg",
    typicalWithdrawal: "3–5 days",
  },
  {
    drug: "Amoxicillin",
    drugClass: "Penicillin",
    mrlMilk: "4 µg/kg",
    typicalWithdrawal: "2–4 days",
  },
  {
    drug: "Enrofloxacin",
    drugClass: "Fluoroquinolone",
    mrlMilk: "Not permitted in milk",
    typicalWithdrawal: "4–7 days",
  },
  {
    drug: "Ceftiofur",
    drugClass: "Cephalosporin",
    mrlMilk: "100 µg/kg",
    typicalWithdrawal: "0–3 days",
  },
  {
    drug: "Gentamicin",
    drugClass: "Aminoglycoside",
    mrlMilk: "100 µg/kg",
    typicalWithdrawal: "5–7 days",
  },
];

/** Fixed "today" so the prototype demo always shows both SAFE and HOLD animals. */
export const DEMO_TODAY = new Date("2026-09-21T06:00:00Z");

export const farms = [
  {
    id: "FARM-KOL-014",
    farmer: "Ramesh Patil",
    village: "Kolewadi",
    district: "Satara",
    centreCode: "CC-SAT-07",
  },
  {
    id: "FARM-KOL-022",
    farmer: "Sunita Deshmukh",
    village: "Kolewadi",
    district: "Satara",
    centreCode: "CC-SAT-07",
  },
  {
    id: "FARM-ANG-009",
    farmer: "Iqbal Shaikh",
    village: "Angapur",
    district: "Satara",
    centreCode: "CC-SAT-07",
  },
];

export const cattle: Cattle[] = [
  {
    id: "COW-1042",
    name: "Gauri",
    breed: "Gir",
    farmId: "FARM-KOL-014",
    farmerName: "Ramesh Patil",
    village: "Kolewadi",
    health: "Under treatment",
    lactation: 3,
  },
  {
    id: "COW-1043",
    name: "Lakshmi",
    breed: "Sahiwal",
    farmId: "FARM-KOL-014",
    farmerName: "Ramesh Patil",
    village: "Kolewadi",
    health: "Healthy",
    lactation: 2,
  },
  {
    id: "COW-1044",
    name: "Nandini",
    breed: "HF Cross",
    farmId: "FARM-KOL-014",
    farmerName: "Ramesh Patil",
    village: "Kolewadi",
    health: "Recovering",
    lactation: 4,
  },
  {
    id: "COW-1045",
    name: "Ganga",
    breed: "Jersey Cross",
    farmId: "FARM-KOL-014",
    farmerName: "Ramesh Patil",
    village: "Kolewadi",
    health: "Healthy",
    lactation: 1,
  },
  {
    id: "COW-1046",
    name: "Tulsi",
    breed: "Gir",
    farmId: "FARM-KOL-014",
    farmerName: "Ramesh Patil",
    village: "Kolewadi",
    health: "Healthy",
    lactation: 5,
  },
  {
    id: "COW-2011",
    name: "Kamdhenu",
    breed: "Sahiwal",
    farmId: "FARM-KOL-022",
    farmerName: "Sunita Deshmukh",
    village: "Kolewadi",
    health: "Under treatment",
    lactation: 2,
  },
  {
    id: "COW-2012",
    name: "Radha",
    breed: "HF Cross",
    farmId: "FARM-KOL-022",
    farmerName: "Sunita Deshmukh",
    village: "Kolewadi",
    health: "Healthy",
    lactation: 3,
  },
  {
    id: "COW-3001",
    name: "Sheru",
    breed: "Red Sindhi",
    farmId: "FARM-ANG-009",
    farmerName: "Iqbal Shaikh",
    village: "Angapur",
    health: "Healthy",
    lactation: 2,
  },
  {
    id: "COW-3002",
    name: "Basanti",
    breed: "Gir",
    farmId: "FARM-ANG-009",
    farmerName: "Iqbal Shaikh",
    village: "Angapur",
    health: "Recovering",
    lactation: 4,
  },
];

export const treatments: Treatment[] = [
  {
    id: "TRT-9001",
    cowId: "COW-1042",
    drug: "Oxytetracycline",
    drugClass: "Tetracycline",
    dose: "10 mg/kg once daily",
    route: "Intramuscular",
    reason: "Clinical mastitis (left fore quarter)",
    vetName: "Dr. Anjali Kulkarni",
    vetRegNo: "MVC/2016/4417",
    startDate: "2026-09-19",
    courseDays: 3,
    withdrawalDays: 5,
    notes: "Milk from this animal must be withheld from pooling until clearance.",
  },
  {
    id: "TRT-9002",
    cowId: "COW-2011",
    drug: "Enrofloxacin",
    drugClass: "Fluoroquinolone",
    dose: "5 mg/kg once daily",
    route: "Intramuscular",
    reason: "Respiratory infection",
    vetName: "Dr. Anjali Kulkarni",
    vetRegNo: "MVC/2016/4417",
    startDate: "2026-09-18",
    courseDays: 4,
    withdrawalDays: 7,
  },
  {
    id: "TRT-9003",
    cowId: "COW-1044",
    drug: "Ceftiofur",
    drugClass: "Cephalosporin",
    dose: "1 mg/kg once daily",
    route: "Intramammary",
    reason: "Sub-clinical mastitis",
    vetName: "Dr. Suresh Rane",
    vetRegNo: "MVC/2011/2280",
    startDate: "2026-09-10",
    courseDays: 3,
    withdrawalDays: 3,
  },
  {
    id: "TRT-9004",
    cowId: "COW-3002",
    drug: "Amoxicillin",
    drugClass: "Penicillin",
    dose: "7 mg/kg twice daily",
    route: "Intramuscular",
    reason: "Post-calving metritis",
    vetName: "Dr. Suresh Rane",
    vetRegNo: "MVC/2011/2280",
    startDate: "2026-09-05",
    courseDays: 5,
    withdrawalDays: 4,
  },
  {
    id: "TRT-9005",
    cowId: "COW-1046",
    drug: "Gentamicin",
    drugClass: "Aminoglycoside",
    dose: "4 mg/kg once daily",
    route: "Intravenous",
    reason: "Wound infection",
    vetName: "Dr. Anjali Kulkarni",
    vetRegNo: "MVC/2016/4417",
    startDate: "2026-08-22",
    courseDays: 4,
    withdrawalDays: 7,
  },
];

export const milkBatches: MilkBatch[] = [
  {
    id: "MB-2026-0921-A",
    centre: "Kolewadi Collection Centre",
    centreCode: "CC-SAT-07",
    date: "2026-09-21",
    volumeL: 412,
    contributingCows: ["COW-1043", "COW-1045", "COW-1046", "COW-2012"],
    farmers: ["Ramesh Patil", "Sunita Deshmukh"],
    status: "SAFE",
    dispatchedTo: "PB-2026-0921-M1",
  },
  {
    id: "MB-2026-0921-B",
    centre: "Kolewadi Collection Centre",
    centreCode: "CC-SAT-07",
    date: "2026-09-21",
    volumeL: 96,
    contributingCows: ["COW-1042", "COW-2011"],
    farmers: ["Ramesh Patil", "Sunita Deshmukh"],
    status: "HOLD",
  },
  {
    id: "MB-2026-0921-C",
    centre: "Angapur Collection Centre",
    centreCode: "CC-SAT-11",
    date: "2026-09-21",
    volumeL: 268,
    contributingCows: ["COW-3001", "COW-3002"],
    farmers: ["Iqbal Shaikh"],
    status: "SAFE",
    dispatchedTo: "PB-2026-0921-M1",
  },
  {
    id: "MB-2026-0920-A",
    centre: "Kolewadi Collection Centre",
    centreCode: "CC-SAT-07",
    date: "2026-09-20",
    volumeL: 389,
    contributingCows: ["COW-1043", "COW-1044", "COW-1045"],
    farmers: ["Ramesh Patil"],
    status: "SAFE",
    dispatchedTo: "PB-2026-0920-M4",
  },
];

export const processingBatches: ProcessingBatch[] = [
  {
    id: "PB-2026-0921-M1",
    factory: "Satara Co-operative Dairy Plant",
    product: "Toned Milk 500 ml",
    date: "2026-09-21",
    milkBatchIds: ["MB-2026-0921-A", "MB-2026-0921-C"],
    volumeL: 680,
    packs: 1360,
    status: "SAFE",
  },
  {
    id: "PB-2026-0920-M4",
    factory: "Satara Co-operative Dairy Plant",
    product: "Full Cream Milk 1 L",
    date: "2026-09-20",
    milkBatchIds: ["MB-2026-0920-A"],
    volumeL: 389,
    packs: 389,
    status: "SAFE",
  },
];

/* ---------- Withdrawal logic ---------- */

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export interface WithdrawalInfo {
  cowId: string;
  treatment?: Treatment;
  status: Status;
  clearsOn?: Date;
  daysRemaining: number;
  reason: string;
}

/** Withdrawal clears at: treatment start + course days + withdrawal days. */
export function withdrawalFor(cowId: string, today: Date = DEMO_TODAY): WithdrawalInfo {
  const cowTreatments = treatments
    .filter((t) => t.cowId === cowId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  const latest = cowTreatments[0];
  if (!latest) {
    return { cowId, status: "SAFE", daysRemaining: 0, reason: "No antibiotic treatment recorded." };
  }

  const clearsOn = addDays(new Date(latest.startDate), latest.courseDays + latest.withdrawalDays);
  const ms = clearsOn.getTime() - today.getTime();
  const daysRemaining = Math.max(0, Math.ceil(ms / 86_400_000));

  return {
    cowId,
    treatment: latest,
    status: daysRemaining > 0 ? "HOLD" : "SAFE",
    clearsOn,
    daysRemaining,
    reason:
      daysRemaining > 0
        ? `Within withdrawal period for ${latest.drug} (${latest.withdrawalDays}-day milk withdrawal).`
        : `Withdrawal period for ${latest.drug} completed on ${formatDate(clearsOn)}.`,
  };
}

export function cattleFor(farmerName?: string) {
  if (!farmerName) return cattle;
  return cattle.filter((c) => c.farmerName === farmerName);
}

export function treatmentsFor(cowId: string) {
  return treatments.filter((t) => t.cowId === cowId);
}

export function cowById(id: string) {
  return cattle.find((c) => c.id === id);
}

/* ---------- Tamper-evident hash chain (demo) ---------- */

function demoHash(input: string) {
  // Deterministic, dependency-free 128-bit-ish digest for demonstration purposes.
  let h1 = 0x811c9dc5,
    h2 = 0x01000193,
    h3 = 0x9e3779b9,
    h4 = 0x85ebca6b;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2654435761) >>> 0;
    h3 = (h3 ^ Math.imul(c + i, 374761393)) >>> 0;
    h4 = Math.imul(h4 ^ (c << (i % 13)), 2246822519) >>> 0;
  }
  return "0x" + [h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
}

const rawEvents: Omit<LedgerEvent, "hash" | "prevHash">[] = [
  {
    id: "EVT-0001",
    type: "TREATMENT_RECORDED",
    refId: "TRT-9005",
    actor: "Dr. Anjali Kulkarni",
    timestamp: "2026-08-22T09:14:00Z",
  },
  {
    id: "EVT-0002",
    type: "WITHDRAWAL_CLEARED",
    refId: "COW-1046",
    actor: "System",
    timestamp: "2026-09-02T00:05:00Z",
  },
  {
    id: "EVT-0003",
    type: "TREATMENT_RECORDED",
    refId: "TRT-9004",
    actor: "Dr. Suresh Rane",
    timestamp: "2026-09-05T11:40:00Z",
  },
  {
    id: "EVT-0004",
    type: "TREATMENT_RECORDED",
    refId: "TRT-9003",
    actor: "Dr. Suresh Rane",
    timestamp: "2026-09-10T08:02:00Z",
  },
  {
    id: "EVT-0005",
    type: "MILK_BATCH_CREATED",
    refId: "MB-2026-0920-A",
    actor: "CC-SAT-07",
    timestamp: "2026-09-20T06:20:00Z",
  },
  {
    id: "EVT-0006",
    type: "PROCESSING_LINKED",
    refId: "PB-2026-0920-M4",
    actor: "Satara Plant",
    timestamp: "2026-09-20T13:10:00Z",
  },
  {
    id: "EVT-0007",
    type: "TREATMENT_RECORDED",
    refId: "TRT-9002",
    actor: "Dr. Anjali Kulkarni",
    timestamp: "2026-09-18T16:25:00Z",
  },
  {
    id: "EVT-0008",
    type: "TREATMENT_RECORDED",
    refId: "TRT-9001",
    actor: "Dr. Anjali Kulkarni",
    timestamp: "2026-09-19T07:55:00Z",
  },
  {
    id: "EVT-0009",
    type: "MILK_BATCH_CREATED",
    refId: "MB-2026-0921-A",
    actor: "CC-SAT-07",
    timestamp: "2026-09-21T06:05:00Z",
  },
  {
    id: "EVT-0010",
    type: "BATCH_HELD",
    refId: "MB-2026-0921-B",
    actor: "CC-SAT-07",
    timestamp: "2026-09-21T06:07:00Z",
  },
  {
    id: "EVT-0011",
    type: "MILK_BATCH_CREATED",
    refId: "MB-2026-0921-C",
    actor: "CC-SAT-11",
    timestamp: "2026-09-21T06:18:00Z",
  },
  {
    id: "EVT-0012",
    type: "BATCH_DISPATCHED",
    refId: "MB-2026-0921-A",
    actor: "CC-SAT-07",
    timestamp: "2026-09-21T07:30:00Z",
  },
  {
    id: "EVT-0013",
    type: "PROCESSING_LINKED",
    refId: "PB-2026-0921-M1",
    actor: "Satara Plant",
    timestamp: "2026-09-21T10:45:00Z",
  },
  {
    id: "EVT-0014",
    type: "AUDIT_CHECK",
    refId: "CC-SAT-07",
    actor: "State Dairy Authority",
    timestamp: "2026-09-21T12:00:00Z",
  },
];

export const ledger: LedgerEvent[] = rawEvents.reduce<LedgerEvent[]>((acc, e) => {
  const prevHash = acc[acc.length - 1]?.hash ?? "0x" + "0".repeat(32);
  const hash = demoHash(`${e.id}|${e.type}|${e.refId}|${e.actor}|${e.timestamp}|${prevHash}`);
  acc.push({ ...e, hash, prevHash });
  return acc;
}, []);

export function eventsFor(refIds: string[]) {
  return ledger.filter((e) => refIds.includes(e.refId));
}

/* ---------- Traceability ---------- */

export interface TraceResult {
  processing: ProcessingBatch;
  milkBatches: MilkBatch[];
  farmers: string[];
  centres: string[];
  compliance: { checked: number; underWithdrawal: number };
  events: LedgerEvent[];
}

export function traceByBatchId(input: string): TraceResult | null {
  const q = input.trim().toUpperCase();
  const pb =
    processingBatches.find((p) => p.id.toUpperCase() === q) ??
    processingBatches.find((p) => p.milkBatchIds.some((m) => m.toUpperCase() === q));
  if (!pb) return null;

  const mbs = milkBatches.filter((m) => pb.milkBatchIds.includes(m.id));
  const cows = mbs.flatMap((m) => m.contributingCows);
  const underWithdrawal = cows.filter((c) => withdrawalFor(c).status === "HOLD").length;

  return {
    processing: pb,
    milkBatches: mbs,
    farmers: [...new Set(mbs.flatMap((m) => m.farmers))],
    centres: [...new Set(mbs.map((m) => m.centre))],
    compliance: { checked: cows.length, underWithdrawal },
    events: eventsFor([pb.id, ...mbs.map((m) => m.id)]),
  };
}

export const sampleBatchIds = ["PB-2026-0921-M1", "PB-2026-0920-M4"];

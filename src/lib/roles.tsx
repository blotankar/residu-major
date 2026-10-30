import { Tractor, Stethoscope, Milk, Factory, ShieldCheck, ScanLine } from "lucide-react";
import type { RoleId } from "./residuguard-data";
export type { RoleId } from "./residuguard-data";

export interface RoleDef {
  id: RoleId;
  label: string;
  person: string;
  org: string;
  description: string;
  path: "/farmer" | "/veterinarian" | "/collection-centre" | "/factory" | "/authority" | "/verify";
  icon: typeof Tractor;
}

export const roles: RoleDef[] = [
  {
    id: "farmer",
    label: "Farmer",
    person: "Ramesh Patil",
    org: "FARM-KOL-014, Kolewadi",
    description: "Cattle register, treatment history, withdrawal status and milk records.",
    path: "/farmer",
    icon: Tractor,
  },
  {
    id: "veterinarian",
    label: "Veterinarian",
    person: "Dr. Anjali Kulkarni",
    org: "Reg. MVC/2016/4417",
    description: "Record antibiotic treatments and set withdrawal periods.",
    path: "/veterinarian",
    icon: Stethoscope,
  },
  {
    id: "collection_centre",
    label: "Collection Centre",
    person: "Collection Centre",
    org: "residuguard",
    description: "Create milk batch IDs and block milk from animals under withdrawal.",
    path: "/collection-centre",
    icon: Milk,
  },
  {
    id: "factory",
    label: "Factory",
    person: "Satara Co-operative Dairy Plant",
    org: "Processing unit",
    description: "Link eligible milk batches to processing batches and packaging.",
    path: "/factory",
    icon: Factory,
  },
  {
    id: "authority",
    label: "Authority / Admin",
    person: "State Dairy Authority",
    org: "Regulatory oversight",
    description: "Compliance oversight, MRL reference data and the audit ledger.",
    path: "/authority",
    icon: ShieldCheck,
  },
  {
    id: "consumer",
    label: "Consumer",
    person: "Public access",
    org: "No login required",
    description: "Enter a batch ID from a milk packet to view permitted traceability.",
    path: "/verify",
    icon: ScanLine,
  },
];

export function roleById(id: RoleId | null | undefined) {
  return roles.find((r) => r.id === id);
}

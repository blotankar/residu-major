import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Syringe, CalendarClock, Stethoscope, ClipboardList } from "lucide-react";
import { PortalShell } from "@/components/residuguard/PortalShell";
import { RoleGate } from "@/components/residuguard/RoleGate";
import { StatCard } from "@/components/residuguard/StatCard";
import { StatusBadge } from "@/components/residuguard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  addDays,
  cattle,
  formatDate,
  mrlReference,
  treatments,
  withdrawalFor,
  type Treatment,
} from "@/lib/residuguard-data";

export const Route = createFileRoute("/veterinarian")({
  head: () => ({
    meta: [
      { title: "Veterinarian Dashboard — ResiduGuard" },
      {
        name: "description",
        content:
          "Veterinarian view: record antibiotic treatments, set withdrawal periods and review treated animals.",
      },
      { property: "og:title", content: "Veterinarian Dashboard — ResiduGuard" },
      {
        property: "og:description",
        content: "Record treatments, assign withdrawal periods and review the herd under care.",
      },
    ],
  }),
  component: () => (
    <RoleGate role="veterinarian">
      <VetDashboard />
    </RoleGate>
  ),
});

const VET = "Dr. Anjali Kulkarni";

function VetDashboard() {
  const [local, setLocal] = useState<Treatment[]>([]);
  const [cowId, setCowId] = useState(cattle[0]!.id);
  const [drug, setDrug] = useState(mrlReference[0]!.drug);
  const [dose, setDose] = useState("10 mg/kg once daily");
  const [courseDays, setCourseDays] = useState("3");
  const [withdrawalDays, setWithdrawalDays] = useState("5");
  const [reason, setReason] = useState("");

  const all = [...local, ...treatments];
  const mine = all.filter((t) => t.vetName === VET);
  const underWithdrawal = cattle.filter((c) => withdrawalFor(c.id).status === "HOLD");

  const start = new Date("2026-09-21");
  const clears = addDays(start, Number(courseDays || 0) + Number(withdrawalDays || 0));

  function record(e: React.FormEvent) {
    e.preventDefault();
    const ref = mrlReference.find((m) => m.drug === drug)!;
    const entry: Treatment = {
      id: `TRT-${9100 + local.length}`,
      cowId,
      drug,
      drugClass: ref.drugClass,
      dose,
      route: "Intramuscular",
      reason: reason || "Clinical examination",
      vetName: VET,
      vetRegNo: "MVC/2016/4417",
      startDate: "2026-09-21",
      courseDays: Number(courseDays || 0),
      withdrawalDays: Number(withdrawalDays || 0),
    };
    setLocal((p) => [entry, ...p]);
    setReason("");
    toast.success(`Treatment recorded for ${cowId}`, {
      description: `Milk on HOLD until ${formatDate(clears)}. Event added to the audit ledger.`,
    });
  }

  return (
    <PortalShell
      role="veterinarian"
      title="Veterinarian Dashboard"
      subtitle={`${VET} · Reg. MVC/2016/4417 · Satara district`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Animals Under My Care" value={cattle.length} icon={Stethoscope} />
        <StatCard
          label="Treatments Recorded"
          value={mine.length}
          icon={ClipboardList}
          tone="info"
        />
        <StatCard
          label="Animals Under Withdrawal"
          value={underWithdrawal.length}
          icon={CalendarClock}
          tone="hold"
        />
        <StatCard
          label="Antibiotics In Reference Table"
          value={mrlReference.length}
          icon={Syringe}
        />
      </div>

      <Tabs defaultValue="record" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="record">Record Treatment</TabsTrigger>
          <TabsTrigger value="history">Treatment History</TabsTrigger>
          <TabsTrigger value="withdrawal">Withdrawal Monitor</TabsTrigger>
          <TabsTrigger value="mrl">MRL Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="record" className="mt-5">
          <form onSubmit={record} className="panel grid gap-5 p-6 lg:grid-cols-[2fr_1fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Animal</Label>
                <Select value={cowId} onValueChange={setCowId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cattle.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.id} — {c.name} ({c.farmerName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Antibiotic</Label>
                <Select
                  value={drug}
                  onValueChange={(v) => {
                    setDrug(v);
                    const ref = mrlReference.find((m) => m.drug === v);
                    if (ref)
                      setWithdrawalDays(
                        ref.typicalWithdrawal.split("–")[1]?.replace(/\D/g, "") || "5",
                      );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mrlReference.map((m) => (
                      <SelectItem key={m.drug} value={m.drug}>
                        {m.drug} ({m.drugClass})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dose">Dose</Label>
                <Input id="dose" value={dose} onChange={(e) => setDose(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="course">Course length (days)</Label>
                <Input
                  id="course"
                  type="number"
                  min="1"
                  value={courseDays}
                  onChange={(e) => setCourseDays(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wd">Milk withdrawal period (days)</Label>
                <Input
                  id="wd"
                  type="number"
                  min="0"
                  value={withdrawalDays}
                  onChange={(e) => setWithdrawalDays(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="reason">Clinical reason</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Clinical mastitis, left fore quarter"
                />
              </div>
            </div>

            <aside className="rounded-lg bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Computed compliance
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Treatment start</p>
              <p className="font-semibold text-heading">{formatDate(start)}</p>
              <p className="mt-3 text-sm text-muted-foreground">Milk eligible again from</p>
              <p className="font-semibold text-hold">{formatDate(clears)}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Start + course ({courseDays || 0} d) + withdrawal ({withdrawalDays || 0} d). The
                animal's milk is marked HOLD for collection centres until this date.
              </p>
              <Button type="submit" className="mt-5 w-full">
                Record treatment
              </Button>
            </aside>
          </form>
        </TabsContent>

        <TabsContent value="history" className="mt-5">
          <div className="panel overflow-x-auto p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Record</TableHead>
                  <TableHead>Cow</TableHead>
                  <TableHead>Antibiotic</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Dose</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Withdrawal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.id}</TableCell>
                    <TableCell>{t.cowId}</TableCell>
                    <TableCell>{t.drug}</TableCell>
                    <TableCell>{t.drugClass}</TableCell>
                    <TableCell>{t.dose}</TableCell>
                    <TableCell>{t.reason}</TableCell>
                    <TableCell>{formatDate(t.startDate)}</TableCell>
                    <TableCell>{t.withdrawalDays} days</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="withdrawal" className="mt-5">
          <div className="panel overflow-x-auto p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cow</TableHead>
                  <TableHead>Farmer</TableHead>
                  <TableHead>Last antibiotic</TableHead>
                  <TableHead>Clears on</TableHead>
                  <TableHead>Days left</TableHead>
                  <TableHead>Milk eligibility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cattle.map((c) => {
                  const wd = withdrawalFor(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.id} · {c.name}
                      </TableCell>
                      <TableCell>{c.farmerName}</TableCell>
                      <TableCell>{wd.treatment?.drug ?? "—"}</TableCell>
                      <TableCell>{wd.clearsOn ? formatDate(wd.clearsOn) : "—"}</TableCell>
                      <TableCell>{wd.daysRemaining}</TableCell>
                      <TableCell>
                        <StatusBadge status={wd.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="mrl" className="mt-5">
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Regulatory reference (information only)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              MRL values are published regulatory limits kept for reference. ResiduGuard does not
              measure residue concentration and performs no laboratory testing.
            </p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Antibiotic</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Published MRL in milk</TableHead>
                    <TableHead>Typical milk withdrawal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mrlReference.map((m) => (
                    <TableRow key={m.drug}>
                      <TableCell className="font-medium">{m.drug}</TableCell>
                      <TableCell>{m.drugClass}</TableCell>
                      <TableCell>{m.mrlMilk}</TableCell>
                      <TableCell>{m.typicalWithdrawal}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

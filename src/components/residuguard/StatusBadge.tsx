import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const normalized = status.toUpperCase();
  const safe = ["SAFE", "ACCEPTED", "COMPLETED", "AVAILABLE", "DISPATCHED", "PASS"].includes(
    normalized,
  );
  const blocked = ["HOLD", "ON_HOLD", "REJECTED", "RECALLED", "FAIL", "INCONCLUSIVE"].includes(
    normalized,
  );
  const Icon = safe ? CheckCircle2 : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide",
        safe
          ? "bg-safe-soft text-safe"
          : blocked
            ? "bg-hold-soft text-hold"
            : "bg-info-soft text-info",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {status}
    </span>
  );
}

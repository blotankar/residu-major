import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import residuguardLogo from "@/assets/residuguard-logo.png";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { roleById, type RoleDef } from "@/lib/roles";
import type { RoleId } from "@/lib/residuguard-data";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3">
      <img
        src={residuguardLogo}
        alt="ResiduGuard logo"
        className="h-12 w-auto object-contain"
      />

      {!compact && (
        <span className="leading-tight">
          <span className="block font-heading text-xl font-bold text-heading">
            ResiduGuard
          </span>

          <span className="block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Dairy Traceability Portal
          </span>
        </span>
      )}
    </Link>
  );
}

export function PortalShell({
  role,
  title,
  subtitle,
  children,
}: {
  role: RoleId;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const def = roleById(role) as RoleDef;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Brand />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-heading">{def.person}</p>
              <p className="text-xs text-muted-foreground">
                {def.label} · {def.org}
              </p>
            </div>
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <def.icon className="size-5" aria-hidden />
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        ResiduGuard prototype · Compliance status is derived from recorded treatment and
        withdrawal data only. No laboratory testing or residue measurement is performed.
      </footer>
    </div>
  );
}

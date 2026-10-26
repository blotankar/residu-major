import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { roleById } from "@/lib/roles";
import type { RoleId } from "@/lib/residuguard-data";

export function RoleGate({ role, children }: { role: RoleId; children: ReactNode }) {
  const { user, hydrated } = useSession();
  const def = roleById(role);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading portal…
      </div>
    );
  }

  if (user?.role !== role) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="panel max-w-md p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-lg bg-hold-soft text-hold">
            <Lock className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Restricted area</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The {def?.label} workspace is only visible to a signed-in {def?.label.toLowerCase()}{" "}
            account. Choose that role on the login page to continue.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to="/login">Go to login</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

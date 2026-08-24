import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function TopBar({ email, isAdmin }: { email?: string | null | undefined; isAdmin?: boolean | undefined }) {
  const navigate = useNavigate();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/clientes" className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-primary" />
          <span className="font-display text-base font-bold tracking-tight">Resultados S/A</span>
        </Link>
        <div className="flex items-center gap-4">
          {email && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {email}
              {isAdmin ? " · admin" : ""}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    </header>
  );
}

import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { BrandMark } from "@/components/brand-mark";

export function TopBar({ email, isAdmin }: { email?: string | null | undefined; isAdmin?: boolean | undefined }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/clientes" aria-label="Resultados S/A — Clientes">
          <BrandMark className="h-6 sm:h-8" />
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
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
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

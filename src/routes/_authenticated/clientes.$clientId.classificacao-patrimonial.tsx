import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { classifyBalanceEntries } from "@/lib/balance-classification.functions";
import { listEntries } from "@/lib/entries.functions";
import {
  BALANCE_GROUPS,
  BALANCE_GROUP_LABEL,
  type BalanceGroup,
} from "@/lib/accounting";
import { brl } from "@/lib/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/classificacao-patrimonial")({
  head: () => ({
    meta: [
      { title: "Classificação patrimonial — Resultados S/A" },
      {
        name: "description",
        content: "Classificação de movimentações de Balanço Patrimonial sem impacto na DRE.",
      },
    ],
  }),
  component: PatrimonialClassificationPage,
});

function PatrimonialClassificationPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchEntries = useServerFn(listEntries);
  const classifyBalance = useServerFn(classifyBalanceEntries);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [balanceGroup, setBalanceGroup] = useState<BalanceGroup>("passivo");

  const entries = useQuery({
    queryKey: ["patrimonial-pending-entries", clientId, search],
    queryFn: () =>
      fetchEntries({
        data: {
          clientId,
          status: "pendente",
          search: search.trim() || null,
          importId: null,
          limit: 200,
        },
      }),
  });

  const rows = entries.data?.rows ?? [];
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const classify = useMutation({
    mutationFn: () =>
      classifyBalance({
        data: {
          clientId,
          entryIds: selected,
          account: account.trim(),
          balanceGroup,
        },
      }),
    onSuccess: (result) => {
      toast.success(`${result.updated} lançamento(s) classificados no Balanço Patrimonial.`);
      setSelected([]);
      setAccount("");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-semibold">Classificação patrimonial</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Use esta fila para movimentos de Ativo, Passivo e Patrimônio Líquido. Lançamentos
              classificados aqui ficam confirmados, mas são excluídos da DRE.
            </p>
          </div>
          <Badge variant="secondary">Balanço Patrimonial</Badge>
        </div>
      </section>

      <section className="rounded-lg border border-primary/40 bg-card p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="balance-account">Conta patrimonial</Label>
            <Input
              id="balance-account"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              maxLength={120}
              placeholder="Empréstimos e Financiamentos"
            />
          </div>
          <div className="space-y-2">
            <Label>Grupo patrimonial</Label>
            <Select
              value={balanceGroup}
              onValueChange={(value) => setBalanceGroup(value as BalanceGroup)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BALANCE_GROUPS.map((group) => (
                  <SelectItem key={group} value={group}>
                    {BALANCE_GROUP_LABEL[group]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="patrimonial-search">Buscar pendência</Label>
            <Input
              id="patrimonial-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={120}
              placeholder="Liberação crédito..."
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              if (selected.length === 0) {
                toast.error("Selecione ao menos um lançamento.");
                return;
              }
              if (!account.trim()) {
                toast.error("Informe a conta patrimonial.");
                return;
              }
              classify.mutate();
            }}
            disabled={classify.isPending}
          >
            {classify.isPending
              ? "Classificando..."
              : `Confirmar ${selected.length || ""} no Balanço`}
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])} disabled={selected.length === 0}>
            Limpar seleção
          </Button>
          <span className="text-xs text-muted-foreground">
            {rows.length} pendência(s) visível(is)
          </span>
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => setSelected(checked ? rows.map((row) => row.id) : [])}
                />
              </th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="bg-card">
                <td className="px-4 py-3">
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, row.id]
                          : current.filter((entryId) => entryId !== row.id),
                      )
                    }
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{row.entry_date}</td>
                <td className="max-w-md px-4 py-3">
                  <p className="truncate">{row.description}</p>
                  {row.original_category && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.original_category}
                    </p>
                  )}
                </td>
                <td className="max-w-xs px-4 py-3 text-muted-foreground">
                  <p className="truncate">{row.counterparty ?? "—"}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                  {brl(Number(row.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.isLoading && (
          <p className="bg-card p-10 text-center text-sm text-muted-foreground">Carregando...</p>
        )}
        {!entries.isLoading && rows.length === 0 && (
          <p className="bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhuma pendência neste filtro.
          </p>
        )}
      </div>
    </div>
  );
}

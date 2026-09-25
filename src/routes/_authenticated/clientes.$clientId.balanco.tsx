import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listBalanceAccounts, saveBalanceAccount } from "@/lib/balance-accounts.functions";
import { listBalanceManualEntries, saveBalanceManualEntry } from "@/lib/balance-manual-entries.functions";
import { computeBalanceTotals } from "@/lib/balance-sheet";
import { BALANCE_GROUP_LABEL, BALANCE_SUBGROUP_LABEL, type BalanceSubgroup } from "@/lib/accounting";
import { brl } from "@/lib/finance";
import { PeriodNav } from "@/components/period-nav";
import { periodToRange, usePeriodFilter } from "@/hooks/use-period-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/balanco")({
  head: () => ({
    meta: [
      { title: "Balanço patrimonial — Resultados S/A" },
      {
        name: "description",
        content: "Ativo, Passivo e Patrimônio Líquido por mês, a partir do plano de contas do cliente.",
      },
    ],
  }),
  component: BalancoPage,
});

type EditableGroup = "ativo" | "passivo";
const EDITABLE_GROUPS: EditableGroup[] = ["ativo", "passivo"];
const SUBGROUPS: BalanceSubgroup[] = ["circulante", "nao_circulante"];

function AccountValueRow({
  name,
  value,
  onSave,
}: {
  name: string;
  value: number | undefined;
  onSave: (value: number) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value !== undefined ? String(value) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value !== undefined ? String(value) : "");
  }, [value]);

  const persisted = value !== undefined ? String(value) : "";
  const parsed = Number(draft);
  const isValid = draft.trim() !== "" && Number.isFinite(parsed);
  const dirty = draft !== persisted;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-2.5">
      <span className="text-sm">{name}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          placeholder="—"
          className="w-36 text-right font-mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!dirty || !isValid || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(parsed);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function BalancoPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listBalanceAccounts);
  const persistAccount = useServerFn(saveBalanceAccount);
  const fetchValues = useServerFn(listBalanceManualEntries);
  const persistValue = useServerFn(saveBalanceManualEntry);

  const periodFilter = usePeriodFilter(clientId, "balanco-period-filter");
  const periodDate = periodToRange(periodFilter.period).from;

  const accounts = useQuery({
    queryKey: ["balance-accounts", clientId],
    queryFn: () => fetchAccounts({ data: { clientId } }),
  });

  const values = useQuery({
    queryKey: ["balance-manual-entries", clientId, periodDate],
    queryFn: () => fetchValues({ data: { clientId, from: periodDate, to: periodDate } }),
  });

  const valuesByAccountId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of values.data ?? []) map[v.accountId] = v.value;
    return map;
  }, [values.data]);

  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.active),
    [accounts.data],
  );

  const totals = useMemo(
    () => computeBalanceTotals(activeAccounts, valuesByAccountId),
    [activeAccounts, valuesByAccountId],
  );

  const saveValue = useMutation({
    mutationFn: (args: { accountId: string; value: number }) =>
      persistValue({ data: { clientId, accountId: args.accountId, period: periodDate, value: args.value } }),
    onSuccess: () => {
      toast.success("Valor salvo.");
      void queryClient.invalidateQueries({ queryKey: ["balance-manual-entries", clientId, periodDate] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState<{
    name: string;
    balanceGroup: EditableGroup;
    balanceSubgroup: BalanceSubgroup;
  }>({ name: "", balanceGroup: "ativo", balanceSubgroup: "circulante" });

  const createAccount = useMutation({
    mutationFn: () =>
      persistAccount({
        data: {
          clientId,
          id: null,
          values: {
            name: newAccountForm.name.trim(),
            balanceGroup: newAccountForm.balanceGroup,
            balanceSubgroup: newAccountForm.balanceSubgroup,
            active: true,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Conta cadastrada.");
      setNewAccountOpen(false);
      setNewAccountForm({ name: "", balanceGroup: "ativo", balanceSubgroup: "circulante" });
      void queryClient.invalidateQueries({ queryKey: ["balance-accounts", clientId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accountsByGroup = (group: EditableGroup, subgroup: BalanceSubgroup) =>
    activeAccounts.filter((a) => a.balance_group === group && a.balance_subgroup === subgroup);

  const groupTotal = (group: EditableGroup) =>
    group === "ativo" ? totals.totalAtivo : totals.totalPassivo;

  const GroupBlock = ({ group, title }: { group: EditableGroup; title: string }) => (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3">
        <h2 className="font-display text-sm font-semibold">{title}</h2>
      </div>
      {SUBGROUPS.map((subgroup) => {
        const list = accountsByGroup(group, subgroup);
        return (
          <div key={subgroup}>
            <p className="border-b border-border px-5 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {BALANCE_SUBGROUP_LABEL[subgroup]}
            </p>
            {list.length === 0 && (
              <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">
                Nenhuma conta cadastrada.
              </p>
            )}
            {list.map((account) => (
              <AccountValueRow
                key={account.id}
                name={account.name}
                value={valuesByAccountId[account.id]}
                onSave={(value) => saveValue.mutateAsync({ accountId: account.id, value })}
              />
            ))}
          </div>
        );
      })}
      <div className="flex items-center justify-between bg-muted/30 px-5 py-3 font-semibold">
        <span>Total {title}</span>
        <span className="font-mono">{brl(groupTotal(group))}</span>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold">Balanço Patrimonial</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Ativo, Passivo e Patrimônio Líquido do mês, a partir do plano de contas do cliente.
            Patrimônio Líquido é sempre calculado (Total Ativo − Total Passivo), não tem conta própria.
          </p>
        </div>

        <Dialog open={newAccountOpen} onOpenChange={setNewAccountOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">+ Nova conta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova conta patrimonial</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-account-name">Nome</Label>
                <Input
                  id="new-account-name"
                  maxLength={120}
                  value={newAccountForm.name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Grupo</Label>
                <Select
                  value={newAccountForm.balanceGroup}
                  onValueChange={(v) =>
                    setNewAccountForm({ ...newAccountForm, balanceGroup: v as EditableGroup })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDITABLE_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {BALANCE_GROUP_LABEL[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subgrupo</Label>
                <Select
                  value={newAccountForm.balanceSubgroup}
                  onValueChange={(v) =>
                    setNewAccountForm({ ...newAccountForm, balanceSubgroup: v as BalanceSubgroup })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBGROUPS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {BALANCE_SUBGROUP_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  if (newAccountForm.name.trim().length < 1) {
                    toast.error("Informe o nome da conta.");
                    return;
                  }
                  createAccount.mutate();
                }}
                disabled={createAccount.isPending}
              >
                {createAccount.isPending ? "Salvando..." : "Salvar conta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-5">
        <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          Navegar por mês
        </span>
        <PeriodNav
          period={periodFilter.period}
          onNext={periodFilter.nextMonth}
          onPrevious={periodFilter.previousMonth}
        />
      </div>

      {accounts.isLoading || values.isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
          Carregando balanço...
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <GroupBlock group="ativo" title="Ativo" />
            <GroupBlock group="passivo" title="Passivo" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-card px-5 py-4">
            <span className="font-display text-sm font-semibold">Patrimônio Líquido</span>
            <span className="font-mono text-lg font-semibold">{brl(totals.patrimonioLiquido)}</span>
          </div>
        </>
      )}
    </div>
  );
}

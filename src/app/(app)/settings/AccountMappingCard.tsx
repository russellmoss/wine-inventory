"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";
import { MAPPABLE_COMPONENTS } from "@/lib/accounting/components";
import { loadChartOfAccounts, saveComponentMappings } from "@/lib/accounting/actions";
import type { NormalizedAccount } from "@/lib/accounting/adapter";

// Phase 15 Unit 6 — guided account mapping. Business roles, never Debit/Credit (Gemini). Gated on a
// live connection; skeleton while the CoA loads; retry on fetch failure (no dead-end). Each row shows
// "Mapped" / "Not mapped yet" and warns that unmapped components hold their postings (D14). Keyboard-
// navigable <label>-associated selects, 44px targets, status by text+badge (never color alone).

type Mapping = { component: string; costAccount: string | null; inventoryAccount: string | null };

const selectStyle: React.CSSProperties = {
  height: 44,
  width: "100%",
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

function AccountSelect({
  id,
  label,
  value,
  accounts,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  accounts: NormalizedAccount[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px", minWidth: 0 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{label}</span>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} style={selectStyle}>
        <option value="">— not mapped —</option>
        {accounts.map((a) => (
          <option key={a.accountKey} value={a.accountKey}>
            {a.number ? `${a.number} · ` : ""}
            {a.name}
            {a.type ? ` (${a.type})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AccountMappingCard({
  connected,
  homeCurrency,
  initialMappings,
}: {
  connected: boolean;
  homeCurrency: string | null;
  initialMappings: Mapping[];
}) {
  const router = useRouter();
  const [mappings, setMappings] = React.useState<Mapping[]>(initialMappings);
  const [cost, setCost] = React.useState<NormalizedAccount[] | null>(null);
  const [inventory, setInventory] = React.useState<NormalizedAccount[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<string | null>(null);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const fetchCoa = React.useCallback(() => {
    setLoading(true);
    setLoadError(null);
    startTransition(async () => {
      try {
        const { cost, inventory } = await loadChartOfAccounts();
        setCost(cost);
        setInventory(inventory);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load your chart of accounts.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  React.useEffect(() => {
    if (connected) fetchCoa();
  }, [connected, fetchCoa]);

  function setRow(component: string, patch: Partial<Mapping>) {
    setMappings((prev) => prev.map((m) => (m.component === component ? { ...m, ...patch } : m)));
    setSaveMsg(null);
  }

  // A half-filled row (one account chosen) can't be saved — both or neither.
  const halfFilled = mappings.filter((m) => Boolean(m.costAccount) !== Boolean(m.inventoryAccount));
  const unmappedCount = mappings.filter((m) => !m.costAccount && !m.inventoryAccount).length;

  function save() {
    setSaveErr(null);
    setSaveMsg(null);
    startTransition(async () => {
      try {
        await saveComponentMappings(mappings);
        setSaveMsg("Saved.");
        router.refresh();
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : "Couldn't save the mappings.");
      }
    });
  }

  return (
    <Card id="accounting-mapping" style={{ maxWidth: 560, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Account mapping</h2>
        {connected && unmappedCount > 0 && <Badge tone="gold">{unmappedCount} need an account</Badge>}
      </div>
      <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "52ch" }}>
        Tell QuickBooks where each cost lands. For each component pick a cost / expense account and the
        inventory asset account it moves against. A component with no accounts is held until you map it —
        we never post a number you can&apos;t stand behind.
      </p>

      {!connected ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Connect QuickBooks first to map your accounts.</p>
      ) : loading || (!cost && !loadError) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 44, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)" }} />
          ))}
        </div>
      ) : loadError ? (
        <div>
          <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 10 }}>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={fetchCoa} disabled={pending}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {homeCurrency && (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
              Your books are in {homeCurrency}. Costs in another currency are held until they&apos;re
              translated (coming later) — never posted at the wrong rate.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {MAPPABLE_COMPONENTS.map(({ component, label, hint }) => {
              const row = mappings.find((m) => m.component === component) ?? { component, costAccount: null, inventoryAccount: null };
              const mapped = Boolean(row.costAccount && row.inventoryAccount);
              const half = Boolean(row.costAccount) !== Boolean(row.inventoryAccount);
              return (
                <div key={component} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 500 }}>{label}</span>
                    <Badge tone={mapped ? "green" : half ? "red" : "neutral"}>
                      {mapped ? "Mapped" : half ? "Finish this row" : "Not mapped yet"}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>{hint}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <AccountSelect
                      id={`cost-${component}`}
                      label="Cost / expense account"
                      value={row.costAccount}
                      accounts={cost ?? []}
                      onChange={(v) => setRow(component, { costAccount: v })}
                    />
                    <AccountSelect
                      id={`inv-${component}`}
                      label="Inventory asset account"
                      value={row.inventoryAccount}
                      accounts={inventory ?? []}
                      onChange={(v) => setRow(component, { inventoryAccount: v })}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <Button variant="primary" onClick={save} disabled={pending || halfFilled.length > 0}>
              {pending ? "Saving…" : "Save mappings"}
            </Button>
            {halfFilled.length > 0 && (
              <span style={{ color: "var(--danger)", fontSize: 13 }}>
                Finish or clear both accounts on {halfFilled.length} row(s) first.
              </span>
            )}
            {saveMsg && <span style={{ color: "var(--positive)", fontSize: 14 }}>{saveMsg}</span>}
            {saveErr && <span style={{ color: "var(--danger)", fontSize: 14 }}>{saveErr}</span>}
          </div>
        </>
      )}
    </Card>
  );
}

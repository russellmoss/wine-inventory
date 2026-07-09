"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Button } from "@/components/ui";
import { formatL, type CurrentLocation } from "@/lib/lot/timeline";
import type { LotListRow, LotListFilter, TastingSearchRow } from "@/lib/lot/data";
import { searchTastingNotesAction } from "@/lib/chemistry/actions";
import { searchLotsAction } from "@/lib/lot/naming-actions";
import type { LotSearchMatch } from "@/lib/lot/identify";

const TABS: { key: LotListFilter; label: string }[] = [
  { key: "ACTIVE", label: "Active" },
  { key: "DEPLETED", label: "Depleted" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "ALL", label: "All" },
];

// Sentence-case a lot form enum for display (WINE -> "Wine", BOTTLED_IN_PROCESS -> "Bottled in process").
function formLabel(form: string): string {
  const s = form.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Tone = React.ComponentProps<typeof Badge>["tone"];
function formTone(form: string): Tone {
  if (form === "FINISHED") return "green";
  if (form === "BOTTLED_IN_PROCESS") return "maroon";
  return "neutral";
}
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
function statusTone(status: string): Tone {
  return status === "ACTIVE" ? "green" : "neutral";
}

function originText(r: LotListRow): string {
  const parts = [r.varietyName, r.vineyardName, r.vintageYear != null ? String(r.vintageYear) : null].filter(
    (x): x is string => !!x,
  );
  return parts.length ? parts.join(" · ") : "—";
}

function LocationChips({ locations }: { locations: CurrentLocation[] }) {
  if (locations.length === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {locations.map((l) => (
        <Badge key={l.vesselId} tone="neutral" variant="soft">
          {l.label}
        </Badge>
      ))}
    </span>
  );
}

function buildHref(status: LotListFilter, vesselId?: string): string {
  const params = new URLSearchParams();
  params.set("status", status.toLowerCase());
  if (vesselId) params.set("vessel", vesselId);
  return `/lots?${params.toString()}`;
}

const searchFieldStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
  flex: "1 1 240px",
};

// NICE: free-text tasting-note search. Submits to a gated server action and links matches
// back to their lot. Empty term clears; <2 chars is a no-op (matches the loader guard).
function TastingSearch() {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<TastingSearchRow[] | null>(null);
  const [pending, startTransition] = React.useTransition();

  function run() {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      setResults(await searchTastingNotesAction(term));
    });
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasting notes (aroma, flavor, …)"
          style={searchFieldStyle}
          aria-label="Search tasting notes"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending} style={{ minHeight: 44 }}>
          {pending ? "Searching…" : "Search notes"}
        </Button>
        {results != null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setResults(null);
            }}
            style={{ minHeight: 44 }}
          >
            Clear
          </Button>
        ) : null}
      </form>
      {results != null ? (
        results.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 10 }}>No tasting notes match “{q.trim()}”.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {results.map((r, i) => (
              <Link
                key={`${r.lotId}-${i}`}
                href={`/lots/${r.lotId}`}
                style={{ display: "block", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface-raised)", color: "inherit" }}
              >
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{r.lotCode}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}> · {r.dateLabel}</span>
                {r.snippet ? <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 2 }}>{r.snippet}</div> : null}
              </Link>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

// Phase 1 (identity presentation, plan U3): cross-identifier lot search — resolves by current code,
// displayName, a historical code (via LotCodeEvent), or a legacy identifier. Renders the disambiguation
// envelope so a query matching two lots is never silently collapsed; a historical hit shows "formerly X".
function LotIdentifierSearch() {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<LotSearchMatch[] | null>(null);
  const [pending, startTransition] = React.useTransition();

  function run() {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      setResults(await searchLotsAction({ query: term, limit: 10 }));
    });
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a lot by any code, name, or alias"
          style={searchFieldStyle}
          aria-label="Find a lot by any identifier"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending} style={{ minHeight: 44 }}>
          {pending ? "Searching…" : "Find lot"}
        </Button>
        {results != null ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(""); setResults(null); }} style={{ minHeight: 44 }}>
            Clear
          </Button>
        ) : null}
      </form>
      {results != null ? (
        results.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 10 }}>No lots match “{q.trim()}”.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {results.map((r) => {
              // Design contract: current-code/displayName hits show the code; a historical or legacy hit
              // reads "code (formerly: matched-value)" so two-lot matches are disambiguated (council G4).
              const secondary =
                r.matchType === "historical-code" || r.matchType === "legacy-identifier"
                  ? `formerly / alias: ${r.matchContext}`
                  : r.matchType === "display-name" && r.displayName
                    ? r.displayName
                    : null;
              return (
                <Link
                  key={r.lotId}
                  href={`/lots/${r.lotId}`}
                  aria-label={`${r.currentCode}${secondary ? `, ${secondary}` : ""}`}
                  style={{ display: "block", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface-raised)", color: "inherit" }}
                >
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{r.currentCode}</span>
                  {secondary ? <span style={{ color: "var(--text-muted)", fontSize: 13 }}> · {secondary}</span> : null}
                </Link>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}

function StatusTabs({ active, vesselId }: { active: LotListFilter; vesselId?: string }) {
  return (
    <div role="tablist" aria-label="Lot status filter" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={buildHref(t.key, vesselId)}
            role="tab"
            aria-selected={isActive}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 40,
              padding: "8px 16px",
              borderRadius: "var(--radius-pill)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? "var(--accent-on)" : "var(--text-secondary)",
              background: isActive ? "var(--accent)" : "var(--surface-sunken)",
              border: "1px solid var(--border-strong)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

const TH: React.CSSProperties = { padding: "10px 14px", fontWeight: 500, textAlign: "left" };
const TD: React.CSSProperties = { padding: "12px 14px", verticalAlign: "middle" };
const numStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" };

export function LotsClient({
  lots,
  status,
  vesselId,
  canLens = false,
  lensOn = false,
}: {
  lots: LotListRow[];
  status: LotListFilter;
  vesselId?: string;
  canLens?: boolean;
  lensOn?: boolean;
}) {
  const router = useRouter();
  const [hovered, setHovered] = React.useState<string | null>(null);

  return (
    <div>
      <Eyebrow rule>Cellar</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Lot timeline</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Every batch of wine, vine to bottle. Open a lot to read its full history from the ledger — seeds, racks,
        bottlings, and corrections, newest first.
      </p>

      <LotIdentifierSearch />
      <TastingSearch />

      <StatusTabs active={status} vesselId={vesselId} />

      {canLens ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 16px" }}>
          <Link
            href={lensOn ? "/lots" : "/lots?lens=mine"}
            style={{
              minHeight: 34,
              display: "inline-flex",
              alignItems: "center",
              padding: "5px 14px",
              borderRadius: "var(--radius-pill)",
              border: `1px solid ${lensOn ? "var(--accent)" : "var(--border-strong)"}`,
              background: lensOn ? "var(--accent-soft)" : "var(--surface-raised)",
              color: lensOn ? "var(--text-accent)" : "var(--text-primary)",
              fontSize: 13.5,
              textDecoration: "none",
            }}
            aria-pressed={lensOn}
          >
            {lensOn ? "Showing: my vineyards' lots" : "Lens: my vineyards' lots"}
          </Link>
          {lensOn ? <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Lots whose fruit touches your vineyards — including blends.</span> : null}
        </div>
      ) : null}

      {lots.length === 0 ? (
        <Card>
          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, marginBottom: 6 }}>
            {status === "ACTIVE" ? "No active lots." : "No lots match this filter."}
          </p>
          <p style={{ color: "var(--text-secondary)", maxWidth: "56ch", marginBottom: 12 }}>
            {status === "ACTIVE"
              ? "Lots appear here as wine moves through your vessels. Set up your barrels and tanks to get started."
              : "Try the Active or All filter to see lots in other states."}
          </p>
          <Link href="/vessels" style={{ color: "var(--text-accent)", fontWeight: 500 }}>
            Go to Vessels ›
          </Link>
        </Card>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Card padding="0">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>
                    <th style={TH}>Lot code</th>
                    <th style={TH}>Form</th>
                    <th style={TH}>Origin</th>
                    <th style={{ ...TH, textAlign: "right" }}>Volume</th>
                    <th style={TH}>Location</th>
                    <th style={TH}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/lots/${r.id}`)}
                      onMouseEnter={() => setHovered(r.id)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        borderTop: "1px solid var(--border-strong)",
                        cursor: "pointer",
                        background: hovered === r.id ? "var(--surface-sunken)" : "transparent",
                        opacity: r.status === "ARCHIVED" ? 0.68 : 1,
                      }}
                    >
                      <td style={TD}>
                        <Link
                          href={`/lots/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontWeight: 500, color: "var(--text-primary)" }}
                        >
                          {r.code}
                        </Link>
                        {r.isLegacy ? (
                          <Badge tone="neutral" variant="soft" style={{ marginLeft: 8 }}>
                            legacy
                          </Badge>
                        ) : null}
                      </td>
                      <td style={TD}>
                        <Badge tone={formTone(r.form)} variant="soft">
                          {formLabel(r.form)}
                        </Badge>
                      </td>
                      <td style={{ ...TD, color: "var(--text-secondary)" }}>{originText(r)}</td>
                      <td style={{ ...TD, ...numStyle }}>{formatL(r.totalL)} L</td>
                      <td style={TD}>
                        <LocationChips locations={r.locations} />
                      </td>
                      <td style={TD}>
                        <Badge tone={statusTone(r.status)} variant="soft">
                          {statusLabel(r.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Mobile: stacked cards */}
          <div className="md:hidden" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lots.map((r) => (
              <Card key={r.id} as="div" padding="0" interactive style={{ opacity: r.status === "ARCHIVED" ? 0.68 : 1 }}>
                <Link
                  href={`/lots/${r.id}`}
                  style={{ display: "block", padding: "16px", color: "inherit" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 16, color: "var(--text-primary)" }}>{r.code}</span>
                    <Badge tone={formTone(r.form)} variant="soft">
                      {formLabel(r.form)}
                    </Badge>
                    {r.isLegacy ? (
                      <Badge tone="neutral" variant="soft">
                        legacy
                      </Badge>
                    ) : null}
                    <span style={{ marginLeft: "auto" }}>
                      <Badge tone={statusTone(r.status)} variant="soft">
                        {statusLabel(r.status)}
                      </Badge>
                    </span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 8 }}>{originText(r)}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <LocationChips locations={r.locations} />
                    <span style={{ ...numStyle, fontSize: 15, color: "var(--text-primary)" }}>{formatL(r.totalL)} L</span>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Eyebrow, Input } from "@/components/ui";
import {
  CALCULATORS, SECTIONS, defaultInput, DomainError, isCalc,
  type CalcDescriptor, type CalcResult, type Descriptor, type FieldSpec,
} from "@/lib/winemaking-calc";
import type { CalcHistoryRow } from "@/lib/winemaking-calc/log";
import type { LogCalcPayload } from "./actions";

// Big 3: the calcs a winemaker reaches for most, pinned above the section list (design review).
const PINNED = ["so2-kmbs", "chaptalization", "yan-dose"];

// Static reference content, mapped by id at the page layer (the registry stays data-only).
const STATIC_CONTENT: Record<string, string> = {
  "so2-ph-effectiveness":
    "Molecular SO₂ is the antimicrobially active fraction of free SO₂ and depends on pH (pKa 1.81). As pH rises, the same free SO₂ yields less molecular SO₂ — so higher-pH wines need more free SO₂ to stay protected. Use the 'Free SO₂ for a molecular target' calculator to size an addition for your pH.",
  "so2-solution-strength":
    "To prepare an SO₂ stock solution, dissolve a known mass of KMBS in water to a target % (w/v), then titrate to confirm strength before dosing. Label the container with the verified concentration and prep date.",
  "fining-summary":
    "Recommended fining dose ranges vary by agent (bentonite, PVPP, gelatin, isinglass, egg white, activated carbon, etc.). Always bench-trial a fining before a cellar-scale addition — over-fining strips aroma and color.",
};

export default function CalculatorClient({
  initialHistory = [],
  logAction,
}: {
  initialHistory?: CalcHistoryRow[];
  logAction?: (payload: LogCalcPayload) => Promise<CalcHistoryRow[]>;
} = {}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>("so2-molecular");
  const [inputs, setInputs] = useState<Record<string, string | number>>(() => {
    const d = CALCULATORS.find((c) => c.id === "so2-molecular");
    return d && isCalc(d) ? defaultInput(d) : {};
  });
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CalcHistoryRow[]>(initialHistory);
  const [, startLogging] = useTransition();

  const selected = useMemo(() => CALCULATORS.find((c) => c.id === selectedId) ?? null, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CALCULATORS;
    return CALCULATORS.filter(
      (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.section.toLowerCase().includes(q),
    );
  }, [query]);

  function select(d: Descriptor) {
    setSelectedId(d.id);
    setResult(null);
    setError(null);
    setInputs(isCalc(d) ? defaultInput(d) : {});
  }

  function calculate() {
    if (!selected || !isCalc(selected)) return;
    try {
      setError(null);
      const res = selected.compute(inputs);
      setResult(res);
      // Best-effort traceability log (source PAGE). Never blocks or breaks the result: a failed
      // action is swallowed and the answer stays on screen. Refreshes the history panel on success.
      if (logAction) {
        const payload: LogCalcPayload = { calculatorId: selected.id, inputs: { ...inputs }, output: res.values };
        startLogging(() => {
          logAction(payload).then(setHistory).catch(() => {});
        });
      }
    } catch (e) {
      setResult(null);
      setError(e instanceof DomainError ? e.message : "Could not calculate — check your inputs.");
    }
  }

  const pinned = PINNED.map((id) => CALCULATORS.find((c) => c.id === id)).filter(Boolean) as Descriptor[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <header>
        <Eyebrow rule>Winery</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, margin: "var(--space-2) 0 0" }}>
          Winemaking Calculator
        </h1>
        <p style={{ color: "var(--text-secondary)", maxWidth: "60ch", marginTop: "var(--space-2)" }}>
          Bench math for SO₂, sugar, acid, blending, fortification and unit conversions. Results are
          advisory, not a substitute for lab measurement.
        </p>
      </header>

      <div style={{ display: "grid", gap: "var(--space-5)", gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)" }} className="wmc-grid">
        {/* Left: search + pinned + section list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Input
            label="Find a calculator"
            placeholder="Search SO₂, Brix, blend…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!query && (
            <div>
              <Eyebrow>Common</Eyebrow>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                {pinned.map((d) => (
                  <Button key={d.id} variant={selectedId === d.id ? "primary" : "secondary"} size="sm" onClick={() => select(d)}>
                    {d.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <nav aria-label="Calculators by section" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {SECTIONS.map((section) => {
              const items = filtered.filter((d) => d.section === section);
              if (items.length === 0) return null;
              return (
                <div key={section}>
                  <Eyebrow>{section}</Eyebrow>
                  <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-2) 0 0", display: "flex", flexDirection: "column", gap: 2 }}>
                    {items.map((d) => (
                      <li key={d.id}>
                        <button
                          onClick={() => select(d)}
                          aria-current={selectedId === d.id}
                          style={{
                            width: "100%", textAlign: "left", background: selectedId === d.id ? "var(--accent-soft)" : "transparent",
                            color: selectedId === d.id ? "var(--wine-primary)" : "var(--text-primary)",
                            border: "none", borderRadius: "var(--radius-sm)", padding: "8px 10px", cursor: "pointer", minHeight: 40,
                            font: "inherit",
                          }}
                        >
                          {d.name}
                          {isCalc(d) && d.danger ? " ⚠" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Right: selected calculator */}
        <div>
          {selected ? (
            isCalc(selected) ? (
              <CalcCard
                key={selected.id}
                descriptor={selected}
                inputs={inputs}
                onChange={(name, value) => setInputs((p) => ({ ...p, [name]: value }))}
                onCalculate={calculate}
                result={result}
                error={error}
              />
            ) : (
              <Card>
                <Eyebrow>{selected.section}</Eyebrow>
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, marginTop: "var(--space-2)" }}>{selected.name}</h2>
                <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-2)", maxWidth: "62ch" }}>
                  {STATIC_CONTENT[selected.id] ?? selected.description}
                </p>
              </Card>
            )
          ) : (
            <Card>
              <p style={{ color: "var(--text-secondary)" }}>Pick a calculator to get started.</p>
            </Card>
          )}
        </div>
      </div>

      <HistoryPanel rows={history} />

      <style>{`@media (max-width: 767px) { .wmc-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function HistoryPanel({ rows }: { rows: CalcHistoryRow[] }) {
  const calcName = (id: string) => CALCULATORS.find((c) => c.id === id)?.name ?? id;
  return (
    <Card>
      <Eyebrow rule>Recent calculations</Eyebrow>
      {rows.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-3)" }}>
          Your calculations appear here for traceability — inputs, result, and when they ran.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {rows.map((r) => (
            <li key={r.id}>
              <details style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "var(--space-2)" }}>
                <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 500 }}>{calcName(r.calculatorId)}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-caption)" }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                  <Badge tone={r.source === "ASSISTANT" ? "maroon" : "neutral"}>{r.source === "ASSISTANT" ? "Assistant" : "Page"}</Badge>
                  {r.advisory && <Badge tone="gold">Advisory</Badge>}
                  {r.danger && <Badge tone="red">Care</Badge>}
                </summary>
                <div style={{ marginTop: "var(--space-2)", fontSize: "var(--text-body-sm)", color: "var(--text-secondary)", display: "grid", gap: "var(--space-1)" }}>
                  <div><span style={{ color: "var(--text-muted)" }}>Inputs: </span><code style={{ fontFamily: "var(--font-mono)" }}>{safeJson(r.inputs)}</code></div>
                  <div><span style={{ color: "var(--text-muted)" }}>Result: </span><code style={{ fontFamily: "var(--font-mono)" }}>{formatOutput(r.output)}</code></div>
                  <div style={{ color: "var(--text-muted)", fontSize: "var(--text-caption)" }}>by {r.userEmail} · engine v{r.engineVersion}</div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

// The output is the CalcResult.values array; render it compactly (label: value unit).
function formatOutput(output: unknown): string {
  if (Array.isArray(output)) {
    return output
      .map((v) => (v && typeof v === "object" && "label" in v ? `${(v as { label: string }).label}: ${(v as { value: number }).value}${(v as { unit?: string }).unit ? " " + (v as { unit?: string }).unit : ""}` : String(v)))
      .join(" · ");
  }
  return safeJson(output);
}

function CalcCard({
  descriptor, inputs, onChange, onCalculate, result, error,
}: {
  descriptor: CalcDescriptor;
  inputs: Record<string, string | number>;
  onChange: (name: string, value: string) => void;
  onCalculate: () => void;
  result: CalcResult | null;
  error: string | null;
}) {
  return (
    <Card>
      <Eyebrow>{descriptor.section}</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, margin: 0 }}>{descriptor.name}</h2>
        {descriptor.advisory && <Badge tone="gold">Advisory</Badge>}
        {descriptor.danger && <Badge tone="red">Handle with care</Badge>}
      </div>
      <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-2)", maxWidth: "62ch" }}>{descriptor.description}</p>

      {descriptor.danger && (
        <p role="note" style={{ background: "rgba(182,61,53,0.10)", color: "var(--red)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", marginTop: "var(--space-3)", fontSize: "var(--text-body-sm)" }}>
          This addition is tightly constrained (regulatory limits and/or irreversible effects). Bench-trial and verify before any cellar-scale addition.
        </p>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); onCalculate(); }}
        style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", marginTop: "var(--space-4)" }}
      >
        {descriptor.fields.map((f) => (
          <Field key={f.name} field={f} value={inputs[f.name]} onChange={(v) => onChange(f.name, v)} />
        ))}
        <div style={{ gridColumn: "1 / -1", marginTop: "var(--space-2)" }}>
          <Button type="submit" variant="primary">Calculate</Button>
        </div>
      </form>

      <div aria-live="polite" style={{ marginTop: "var(--space-4)" }}>
        {error && (
          <p role="alert" style={{ color: "var(--red)", fontSize: "var(--text-body-sm)" }}>{error}</p>
        )}
        {result && !error && (
          <div style={{ borderTop: "1px solid var(--border-strong)", paddingTop: "var(--space-4)" }}>
            <Eyebrow>Result</Eyebrow>
            <dl style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-5)", margin: "var(--space-2) 0 0" }}>
              {result.values.map((v, i) => (
                <div key={i}>
                  <dt style={{ color: "var(--text-secondary)", fontSize: "var(--text-caption)" }}>{v.label}</dt>
                  <dd style={{ margin: 0, fontSize: "var(--text-h3)", fontVariantNumeric: "tabular-nums" }}>
                    {v.value.toLocaleString()} {v.unit ? <span style={{ fontSize: "var(--text-body)", color: "var(--text-secondary)" }}>{v.unit}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            {result.warning && (
              <p role="note" style={{ color: "var(--maroon)", marginTop: "var(--space-3)", fontSize: "var(--text-body-sm)" }}>{result.warning}</p>
            )}
            <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", marginTop: "var(--space-3)" }}>
              {result.formula}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Field({ field, value, onChange }: { field: FieldSpec; value: string | number; onChange: (v: string) => void }) {
  if (field.kind === "select") {
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-body-sm)", color: "var(--text-secondary)" }}>
        {field.label}
        <select
          value={String(value ?? field.default)}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight: 44, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)", background: "var(--surface-raised)", color: "var(--text-primary)", padding: "0 10px", font: "inherit" }}
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <Input
      label={field.label}
      type="number"
      inputMode="decimal"
      step="any"
      value={String(value ?? field.default)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

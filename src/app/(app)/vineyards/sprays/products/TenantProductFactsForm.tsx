"use client";

// S2b Unit 5 — the grower-supplied product-facts entry surface (KD-3/KD-4, rule §3.9). This is the
// non-US / no-EPA-number path: a tenant defines a product's facts by hand, tenant-scoped, attributed,
// and marked grower-supplied everywhere it resolves. Two independent groups (REGULATORY vs
// AGRONOMIC) so a rainfast override never shadows a PHI value it didn't touch (KD-3).

import { cloneElement, isValidElement, useId, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { upsertTenantProductFacts } from "@/lib/spray/actions";

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 3 };
const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 10px",
  border: "1px solid var(--border-strong, #ccc)",
  borderRadius: "var(--radius-md, 8px)",
  fontSize: 14,
};

/**
 * Field — label + control.
 *
 * The label used to be a bare `<label style={labelStyle}>` with no `htmlFor`, so all
 * 12 controls in this form had label text on screen that assistive tech never
 * associated with anything: a screen-reader user heard "combo box, REGULATORY" with
 * no idea what it set. `useId` + `htmlFor` + cloning the id onto the child fixes all
 * 12 at the wrapper instead of 12 times at the call sites.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {child}
    </div>
  );
}

export function TenantProductFactsForm() {
  const [factGroup, setFactGroup] = useState<"REGULATORY" | "AGRONOMIC">("REGULATORY");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    setError(null);
    formData.set("factGroup", factGroup);
    startTransition(async () => {
      const result = await upsertTenantProductFacts(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Add or update a custom product</h3>
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 0 }}>
        For a product with no EPA registration number (a non-US label, or a US product our registry
        cannot resolve). These facts are marked <strong>grower-supplied</strong> everywhere they
        appear — never presented as registry-verified.
      </p>
      {error ? <p style={{ color: "var(--danger, #B63D35)", fontSize: 13.5 }}>{error}</p> : null}
      <form action={submit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Field label="Product reference *">
            <input name="productRef" style={inputStyle} placeholder="e.g. bt-copper-1" required />
          </Field>
          <Field label="Product name *">
            <input name="productName" style={inputStyle} required />
          </Field>
          <Field label="EPA reg. number (optional)">
            <input name="epaRegistrationNumber" style={inputStyle} placeholder="leave blank if none" />
          </Field>
          <Field label="Fact group *">
            <select
              name="factGroup"
              style={inputStyle}
              value={factGroup}
              onChange={(e) => setFactGroup(e.target.value as "REGULATORY" | "AGRONOMIC")}
            >
              <option value="REGULATORY">REGULATORY (PHI, REI, repeat interval, seasonal max)</option>
              <option value="AGRONOMIC">AGRONOMIC (rainfast, mobility class)</option>
            </select>
          </Field>
        </div>

        {factGroup === "REGULATORY" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <Field label="PHI (days)"><input name="worstCasePhiDays" type="number" style={inputStyle} /></Field>
            <Field label="REI (hours)"><input name="worstCaseReiHours" type="number" style={inputStyle} /></Field>
            <Field label="Min repeat interval (days)"><input name="minRepeatIntervalDays" type="number" style={inputStyle} /></Field>
            <Field label="Max applications / season"><input name="maxApplicationsPerSeason" type="number" style={inputStyle} /></Field>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            <Field label="Rainfast (hours)"><input name="rainfastHours" type="number" style={inputStyle} /></Field>
            <Field label="Mobility class">
              <select name="mobilityClass" style={inputStyle} defaultValue="">
                <option value="">unspecified</option>
                <option value="CONTACT_PROTECTANT">contact / protectant</option>
                <option value="TRANSLAMINAR">translaminar</option>
                <option value="LOCALLY_SYSTEMIC">locally systemic</option>
                <option value="MOBILE_SYSTEMIC">mobile systemic</option>
              </select>
            </Field>
            <Field label="Agronomic class tags (comma-separated)">
              <input name="agronomicClass" style={inputStyle} placeholder="e.g. Horticultural Oil" />
            </Field>
          </div>
        )}

        <Field label="Note">
          <input name="note" style={inputStyle} placeholder="where this came from, e.g. the label itself" />
        </Field>

        <div style={{ marginTop: 12 }}>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Card>
  );
}

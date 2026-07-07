"use client";

import React from "react";
import { Card, Eyebrow, Badge, Input, Button } from "@/components/ui";
import {
  listNamingTemplatesAction,
  createNamingTemplateAction,
  setDefaultNamingTemplateAction,
  type NamingTemplateRow,
} from "@/lib/lot/naming-actions";
import { LOT_TOKENS, type NamingTemplateSpec, type NamingSegment, type LotToken } from "@/lib/lot/naming-template";

// Phase 1 (identity presentation, plan U1): the naming-template authoring surface. Shows the tenant's
// templates (the active default marked) and lets an admin author a custom pattern by ordering tokens.
// The built-in default reproduces today's buildLotCode output; a custom template governs only newly
// minted lots. Authoring is admin-gated server-side (adminAction); a non-admin attempt is rejected
// with a clear error. Reuses Card/Input/Button/Badge + design tokens.

const TOKEN_SET = new Set<string>(LOT_TOKENS);

/** Parse a comma-separated pattern ("VINTAGE, EST, VARIETY") into typed segments — known tokens become
 *  attribute segments, everything else is a literal. */
function parseSegments(pattern: string): NamingSegment[] {
  return pattern
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (TOKEN_SET.has(s.toUpperCase()) ? { token: s.toUpperCase() as LotToken } : { literal: s }));
}

export function NamingTemplateCard() {
  const [rows, setRows] = React.useState<NamingTemplateRow[] | null>(null);
  const [name, setName] = React.useState("");
  const [pattern, setPattern] = React.useState("VINTAGE, VINEYARD, VARIETY");
  const [makeDefault, setMakeDefault] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const load = React.useCallback(() => {
    startTransition(async () => setRows(await listNamingTemplatesAction()));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function createTemplate() {
    setBusy(true);
    setError(null);
    try {
      const segments = parseSegments(pattern);
      if (segments.length === 0) throw new Error("Add at least one token or literal to the pattern.");
      const spec: NamingTemplateSpec = { kind: "custom", engineVersion: 1, lot: segments, separator: "-" };
      const code = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
      const { id } = await createNamingTemplateAction({ code, name: name.trim() || "Custom lot code", spec });
      if (makeDefault) await setDefaultNamingTemplateAction({ templateId: id });
      setName("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the template.");
    } finally {
      setBusy(false);
    }
  }

  async function makeTemplateDefault(id: string) {
    setBusy(true);
    setError(null);
    try {
      await setDefaultNamingTemplateAction({ templateId: id });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the default.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ maxWidth: 560, marginTop: 16 }}>
      <Eyebrow rule>Lot naming</Eyebrow>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "8px 0 14px" }}>
        How new lot codes are generated. The built-in default reproduces the standard
        <code style={{ fontSize: 12 }}> YEAR-VINEYARD-BLOCK-VARIETY </code>
        scheme. A custom template governs only newly minted lots — existing codes never change.
      </p>

      {rows == null ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{pending ? "Loading…" : ""}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {rows.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t.name}</span>
              {t.isSystem ? <Badge tone="neutral" variant="soft">built-in</Badge> : null}
              {t.isDefault ? <Badge tone="green" variant="soft">active default</Badge> : (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => makeTemplateDefault(t.id)}>
                  Set as default
                </Button>
              )}
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>v{t.currentVersion}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          New custom template (tokens: {LOT_TOKENS.join(", ")}; anything else is literal text)
        </span>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Estate scheme" />
        <Input label="Pattern (comma-separated)" value={pattern} onChange={(e) => setPattern(e.target.value)} disabled={busy} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} disabled={busy} />
          Make this the active default
        </label>
        {error ? <div style={{ fontSize: 13, color: "var(--text-danger)" }}>{error}</div> : null}
        <div>
          <Button onClick={createTemplate} disabled={busy}>{busy ? "Saving…" : "Create template"}</Button>
        </div>
      </div>
    </Card>
  );
}

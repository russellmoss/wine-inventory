"use client";

import React from "react";
import { Input } from "@/components/ui";
import { type AddressParts, EMPTY_ADDRESS } from "@/lib/address/format";
import type { AddressSuggestion } from "@/app/api/geocode/route";

// Structured filer address (Street 1 / Street 2 / City / State / ZIP) with keyless type-ahead on
// Street 1. Suggestions come from /api/geocode (Photon/OpenStreetMap); picking one autofills the
// other parts, but the operator can always ignore them and keep whatever they typed. Each field
// carries the form `name` the saveComplianceProfile action reads, so a plain <form> submit works.
export function AddressFields({ initial }: { initial?: Partial<AddressParts> }) {
  const [parts, setParts] = React.useState<AddressParts>({ ...EMPTY_ADDRESS, ...initial });
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [loading, setLoading] = React.useState(false);
  const skipRef = React.useRef(false); // suppress the search that a suggestion-pick would trigger
  const acRef = React.useRef<AbortController | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const set = (k: keyof AddressParts, v: string) => setParts((p) => ({ ...p, [k]: v }));

  // Debounced lookup as Street 1 is typed. A pick sets skipRef so we don't immediately re-search.
  React.useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const q = parts.street1.trim();
    const timer = setTimeout(async () => {
      // Clear (rather than search) on a too-short query — inside the timer so no synchronous
      // setState runs in the effect body (avoids cascading renders).
      if (q.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      setLoading(true);
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const data = (await r.json()) as { suggestions?: AddressSuggestion[] };
        const list = data.suggestions ?? [];
        setSuggestions(list);
        setOpen(list.length > 0);
        setActive(-1);
      } catch {
        /* aborted or offline — leave whatever was typed */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [parts.street1]);

  // Close the dropdown on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(s: AddressSuggestion) {
    skipRef.current = true;
    setParts((p) => ({ street1: s.street1, street2: p.street2, city: s.city, state: s.state, zip: s.zip }));
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 100%" }}>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <Input
          label="Street address"
          name="operatedByStreet1"
          value={parts.street1}
          onChange={(e) => set("street1", e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Start typing an address…"
          autoComplete="off"
          hint={loading ? "Searching…" : "Type to search; pick a match or just type it in."}
        />
        {open && suggestions.length > 0 ? (
          <ul
            role="listbox"
            style={{
              position: "absolute",
              zIndex: 20,
              top: "100%",
              left: 0,
              right: 0,
              margin: "4px 0 0",
              padding: 4,
              listStyle: "none",
              background: "var(--surface-raised)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.12))",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {suggestions.map((s, i) => (
              <li
                key={s.label}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus so the click registers before blur
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                style={{
                  padding: "8px 10px",
                  fontSize: 13.5,
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  background: i === active ? "var(--accent-soft, var(--surface-sunken))" : "transparent",
                  color: "var(--text-primary)",
                }}
              >
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Input
        label="Street address 2 (optional)"
        name="operatedByStreet2"
        value={parts.street2}
        onChange={(e) => set("street2", e.target.value)}
        placeholder="Suite, unit, building…"
        autoComplete="off"
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input label="City" name="operatedByCity" value={parts.city} onChange={(e) => set("city", e.target.value)} autoComplete="off" style={{ flex: "2 1 200px" }} />
        <Input label="State" name="operatedByState" value={parts.state} onChange={(e) => set("state", e.target.value)} autoComplete="off" style={{ flex: "1 1 100px" }} />
        <Input label="ZIP" name="operatedByZip" value={parts.zip} onChange={(e) => set("zip", e.target.value)} autoComplete="off" style={{ flex: "1 1 100px" }} />
      </div>
    </div>
  );
}

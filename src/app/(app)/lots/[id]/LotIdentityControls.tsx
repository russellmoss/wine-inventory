"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Modal } from "@/components/ui";
import { renameLotAction, setLotDisplayNameAction, swapLotCodesAction, searchLotsAction } from "@/lib/lot/naming-actions";
import type { LotSearchMatch } from "@/lib/lot/identify";

// Phase 1 (identity presentation, plan U2) — the lot-detail identity controls: displayName subtitle,
// an "also-known-as" chip (hidden when empty), and one "Edit identity" modal with two fields (code +
// displayName). A `code` collision is an OFFER (accept the suggestion or cancel) — never silent
// (NAMING-1). Reuses the shared Modal/Input/Button primitives + design tokens; low-emphasis so it does
// not compete with the code H1 (design-review IA hierarchy).

type Props = { lotId: string; code: string; displayName: string | null; aliases: string[] };

export function LotIdentityControls({ lotId, code, displayName, aliases }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [showAka, setShowAka] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState(code);
  const [nameInput, setNameInput] = React.useState(displayName ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The collision OFFER: set when a rename hits a taken code. The operator accepts the suggestion or cancels.
  const [offer, setOffer] = React.useState<{ attempted: string; suggestion: string } | null>(null);

  // Swap-codes flow (mislabeled tanks): pick another lot via cross-identifier search, then confirm the
  // swap in BOTH directions explicitly before committing to the guarded swapLotCodesAction.
  const [swapOpen, setSwapOpen] = React.useState(false);
  const [swapQuery, setSwapQuery] = React.useState("");
  const [swapResults, setSwapResults] = React.useState<LotSearchMatch[] | null>(null);
  const [swapTarget, setSwapTarget] = React.useState<{ lotId: string; code: string } | null>(null);
  const [swapBusy, setSwapBusy] = React.useState(false);
  const [swapError, setSwapError] = React.useState<string | null>(null);
  const [searching, startSearch] = React.useTransition();

  function openSwap() {
    setSwapQuery("");
    setSwapResults(null);
    setSwapTarget(null);
    setSwapError(null);
    setSwapOpen(true);
  }
  function runSwapSearch() {
    const q = swapQuery.trim();
    if (q.length < 2) { setSwapResults([]); return; }
    startSearch(async () => {
      const rows = await searchLotsAction({ query: q, limit: 10 });
      setSwapResults(rows.filter((r) => r.lotId !== lotId)); // never swap with self
    });
  }
  async function confirmSwap() {
    if (!swapTarget) return;
    setSwapBusy(true);
    setSwapError(null);
    try {
      await swapLotCodesAction({ lotIdA: lotId, lotIdB: swapTarget.lotId });
      setSwapOpen(false);
      router.refresh();
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : "Swap failed.");
    } finally {
      setSwapBusy(false);
    }
  }

  function reset() {
    setCodeInput(code);
    setNameInput(displayName ?? "");
    setError(null);
    setOffer(null);
  }

  async function submit(acceptSuggestion = false) {
    setBusy(true);
    setError(null);
    try {
      // Rename the code only when it changed.
      if (codeInput.trim() && codeInput.trim() !== code) {
        const res = await renameLotAction({ lotId, newCode: codeInput.trim(), acceptSuggestion });
        if (!res.ok) {
          setOffer(res.collision); // present the offer; do NOT apply anything
          setBusy(false);
          return;
        }
      }
      // displayName is free-form + non-unique; "" clears it (coalesced to code on display).
      const nextName = nameInput.trim() === "" ? null : nameInput;
      if (nextName !== (displayName ?? null)) {
        await setLotDisplayNameAction({ lotId, displayName: nextName });
      }
      setOpen(false);
      setOffer(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* displayName subtitle (secondary to the code H1) + a.k.a. chip (hidden when no aliases). */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
        {displayName ? (
          <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>{displayName}</span>
        ) : null}
        {aliases.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowAka((v) => !v)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            aria-label={`Also known as ${aliases.join(", ")}`}
          >
            <Badge tone="neutral" variant="soft">
              a.k.a. {aliases.length}
            </Badge>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => { reset(); setOpen(true); }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "var(--text-accent)" }}
        >
          Edit identity
        </button>
        <button
          type="button"
          onClick={openSwap}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "var(--text-accent)" }}
        >
          Swap codes…
        </button>
      </div>
      {showAka && aliases.length > 0 ? (
        <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)" }}>
          Formerly / also: {aliases.join(", ")}
        </div>
      ) : null}

      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title="Edit lot identity" maxWidth={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 320 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Lot code (unique in this winery)</span>
              <Input value={codeInput} onChange={(e) => { setCodeInput(e.target.value); setOffer(null); }} disabled={busy} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Display name (optional, free text)</span>
              <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} disabled={busy} placeholder="e.g. Reserve Pinot" />
            </label>

            {offer ? (
              <div style={{ fontSize: 13.5, color: "var(--text-primary)", background: "var(--surface-2)", padding: 10, borderRadius: 6 }}>
                <strong>{offer.attempted}</strong> is already used in this winery. Use{" "}
                <strong>{offer.suggestion}</strong> instead?
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Button onClick={() => submit(true)} disabled={busy}>Use {offer.suggestion}</Button>
                  <Button variant="ghost" onClick={() => setOffer(null)} disabled={busy}>Pick another</Button>
                </div>
              </div>
            ) : null}

            {error ? <div style={{ fontSize: 13, color: "var(--text-danger)" }}>{error}</div> : null}

            {!offer ? (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button onClick={() => submit(false)} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
              </div>
            ) : null}
          </div>
      </Modal>

      {/* Swap-codes: pick another lot, then confirm BOTH directions explicitly (mislabeled tanks). */}
      <Modal open={swapOpen} onClose={() => (swapBusy ? undefined : setSwapOpen(false))} title="Swap lot codes" maxWidth={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 340 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Swap this lot&apos;s code with another lot&apos;s — for a mislabeled tank. Both codes trade places;
            each lot&apos;s history stays intact.
          </p>
          {!swapTarget ? (
            <>
              <form onSubmit={(e) => { e.preventDefault(); runSwapSearch(); }} style={{ display: "flex", gap: 8 }}>
                <Input value={swapQuery} onChange={(e) => setSwapQuery(e.target.value)} disabled={swapBusy} placeholder="Find the other lot by code, name, or alias" aria-label="Find the other lot" />
                <Button type="submit" variant="secondary" disabled={searching}>{searching ? "…" : "Find"}</Button>
              </form>
              {swapResults != null ? (
                swapResults.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No other lot matches “{swapQuery.trim()}”.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {swapResults.map((r) => (
                      <button
                        key={r.lotId}
                        type="button"
                        onClick={() => setSwapTarget({ lotId: r.lotId, code: r.currentCode })}
                        style={{ textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface-raised)", cursor: "pointer", color: "inherit" }}
                      >
                        <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{r.currentCode}</span>
                        {r.displayName ? <span style={{ color: "var(--text-muted)", fontSize: 13 }}> · {r.displayName}</span> : null}
                      </button>
                    ))}
                  </div>
                )
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 14, color: "var(--text-primary)", background: "var(--surface-2)", padding: 12, borderRadius: 6, lineHeight: 1.6 }}>
              Confirm the swap:
              <div style={{ marginTop: 6 }}>
                <strong>{code}</strong> becomes <strong>{swapTarget.code}</strong>,<br />
                and <strong>{swapTarget.code}</strong> becomes <strong>{code}</strong>.
              </div>
            </div>
          )}

          {swapError ? <div style={{ fontSize: 13, color: "var(--text-danger)" }}>{swapError}</div> : null}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {swapTarget ? (
              <Button variant="ghost" onClick={() => setSwapTarget(null)} disabled={swapBusy}>Back</Button>
            ) : null}
            <Button variant="ghost" onClick={() => setSwapOpen(false)} disabled={swapBusy}>Cancel</Button>
            {swapTarget ? (
              <Button onClick={confirmSwap} disabled={swapBusy}>{swapBusy ? "Swapping…" : "Swap codes"}</Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}

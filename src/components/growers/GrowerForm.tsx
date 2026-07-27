"use client";

import React from "react";
import { Input, Checkbox, Button } from "@/components/ui";
import { isLikelyEmail } from "@/lib/vendors/vendors-shared";
import type { GrowerRow } from "@/lib/grower/data";
import type { GrowerInput } from "@/lib/grower/grower-shared";

// Plan 095: the shared grower field block used by the /setup/growers add + edit modals, mirroring VendorForm.
// Controlled: the parent owns a GrowerFormValue and gets patches via onChange. Core fields (name, primary
// contact, phone, email, address) are required IN THE UI on create (submit gate); a THIRD-PARTY grower is also
// set up as a vendor on save. Contacts are a repeatable list with at most one primary (radio-style).

const fieldLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" };

export type GrowerContactFormValue = {
  id: string | null;
  name: string;
  role: string;
  phone: string;
  mobile: string;
  email: string;
  isPrimary: boolean;
};

export type GrowerFormValue = {
  name: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  isEstate: boolean;
  contacts: GrowerContactFormValue[];
};

export const emptyGrowerForm: GrowerFormValue = {
  name: "", company: "", contactName: "", phone: "", email: "", address: "", isEstate: false, contacts: [],
};

const emptyContact = (): GrowerContactFormValue => ({ id: null, name: "", role: "", phone: "", mobile: "", email: "", isPrimary: false });

/** Seed the form from an existing grower (edit mode). */
export function growerToForm(g: GrowerRow): GrowerFormValue {
  return {
    name: g.name,
    company: g.company ?? "",
    // Fall back to the legacy free-text `contact` if the structured name isn't set yet (pre-095 rows).
    contactName: g.contactName ?? g.contact ?? "",
    phone: g.phone ?? "",
    email: g.email ?? "",
    address: g.address ?? "",
    isEstate: g.isEstate,
    contacts: g.contacts.map((c) => ({
      id: c.id, name: c.name, role: c.role ?? "", phone: c.phone ?? "", mobile: c.mobile ?? "", email: c.email ?? "", isPrimary: c.isPrimary,
    })),
  };
}

/** Map the form to the server action payload. */
export function growerFormToInput(g: GrowerFormValue): GrowerInput {
  return {
    name: g.name.trim(),
    company: g.company.trim() || undefined,
    contactName: g.contactName.trim() || undefined,
    phone: g.phone.trim() || undefined,
    email: g.email.trim() || undefined,
    address: g.address.trim() || undefined,
    isEstate: g.isEstate,
    contacts: g.contacts
      .filter((c) => c.name.trim())
      .map((c) => ({
        id: c.id ?? undefined,
        name: c.name.trim(),
        role: c.role.trim() || undefined,
        phone: c.phone.trim() || undefined,
        mobile: c.mobile.trim() || undefined,
        email: c.email.trim() || undefined,
        isPrimary: c.isPrimary,
      })),
  };
}

/**
 * UI submit gate. On CREATE (`requireContact` default true) name + primary contact + phone + email + address
 * are required (email valid) — the same rigor as vendors. On EDIT of an existing grower, pass
 * `requireContact: false` — a pre-095 grower may only have a name, and must stay editable. Contact-row emails,
 * when present, must always look valid.
 */
export function growerFormValid(g: GrowerFormValue, opts?: { requireContact?: boolean }): boolean {
  const requireContact = opts?.requireContact ?? true;
  const emailsOk = (!g.email.trim() || isLikelyEmail(g.email)) && g.contacts.every((c) => !c.email.trim() || isLikelyEmail(c.email));
  if (!g.name.trim() || !emailsOk) return false;
  if (requireContact) {
    return g.contactName.trim().length > 0 && g.phone.trim().length > 0 && g.email.trim().length > 0 && g.address.trim().length > 0;
  }
  return true;
}

export function GrowerForm({
  value,
  onChange,
}: {
  value: GrowerFormValue;
  onChange: (patch: Partial<GrowerFormValue>) => void;
}) {
  const primaryGroup = React.useId(); // scope the primary-contact radio group per form instance
  const emailInvalid = value.email.trim().length > 0 && !isLikelyEmail(value.email);

  const setContact = (i: number, patch: Partial<GrowerContactFormValue>) =>
    onChange({ contacts: value.contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const setPrimary = (i: number) =>
    onChange({ contacts: value.contacts.map((c, idx) => ({ ...c, isPrimary: idx === i })) });
  const addContact = () => onChange({ contacts: [...value.contacts, emptyContact()] });
  const removeContact = (i: number) => onChange({ contacts: value.contacts.filter((_, idx) => idx !== i) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Core (required) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input label="Grower name" value={value.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Bien Nacido Vineyard" style={{ flex: "1 1 220px" }} autoFocus />
        <Input label="Company (optional)" value={value.company} onChange={(e) => onChange({ company: e.target.value })} placeholder="legal entity, if different" style={{ flex: "1 1 180px" }} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input label="Primary contact name" value={value.contactName} onChange={(e) => onChange({ contactName: e.target.value })} placeholder="e.g. Nick Gonzalez" style={{ flex: "1 1 200px" }} />
        <Input label="Phone" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="e.g. (805) 555-1000" style={{ flex: "1 1 160px" }} />
        <Input label="Email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="e.g. grapes@biennacido.com" style={{ flex: "1 1 200px" }} />
      </div>
      {emailInvalid ? <p style={{ color: "var(--danger)", fontSize: 12.5, margin: 0 }}>That email address doesn&apos;t look right.</p> : null}
      <Input label="Address" value={value.address} onChange={(e) => onChange({ address: e.target.value })} placeholder="Mailing or vineyard address" />

      <div style={{ paddingTop: 2 }}>
        <Checkbox
          checked={value.isEstate}
          onChange={(c) => onChange({ isEstate: c })}
          label="Estate — the winery's own vineyard (not set up as a vendor)"
        />
      </div>

      {/* Contacts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...fieldLabelStyle, fontSize: 14 }}>Additional contacts</span>
          <Button type="button" variant="ghost" size="sm" onClick={addContact}>＋ Add contact</Button>
        </div>
        {value.contacts.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>Add a vineyard manager, owner, or accounts contact — each with their own phone and email.</p>
        ) : null}
        {value.contacts.map((c, i) => (
          <div key={i} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Input label="Name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} placeholder="Contact name" style={{ flex: "1 1 160px" }} />
              <Input label="Role (optional)" value={c.role} onChange={(e) => setContact(i, { role: e.target.value })} placeholder="e.g. Vineyard manager" style={{ flex: "1 1 140px" }} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Input label="Phone (optional)" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} style={{ flex: "1 1 130px" }} />
              <Input label="Mobile (optional)" value={c.mobile} onChange={(e) => setContact(i, { mobile: e.target.value })} style={{ flex: "1 1 130px" }} />
              <Input label="Email (optional)" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} style={{ flex: "1 1 180px" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
                <input type="radio" name={primaryGroup} checked={c.isPrimary} onChange={() => setPrimary(i)} />
                Primary contact
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(i)}>Remove</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

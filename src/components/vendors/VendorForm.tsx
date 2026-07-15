"use client";

import React from "react";
import { Input, Checkbox, Textarea, Button } from "@/components/ui";
import { PAYMENT_TERMS_SUGGESTIONS, isLikelyEmail, type VendorRow, type VendorInput } from "@/lib/vendors/vendors-shared";

// Plan 069: the shared vendor field block used by the inline "+ create new vendor" modal AND the /setup/vendors
// page (add/edit). Controlled: the parent owns a VendorFormValue and gets patches via onChange. Core fields
// (name, phone, email) are required IN THE UI (submit gate); everything else is optional. Contacts are a
// repeatable list with at most one primary (radio-style).

const controlStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};
const fieldLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" };
const col = { display: "flex", flexDirection: "column", gap: 6 } as const;

export type VendorContactFormValue = {
  id: string | null;
  name: string;
  role: string;
  phone: string;
  mobile: string;
  email: string;
  isPrimary: boolean;
};

export type VendorFormValue = {
  name: string;
  phone: string;
  email: string;
  contactName: string;
  accountNumber: string;
  poRequired: boolean;
  terms: string;
  url: string;
  notes: string;
  contacts: VendorContactFormValue[];
};

export const emptyVendorForm: VendorFormValue = {
  name: "", phone: "", email: "", contactName: "", accountNumber: "",
  poRequired: false, terms: "", url: "", notes: "", contacts: [],
};

const emptyContact = (): VendorContactFormValue => ({ id: null, name: "", role: "", phone: "", mobile: "", email: "", isPrimary: false });

/** Seed the form from an existing vendor (edit mode). */
export function vendorToForm(v: VendorRow): VendorFormValue {
  return {
    name: v.name,
    phone: v.phone ?? "",
    email: v.email ?? "",
    contactName: v.contactName ?? "",
    accountNumber: v.accountNumber ?? "",
    poRequired: v.poRequired,
    terms: v.terms ?? "",
    url: v.url ?? "",
    notes: v.notes ?? "",
    contacts: v.contacts.map((c) => ({
      id: c.id, name: c.name, role: c.role ?? "", phone: c.phone ?? "", mobile: c.mobile ?? "", email: c.email ?? "", isPrimary: c.isPrimary,
    })),
  };
}

/** Map the form to the server action payload. */
export function vendorFormToInput(v: VendorFormValue): VendorInput {
  return {
    name: v.name.trim(),
    phone: v.phone.trim() || undefined,
    email: v.email.trim() || undefined,
    contactName: v.contactName.trim() || undefined,
    accountNumber: v.accountNumber.trim() || undefined,
    poRequired: v.poRequired,
    terms: v.terms.trim() || undefined,
    url: v.url.trim() || undefined,
    notes: v.notes.trim() || undefined,
    contacts: v.contacts
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
 * UI submit gate. On CREATE (`requireContact` default true) name + phone + email are required (email valid).
 * On EDIT of an existing vendor, pass `requireContact: false` — legacy/seeded ("Unknown") and A/P-created
 * vendors have no phone/email (the DB only requires a name), so an edit must not be blocked from completing
 * or fixing them. Contact-row emails, when present, must always look valid.
 */
export function vendorFormValid(v: VendorFormValue, opts?: { requireContact?: boolean }): boolean {
  const requireContact = opts?.requireContact ?? true;
  const emailsOk = (!v.email.trim() || isLikelyEmail(v.email)) && v.contacts.every((c) => !c.email.trim() || isLikelyEmail(c.email));
  if (!v.name.trim() || !emailsOk) return false;
  if (requireContact) return v.phone.trim().length > 0 && v.email.trim().length > 0;
  return true;
}

export function VendorForm({
  value,
  onChange,
}: {
  value: VendorFormValue;
  onChange: (patch: Partial<VendorFormValue>) => void;
}) {
  const termsListId = React.useId();
  const primaryGroup = React.useId(); // scope the primary-contact radio group per form instance
  const emailInvalid = value.email.trim().length > 0 && !isLikelyEmail(value.email);

  const setContact = (i: number, patch: Partial<VendorContactFormValue>) =>
    onChange({ contacts: value.contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const setPrimary = (i: number) =>
    onChange({ contacts: value.contacts.map((c, idx) => ({ ...c, isPrimary: idx === i })) });
  const addContact = () => onChange({ contacts: [...value.contacts, emptyContact()] });
  const removeContact = (i: number) => onChange({ contacts: value.contacts.filter((_, idx) => idx !== i) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Core (required) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input label="Vendor name" value={value.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Scott Labs" style={{ flex: "1 1 220px" }} autoFocus />
        <Input label="Phone" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="e.g. (707) 555-0134" style={{ flex: "1 1 160px" }} />
        <Input label="Email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="e.g. orders@scottlab.com" style={{ flex: "1 1 200px" }} />
      </div>
      {emailInvalid ? <p style={{ color: "var(--danger)", fontSize: 12.5, margin: 0 }}>That email address doesn&apos;t look right.</p> : null}

      {/* Account / terms */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input label="Primary contact name (optional)" value={value.contactName} onChange={(e) => onChange({ contactName: e.target.value })} placeholder="e.g. Jordan Rivera" style={{ flex: "1 1 200px" }} />
        <Input label="Account # (optional)" value={value.accountNumber} onChange={(e) => onChange({ accountNumber: e.target.value })} placeholder="our account with them" style={{ flex: "1 1 160px" }} />
        <label style={{ ...col, flex: "1 1 160px" }}>
          <span style={fieldLabelStyle}>Payment terms (optional)</span>
          <input value={value.terms} onChange={(e) => onChange({ terms: e.target.value })} list={termsListId} placeholder="e.g. Net 30" style={controlStyle} />
          <datalist id={termsListId}>{PAYMENT_TERMS_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Input label="Website / URL (optional)" value={value.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" style={{ flex: "1 1 240px" }} />
        <div style={{ flex: "0 1 200px", paddingTop: 18 }}>
          <Checkbox checked={value.poRequired} onChange={(c) => onChange({ poRequired: c })} label="Purchase order required" />
        </div>
      </div>
      <Textarea label="Notes (optional)" value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Anything worth remembering about this vendor" minRows={2} />

      {/* Contacts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...fieldLabelStyle, fontSize: 14 }}>Additional contacts</span>
          <Button type="button" variant="ghost" size="sm" onClick={addContact}>＋ Add contact</Button>
        </div>
        {value.contacts.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>Add sales reps, AP contacts, or a backup — each with their own phone and email.</p>
        ) : null}
        {value.contacts.map((c, i) => (
          <div key={i} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Input label="Name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} placeholder="Contact name" style={{ flex: "1 1 160px" }} />
              <Input label="Role (optional)" value={c.role} onChange={(e) => setContact(i, { role: e.target.value })} placeholder="e.g. Sales rep" style={{ flex: "1 1 140px" }} />
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

// Structured US-style address parts for the TTB filer identity, shared by the Settings and
// Compliance profile forms. The five parts are the source of truth; `composeAddress` builds the
// single-line string that heads Form 5120.17 (stored as `operatedByAddress`).

export type AddressParts = {
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
};

export const EMPTY_ADDRESS: AddressParts = { street1: "", street2: "", city: "", state: "", zip: "" };

/** "123 Main St, Suite 4, Springfield, IL 62704" — omits blank parts; state+zip join with a space. */
export function composeAddress(a: AddressParts): string {
  const stateZip = [a.state.trim(), a.zip.trim()].filter(Boolean).join(" ");
  return [a.street1, a.street2, a.city, stateZip]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

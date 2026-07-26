// The field-note payload parse error, in its own module.
//
// It used to live in types.ts. S4 moved it here for one reason: the S4 observation vocabulary
// lives in src/lib/phenology/observation-types.ts (to keep S4's diff inside the S3a-contended
// types.ts down to a handful of additive lines), and those parsers throw this error while
// types.ts imports those parsers. Both directions are RUNTIME, so leaving the class in types.ts
// would have made a genuine import cycle. A leaf module with no imports of its own cannot.
//
// types.ts re-exports it, so every existing `import { FieldNoteParseError } from
// "@/lib/fieldnotes/types"` keeps working unchanged.

/** Thrown by every field-note payload validator. Fails loud on write AND on read — never silent. */
export class FieldNoteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldNoteParseError";
  }
}

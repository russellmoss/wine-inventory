export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "MUST_CHANGE_PASSWORD"
  | "VALIDATION"
  | "CONFLICT"
  // An error we did NOT expect — a real bug. Never carries the underlying message to the client (that
  // would leak internals); the detail goes to Sentry instead. See `settleWithCapture`.
  | "UNEXPECTED";

export class ActionError extends Error {
  constructor(
    message: string,
    public code: ActionErrorCode = "VALIDATION",
  ) {
    super(message);
    this.name = "ActionError";
  }
}

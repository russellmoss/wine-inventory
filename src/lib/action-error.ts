export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "MUST_CHANGE_PASSWORD"
  | "VALIDATION"
  | "CONFLICT";

export class ActionError extends Error {
  constructor(
    message: string,
    public code: ActionErrorCode = "VALIDATION",
  ) {
    super(message);
    this.name = "ActionError";
  }
}

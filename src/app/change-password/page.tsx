import { requireSession } from "@/lib/dal";
import { ChangePasswordForm } from "./ChangePasswordForm";

// Server gate: a session is required and banned users are bounced to /login.
// mustChangePassword users ARE allowed here (that's the point).
export default async function ChangePasswordPage() {
  await requireSession();
  return <ChangePasswordForm />;
}

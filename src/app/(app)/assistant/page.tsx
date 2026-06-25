import { requireReadyUser } from "@/lib/dal";
import { AssistantChat } from "./AssistantChat";

export const metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const user = await requireReadyUser();
  return <AssistantChat userLabel={user.name ?? user.email} />;
}

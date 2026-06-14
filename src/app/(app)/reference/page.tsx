import { prisma } from "@/lib/prisma";
import { ReferenceClient } from "./ReferenceClient";

export default async function ReferencePage() {
  const [varieties, vineyards] = await Promise.all([
    prisma.variety.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    prisma.vineyard.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
  ]);
  return <ReferenceClient varieties={varieties} vineyards={vineyards} />;
}

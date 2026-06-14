import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, Eyebrow, Badge, ExportCsvButton } from "@/components/ui";
import type { Prisma } from "@prisma/client";

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entityType?: string; actor?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const entityType = (sp.entityType ?? "").trim();
  const actor = (sp.actor ?? "").trim();

  const where: Prisma.AuditLogWhereInput = {};
  if (entityType) where.entityType = entityType;
  if (actor) where.actorEmail = { contains: actor, mode: "insensitive" };

  const [entries, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);

  return (
    <div>
      <Eyebrow rule>Admin</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Audit log</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Every inventory and account change, with who did it and when. Most recent first (latest 200).
      </p>

      <form method="get" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select name="entityType" defaultValue={entityType} style={inputStyle}>
          <option value="">All types</option>
          {entityTypes.map((e) => <option key={e.entityType} value={e.entityType}>{e.entityType}</option>)}
        </select>
        <input name="actor" defaultValue={actor} placeholder="Filter by actor email" style={{ ...inputStyle, minWidth: 220 }} />
        <button type="submit" style={{ ...inputStyle, cursor: "pointer", background: "var(--accent)", color: "var(--accent-on)", border: "none", padding: "0 18px" }}>
          Filter
        </button>
        <ExportCsvButton
          filename="audit-log.csv"
          columns={[{ key: "when", label: "When" }, { key: "actor", label: "Actor" }, { key: "type", label: "Type" }, { key: "action", label: "Action" }, { key: "summary", label: "What changed" }]}
          rows={entries.map((e) => ({ when: e.createdAt.toISOString().slice(0, 19).replace("T", " "), actor: e.actorEmail, type: e.entityType, action: e.action, summary: e.summary }))}
        />
      </form>

      <Card padding="0">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ padding: "10px 14px", fontWeight: 500 }}>When</th>
              <th style={{ padding: "10px 14px", fontWeight: 500 }}>Actor</th>
              <th style={{ padding: "10px 14px", fontWeight: 500 }}>Type</th>
              <th style={{ padding: "10px 14px", fontWeight: 500 }}>What changed</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: "20px 14px", color: "var(--text-muted)" }}>No matching entries.</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                    {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td style={{ padding: "10px 14px" }}>{e.actorEmail}</td>
                  <td style={{ padding: "10px 14px" }}><Badge tone="neutral" variant="soft">{e.entityType}</Badge></td>
                  <td style={{ padding: "10px 14px" }}>{e.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

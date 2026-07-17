import { prisma } from "./db";

type AuditInput = {
  clubId: string;
  actorType: "owner" | "admin";
  action: string;
  actorUserId?: string | null;
  meta?: Record<string, unknown>;
};

export async function logClubAudit(input: AuditInput) {
  await prisma.clubAuditEvent.create({
    data: {
      clubId: input.clubId,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      meta: input.meta ? JSON.stringify(input.meta) : null,
    },
  });
}

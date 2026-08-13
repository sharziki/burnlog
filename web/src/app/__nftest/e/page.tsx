import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function E() {
  const u = await prisma.user.findFirst({ where: { username: "no-such-user-xyz" }, select: { id: true } });
  if (!u) notFound();
  return <div>found</div>;
}

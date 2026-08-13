import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const u = await prisma.user.findFirst({ where: { username: "no-such-user-xyz" }, select: { id: true } });
  if (!u) return { title: "User not found" };
  return { title: "found" };
}
export default async function G() {
  const u = await prisma.user.findFirst({ where: { username: "no-such-user-xyz" }, select: { id: true } });
  if (!u) notFound();
  return <div>found</div>;
}

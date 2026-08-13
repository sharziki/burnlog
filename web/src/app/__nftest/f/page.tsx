import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function F() {
  await new Promise((r) => setTimeout(r, 120));
  notFound();
}

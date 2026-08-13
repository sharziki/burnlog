import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function D({ params }: { params: Promise<{ x: string }> }) { await params; notFound(); }

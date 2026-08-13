import type { Metadata } from "next";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { return { title: "not found" }; }
export default async function C() { notFound(); }

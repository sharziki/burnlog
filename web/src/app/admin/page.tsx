import type { Metadata } from "next";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "admin",
  description: "burnlog operator console for leads, plans, and account risk.",
};

export default function AdminPage() {
  return <AdminClient />;
}

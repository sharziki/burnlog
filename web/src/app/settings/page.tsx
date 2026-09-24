import { redirect } from "next/navigation";

/** Old bookmarks lead to the single personal profile. */
export default function SettingsPage() {
  redirect("/me?account=1");
}

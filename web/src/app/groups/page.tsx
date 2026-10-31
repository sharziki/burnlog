import type { Metadata } from "next";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { getClubUsageBatch } from "@/lib/clubUsage";
import { formatTokens } from "@/lib/format";
import { CreateGroup, GroupMembership } from "./GroupActions";

export const metadata: Metadata = { title: "Groups", description: "Find your people on Burnlog. Join a public AI coding leaderboard or start a group for your community.", alternates: { canonical: "/groups" } };

export default async function GroupsPage() {
  const [session, groups] = await Promise.all([
    auth(),
    prisma.club.findMany({ where: { isPrivate: false }, select: { id: true, name: true, slug: true, description: true, ownerId: true, memberships: { select: { userId: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const usage = await getClubUsageBatch(groups.map((group) => ({ id: group.id, memberIds: group.memberships.map((member) => member.userId) })));
  const sorted = [...groups].sort((a, b) => b.memberships.length - a.memberships.length || (usage.get(b.id)?.totalTokens ?? 0) - (usage.get(a.id)?.totalTokens ?? 0));
  return <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
    <p className="m-0 font-mono text-[12px] uppercase tracking-widest text-accent">Community boards</p>
    <h1 className="mb-3 mt-3 font-display text-[clamp(2.5rem,5vw,4rem)] leading-none text-ink">Find your people.</h1>
    <p className="mb-10 max-w-xl text-[15px] leading-relaxed text-soft">Join a public group to appear on its board and show it on your profile. Groups are self-selected, not verified affiliations.</p>
    <section className="border-y border-line py-7"><h2 className="mb-3 mt-0 text-[18px] text-ink">Start a group</h2><p className="mb-5 mt-0 text-[13px] text-soft">For a school, team, tool community, or friends. Anyone can join and share its board.</p>{userId ? <CreateGroup /> : <form action={async () => { "use server"; await signIn("github", { redirectTo: "/groups" }); }}><button className="cursor-pointer border-0 bg-accent px-4 py-2 text-[13px] font-medium text-bg">Log in with GitHub to create</button></form>}</section>
    <section className="pt-9"><div className="mb-5 flex items-baseline justify-between gap-3"><h2 className="m-0 text-[19px] text-ink">Public groups</h2><span className="font-mono text-[12px] text-dim">{sorted.length} {sorted.length === 1 ? "group" : "groups"}</span></div>
      {sorted.length === 0 && <p className="text-[14px] text-soft">No groups yet. Start the first one.</p>}
      <div className="grid gap-3">{sorted.map((group) => <article key={group.id} className="grid gap-4 border border-line p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><a className="text-[20px] font-medium text-ink no-underline hover:text-accent" href={`/g/${group.slug}`}>{group.name} ↗</a>{group.description && <p className="mb-0 mt-2 text-[13px] leading-relaxed text-soft">{group.description}</p>}<p className="mb-0 mt-3 font-mono text-[12px] text-dim">{group.memberships.length} members · {formatTokens(usage.get(group.id)?.totalTokens ?? 0)} tokens</p></div>{userId && <GroupMembership id={group.id} joined={group.memberships.some((member) => member.userId === userId)} owner={group.ownerId === userId} />}</article>)}</div>
    </section>
  </main>;
}

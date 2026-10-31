import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { getClubUsage } from "@/lib/clubUsage";
import { formatTokens } from "@/lib/format";
import { GroupMembership } from "@/app/groups/GroupActions";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const group = await prisma.club.findUnique({ where: { slug }, select: { name: true, description: true, isPrivate: true } });
  if (!group || group.isPrivate) return { title: "Group not found" };
  return { title: `${group.name} group`, description: group.description || `See the ${group.name} AI coding leaderboard on Burnlog.`, alternates: { canonical: `/g/${slug}` } };
}
export default async function GroupPage({ params }: Props) {
  const { slug } = await params;
  const [group, session] = await Promise.all([
    prisma.club.findUnique({ where: { slug }, select: { id: true, name: true, description: true, isPrivate: true, ownerId: true, memberships: { select: { userId: true, user: { select: { username: true, name: true, image: true } } } } } }),
    auth(),
  ]);
  if (!group || group.isPrivate) notFound();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const usage = await getClubUsage(group.id, group.memberships.map((member) => member.userId));
  const members = group.memberships.map((member) => ({ ...member.user, id: member.userId, tokens: usage.memberTotalMap.get(member.userId) ?? 0, weekly: usage.memberWeeklyMap.get(member.userId) ?? 0 })).sort((a, b) => b.tokens - a.tokens);
  return <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
    <a href="/groups" className="text-[13px] text-dim no-underline hover:text-ink">← All groups</a>
    <div className="mt-8 border-b border-line pb-8"><p className="m-0 font-mono text-[12px] uppercase tracking-widest text-accent">Public group · self-selected membership</p><h1 className="mb-3 mt-3 break-words font-display text-[clamp(2.6rem,6vw,5rem)] leading-none text-ink">{group.name}</h1>{group.description && <p className="max-w-2xl text-[15px] leading-relaxed text-soft">{group.description}</p>}<div className="mt-6 flex flex-wrap items-center gap-5"><span className="font-mono text-[13px] text-soft">{members.length} members · {formatTokens(usage.totalTokens)} tokens</span>{userId ? <GroupMembership id={group.id} joined={group.memberships.some((member) => member.userId === userId)} owner={group.ownerId === userId} /> : <form action={async () => { "use server"; await signIn("github", { redirectTo: `/g/${slug}` }); }}><button className="cursor-pointer border-0 bg-accent px-4 py-2 text-[13px] font-medium text-bg">Log in to join</button></form>}<a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join ${group.name} on Burnlog`)}&url=${encodeURIComponent(`https://burnlog.net/g/${slug}`)}`} target="_blank" rel="noopener noreferrer" className="text-[13px] text-soft underline underline-offset-4">Share board ↗</a></div></div>
    <section className="pt-9"><div className="mb-4 grid grid-cols-[35px_minmax(0,1fr)_auto] gap-3 border-b border-line pb-3 font-mono text-[11px] uppercase tracking-wide text-dim"><span>#</span><span>Member</span><span>Tokens</span></div>{members.map((member, index) => <a key={member.id} href={member.username ? `/u/${member.username}` : "#"} className="grid grid-cols-[35px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-4 text-ink no-underline hover:text-accent"><span className="font-mono text-[13px] text-dim">{index + 1}</span><span className="truncate text-[15px]">{member.name || member.username || "Member"}{member.username && <span className="ml-2 font-mono text-[12px] text-dim">@{member.username}</span>}</span><span className="font-mono text-[14px] tabular-nums">{formatTokens(member.tokens)}</span></a>)}{members.length === 0 && <p className="text-[14px] text-soft">No members yet.</p>}</section>
  </main>;
}

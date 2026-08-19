import { read, num } from './db';
import { GANGS_ON_NODE, GANG_STATE, PREEMPTION_TARGETS, QUEUE_PATHS } from './queries';
import type { BrokenGang, DrainResult, EvictedPod, EvictionReason, QueueImpact } from './types';

export type Reader = typeof read;

type Member = {
  pod: string;
  namespace: string;
  node: string;
  gpus: number;
  pinnedTo: string | null;
};

type GangState = {
  gang: string;
  minMember: number;
  priority: number;
  queue: string;
  team: string;
  members: Member[];
};

async function loadGangs(run: Reader, names: string[], cache: Map<string, GangState>) {
  const missing = names.filter((name) => !cache.has(name));
  if (missing.length === 0) return;

  const rows = await run<GangState>(GANG_STATE, { gangs: missing }, (row) => ({
    gang: String(row.gang),
    minMember: num(row.minMember),
    priority: num(row.priority),
    queue: String(row.queue),
    team: String(row.team),
    members: (row.members as any[]).map((m) => ({
      pod: String(m.pod),
      namespace: String(m.namespace),
      node: String(m.node),
      gpus: num(m.gpus),
      pinnedTo: m.pinnedTo == null ? null : String(m.pinnedTo),
    })),
  }));

  for (const gang of rows) cache.set(gang.gang, gang);
}

export async function simulateDrain(node: string, run: Reader = read): Promise<DrainResult> {
  const cache = new Map<string, GangState>();
  const evicted = new Map<string, EvictedPod>();
  const broken = new Map<string, BrokenGang>();

  const evict = (member: Member, gang: GangState, reason: EvictionReason, round: number) => {
    if (evicted.has(member.pod)) return;
    evicted.set(member.pod, {
      pod: member.pod,
      namespace: member.namespace,
      gang: gang.gang,
      node: member.node,
      gpus: member.gpus,
      reason,
      round,
      reschedulable: member.pinnedTo !== node,
      pinnedTo: member.pinnedTo,
    });
  };

  const seeds = await run(GANGS_ON_NODE, { node }, (row) => String(row.gang));
  await loadGangs(run, seeds, cache);

  let round = 1;
  for (const name of seeds) {
    const gang = cache.get(name);
    if (!gang) continue;
    for (const member of gang.members) {
      if (member.node === node) evict(member, gang, 'drained', round);
    }
  }
  const directPods = evicted.size;

  let frontier = new Set(seeds);
  while (frontier.size > 0) {
    const brokeThisRound: string[] = [];

    for (const name of frontier) {
      const gang = cache.get(name);
      if (!gang || broken.has(name)) continue;

      const survivors = gang.members.filter((m) => !evicted.has(m.pod)).length;
      if (survivors >= gang.minMember) continue;

      broken.set(name, {
        gang: gang.gang,
        minMember: gang.minMember,
        size: gang.members.length,
        survivors,
        priority: gang.priority,
        queue: gang.queue,
        team: gang.team,
        round,
      });
      brokeThisRound.push(name);
      for (const member of gang.members) evict(member, gang, 'quorum', round);
    }

    if (brokeThisRound.length === 0) break;

    const targets = await run(PREEMPTION_TARGETS, { gangs: brokeThisRound }, (row) => String(row.gang));
    const fresh = [...new Set(targets)].filter((name) => !broken.has(name));
    if (fresh.length === 0) break;

    await loadGangs(run, fresh, cache);
    round += 1;

    const next = new Set<string>();
    for (const name of fresh) {
      const gang = cache.get(name);
      if (!gang) continue;
      for (const member of gang.members) evict(member, gang, 'preempted', round);
      next.add(name);
    }
    frontier = next;
  }

  const brokenGangs = [...broken.values()].sort((a, b) => a.round - b.round || a.gang.localeCompare(b.gang));
  const evictedPods = [...evicted.values()].sort((a, b) => a.round - b.round || a.pod.localeCompare(b.pod));

  const queueNames = [...new Set(brokenGangs.map((g) => g.queue))];
  const paths = queueNames.length
    ? await run(QUEUE_PATHS, { queues: queueNames }, (row) => ({
        queue: String(row.queue),
        team: String(row.team),
        contact: String(row.contact),
        path: (row.path as unknown[]).map(String),
      }))
    : [];

  const gangQueue = new Map(brokenGangs.map((g) => [g.gang, g.queue]));
  const queues: QueueImpact[] = paths.map((entry) => {
    const gangsLost = brokenGangs.filter((g) => g.queue === entry.queue).length;
    const gpusReleased = evictedPods
      .filter((p) => gangQueue.get(p.gang) === entry.queue)
      .reduce((total, p) => total + p.gpus, 0);
    return { ...entry, gangsLost, gpusReleased };
  });
  queues.sort((a, b) => b.gpusReleased - a.gpusReleased);

  return {
    node,
    rounds: round,
    evicted: evictedPods,
    broken: brokenGangs,
    queues,
    stranded: evictedPods.filter((p) => !p.reschedulable),
    gpusFreed: evictedPods.reduce((total, p) => total + p.gpus, 0),
    directPods,
  };
}

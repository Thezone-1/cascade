export type EvictionReason = 'drained' | 'quorum' | 'preempted';

export type EvictedPod = {
  pod: string;
  namespace: string;
  gang: string;
  node: string;
  gpus: number;
  reason: EvictionReason;
  round: number;
  reschedulable: boolean;
  pinnedTo: string | null;
};

export type BrokenGang = {
  gang: string;
  minMember: number;
  size: number;
  survivors: number;
  priority: number;
  queue: string;
  team: string;
  round: number;
};

export type QueueImpact = {
  queue: string;
  path: string[];
  team: string;
  contact: string;
  gangsLost: number;
  gpusReleased: number;
};

export type DrainResult = {
  node: string;
  rounds: number;
  evicted: EvictedPod[];
  broken: BrokenGang[];
  queues: QueueImpact[];
  stranded: EvictedPod[];
  gpusFreed: number;
  directPods: number;
};

export type ClusterNode = {
  name: string;
  zone: string;
  status: string;
  gpus: number;
  gpusInUse: number;
  pods: number;
  gangs: number;
};

export type NodeDetail = {
  name: string;
  zone: string;
  status: string;
  gpuModel: string;
  gpus: number;
  gpusInUse: number;
  pinnedVolumes: number;
};

export type OwnershipRow = {
  pod: string;
  gpu: string;
  gang: string;
  queue: string;
  team: string;
  contact: string;
  priority: number;
};

export type QuotaRow = {
  queue: string;
  depth: number;
  path: string[];
  ownQuota: number;
  subtreeQuota: number;
  team: string;
};

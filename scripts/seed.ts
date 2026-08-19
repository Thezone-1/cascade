import { config } from 'dotenv';
import neo4j, { Driver } from 'neo4j-driver';

config({ path: '.env.local' });

const SEED = 20260819;
const NODE_COUNT = 80;
const GPUS_PER_NODE = 8;
const GPU_BUDGET = 560;
const MAX_GANGS = 220;

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(SEED);
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
const between = (low: number, high: number) => low + Math.floor(rand() * (high - low + 1));

const TEAMS = [
  { name: 'perception', contact: '#ml-perception' },
  { name: 'speech', contact: '#ml-speech' },
  { name: 'foundation', contact: '#ml-foundation' },
  { name: 'robotics', contact: '#ml-robotics' },
  { name: 'platform', contact: '#cluster-oncall' },
];

const QUEUES = [
  { name: 'root-research', parent: null, quota: 60, tier: 'guaranteed', team: 'platform' },
  { name: 'root-product', parent: null, quota: 40, tier: 'guaranteed', team: 'platform' },
  { name: 'root-batch', parent: null, quota: 20, tier: 'besteffort', team: 'platform' },
  { name: 'research-vision', parent: 'root-research', quota: 120, tier: 'guaranteed', team: 'perception' },
  { name: 'research-llm', parent: 'root-research', quota: 160, tier: 'guaranteed', team: 'foundation' },
  { name: 'research-audio', parent: 'root-research', quota: 80, tier: 'burstable', team: 'speech' },
  { name: 'product-serving', parent: 'root-product', quota: 90, tier: 'guaranteed', team: 'robotics' },
  { name: 'product-eval', parent: 'root-product', quota: 45, tier: 'burstable', team: 'robotics' },
  { name: 'batch-sweeps', parent: 'root-batch', quota: 70, tier: 'besteffort', team: 'perception' },
];

const CONSTRAINTS = [
  'CREATE CONSTRAINT node_key IF NOT EXISTS FOR (x:Node) REQUIRE x.name IS UNIQUE',
  'CREATE CONSTRAINT gpu_key IF NOT EXISTS FOR (x:GPU) REQUIRE x.id IS UNIQUE',
  'CREATE CONSTRAINT pod_key IF NOT EXISTS FOR (x:Pod) REQUIRE x.name IS UNIQUE',
  'CREATE CONSTRAINT gang_key IF NOT EXISTS FOR (x:Gang) REQUIRE x.name IS UNIQUE',
  'CREATE CONSTRAINT queue_key IF NOT EXISTS FOR (x:Queue) REQUIRE x.name IS UNIQUE',
  'CREATE CONSTRAINT team_key IF NOT EXISTS FOR (x:Team) REQUIRE x.name IS UNIQUE',
  'CREATE CONSTRAINT pvc_key IF NOT EXISTS FOR (x:PVC) REQUIRE x.name IS UNIQUE',
];

const LEAF_QUEUES = QUEUES.filter((q) => q.parent !== null).map((q) => q.name);
const ZONES = ['ap-south-1a', 'ap-south-1b', 'ap-south-1c'];
const GPU_MODELS = ['H100-80GB', 'A100-40GB'];
const JOB_KINDS = ['pretrain', 'finetune', 'eval', 'serve', 'sweep'];

type ClusterNode = { name: string; zone: string; status: string; model: string };
type Gpu = { id: string; node: string; model: string; index: number; allocated: boolean };
type Pod = { name: string; namespace: string; node: string; gang: string; gpus: string[] };
type Gang = { name: string; minMember: number; size: number; priority: number; queue: string; kind: string };
type Pvc = { name: string; pod: string; node: string; zonal: boolean; storageClass: string };

function buildCluster() {
  const nodes: ClusterNode[] = [];
  const gpus: Gpu[] = [];
  const free = new Map<string, string[]>();

  for (let i = 0; i < NODE_COUNT; i += 1) {
    const name = `gpu-node-${String(i).padStart(3, '0')}`;
    const model = i < NODE_COUNT * 0.6 ? GPU_MODELS[0] : GPU_MODELS[1];
    nodes.push({ name, zone: ZONES[i % ZONES.length], status: 'Ready', model });
    const ids: string[] = [];
    for (let g = 0; g < GPUS_PER_NODE; g += 1) {
      const id = `${name}-gpu-${g}`;
      gpus.push({ id, node: name, model, index: g, allocated: false });
      ids.push(id);
    }
    free.set(name, ids);
  }

  const gpuById = new Map(gpus.map((g) => [g.id, g]));
  const gangs: Gang[] = [];
  const pods: Pod[] = [];
  const pvcs: Pvc[] = [];
  let allocated = 0;

  for (let i = 0; i < MAX_GANGS && allocated < GPU_BUDGET; i += 1) {
    const size = pick([1, 2, 2, 4, 4, 8, 8, 16]);
    const kind = size >= 8 ? pick(['pretrain', 'finetune']) : pick(JOB_KINDS);
    const elastic = size >= 4 && rand() < 0.25;
    const name = `gang-${String(i).padStart(3, '0')}-${kind}`;
    const queue = pick(LEAF_QUEUES);
    const priority = kind === 'serve' ? between(80, 100) : between(10, 70);

    const spread = Math.min(size, between(1, 4));
    const hosts: string[] = [];
    for (let s = 0; s < spread; s += 1) {
      const candidate = pick(nodes).name;
      if (!hosts.includes(candidate)) hosts.push(candidate);
    }

    const members: Pod[] = [];
    for (let m = 0; m < size; m += 1) {
      let host: string | undefined;
      for (let offset = 0; offset < hosts.length; offset += 1) {
        const candidate = hosts[(m + offset) % hosts.length];
        if (free.get(candidate)!.length > 0) {
          host = candidate;
          break;
        }
      }
      if (!host) break;

      const pool = free.get(host)!;
      const gpuId = pool.shift()!;
      gpuById.get(gpuId)!.allocated = true;
      allocated += 1;

      const podName = `${name}-worker-${m}`;
      members.push({
        name: podName,
        namespace: queue.split('-')[0],
        node: host,
        gang: name,
        gpus: [gpuId],
      });

      if (rand() < 0.22) {
        pvcs.push({
          name: `${podName}-scratch`,
          pod: podName,
          node: host,
          zonal: true,
          storageClass: 'local-nvme',
        });
      }
    }

    if (members.length === 0) continue;
    const minMember = elastic ? Math.ceil(members.length * 0.75) : members.length;
    gangs.push({ name, minMember, size: members.length, priority, queue, kind });
    pods.push(...members);
  }

  const preempts: { from: string; to: string }[] = [];
  for (const gang of gangs) {
    if (rand() > 0.35) continue;
    const victims = gangs.filter(
      (g) => g.queue === gang.queue && g.priority < gang.priority && g.name !== gang.name
    );
    if (victims.length === 0) continue;
    preempts.push({ from: gang.name, to: pick(victims).name });
  }

  return { nodes, gpus, gangs, pods, pvcs, preempts, allocated };
}

async function write(driver: Driver, cypher: string, rows: unknown[], chunk = 400) {
  const session = driver.session();
  try {
    for (let i = 0; i < rows.length; i += chunk) {
      const batch = rows.slice(i, i + chunk);
      await session.executeWrite((tx) => tx.run(cypher, { rows: batch }));
    }
  } finally {
    await session.close();
  }
}

function report(cluster: ReturnType<typeof buildCluster>) {
  console.log(`  nodes     ${cluster.nodes.length}`);
  console.log(`  gpus      ${cluster.gpus.length} (${cluster.allocated} allocated)`);
  console.log(`  gangs     ${cluster.gangs.length}`);
  console.log(`  pods      ${cluster.pods.length}`);
  console.log(`  pvcs      ${cluster.pvcs.length}`);
  console.log(`  preempts  ${cluster.preempts.length}`);
  console.log(`  queues    ${QUEUES.length}, teams ${TEAMS.length}`);
}

async function main() {
  const cluster = buildCluster();

  if (process.argv.includes('--dry')) {
    console.log('dry run, nothing written');
    report(cluster);
    return;
  }

  const uri = process.env.COGNODB_URI;
  const user = process.env.COGNODB_USER;
  const password = process.env.COGNODB_PASSWORD;
  if (!uri || !user || !password) {
    throw new Error('Set COGNODB_URI, COGNODB_USER and COGNODB_PASSWORD in .env.local first.');
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

  const session = driver.session();
  try {
    await session.executeWrite((tx) => tx.run('MATCH (n) DETACH DELETE n'));
    for (const constraint of CONSTRAINTS) {
      await session.executeWrite((tx) => tx.run(constraint));
    }
  } finally {
    await session.close();
  }

  await write(
    driver,
    `UNWIND $rows AS row
     MERGE (t:Team {name: row.name}) SET t.contact = row.contact`,
    TEAMS
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MERGE (q:Queue {name: row.name}) SET q.quota = row.quota, q.tier = row.tier
     WITH q, row
     MATCH (t:Team {name: row.team})
     MERGE (q)-[:OWNED_BY]->(t)`,
    QUEUES
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MATCH (child:Queue {name: row.name}), (parent:Queue {name: row.parent})
     MERGE (child)-[:CHILD_OF]->(parent)`,
    QUEUES.filter((q) => q.parent !== null)
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MERGE (n:Node {name: row.name}) SET n.zone = row.zone, n.status = row.status`,
    cluster.nodes
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MATCH (n:Node {name: row.node})
     MERGE (g:GPU {id: row.id})
       SET g.model = row.model, g.index = row.index, g.allocated = row.allocated
     MERGE (g)-[:ON]->(n)`,
    cluster.gpus
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MATCH (q:Queue {name: row.queue})
     MERGE (g:Gang {name: row.name})
       SET g.minMember = row.minMember, g.size = row.size,
           g.priority = row.priority, g.kind = row.kind
     MERGE (g)-[:SUBMITTED_TO]->(q)`,
    cluster.gangs
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MATCH (n:Node {name: row.node}), (gang:Gang {name: row.gang})
     MERGE (p:Pod {name: row.name}) SET p.namespace = row.namespace, p.phase = 'Running'
     MERGE (p)-[:SCHEDULED_ON]->(n)
     MERGE (p)-[:MEMBER_OF]->(gang)
     WITH p, row
     UNWIND row.gpus AS gpuId
     MATCH (gpu:GPU {id: gpuId})
     MERGE (p)-[:USES]->(gpu)`,
    cluster.pods
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MATCH (p:Pod {name: row.pod}), (n:Node {name: row.node})
     MERGE (v:PVC {name: row.name})
       SET v.zonal = row.zonal, v.storageClass = row.storageClass
     MERGE (p)-[:MOUNTS]->(v)
     MERGE (v)-[:BOUND_TO]->(n)`,
    cluster.pvcs
  );

  await write(
    driver,
    `UNWIND $rows AS row
     MATCH (a:Gang {name: row.from}), (b:Gang {name: row.to})
     MERGE (a)-[:PREEMPTS]->(b)`,
    cluster.preempts
  );

  await driver.close();

  console.log('seeded');
  report(cluster);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

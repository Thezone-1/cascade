import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const { read, num, getDriver } = await import('../lib/db');
  const q = await import('../lib/queries');
  const { simulateDrain } = await import('../lib/simulate');

  const rows = async (label: string, cypher: string, params: Record<string, unknown> = {}) => {
    const started = Date.now();
    const result = await read(cypher, params, (row) => row);
    console.log(`${label.padEnd(20)} ${String(result.length).padStart(4)} rows  ${Date.now() - started}ms`);
    return result;
  };

  const overview = await rows('cluster overview', q.CLUSTER_OVERVIEW);
  await rows('quota rollup', q.QUOTA_ROLLUP);

  const busiest = [...overview].sort((a: any, b: any) => num(b.gangs) - num(a.gangs))[0] as any;
  const node = String(busiest.name);
  console.log(`\nbusiest node ${node}: ${num(busiest.gangs)} gangs, ${num(busiest.pods)} pods\n`);

  await rows('node detail', q.NODE_DETAIL, { node });
  await rows('ownership', q.OWNERSHIP_ON_NODE, { node });
  const gangs = await rows('gangs on node', q.GANGS_ON_NODE, { node });

  const names = gangs.map((row: any) => String(row.gang));
  await rows('gang state', q.GANG_STATE, { gangs: names });
  await rows('preemption targets', q.PREEMPTION_TARGETS, { gangs: names });
  await rows('queue paths', q.QUEUE_PATHS, { queues: ['research-llm', 'batch-sweeps'] });

  console.log('\ncascades');
  const candidates = [...overview]
    .sort((a: any, b: any) => num(b.gangs) - num(a.gangs))
    .slice(0, 6)
    .map((row: any) => String(row.name));

  for (const candidate of candidates) {
    const started = Date.now();
    const result = await simulateDrain(candidate);
    console.log(
      `  ${candidate}  direct ${String(result.directPods).padStart(2)}  ` +
        `evicted ${String(result.evicted.length).padStart(3)}  ` +
        `gangs ${String(result.broken.length).padStart(2)}  ` +
        `rounds ${result.rounds}  stranded ${String(result.stranded.length).padStart(2)}  ` +
        `teams ${result.queues.length}  ${Date.now() - started}ms`
    );
  }

  await getDriver().close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

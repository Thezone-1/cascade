import Link from 'next/link';
import { read, num } from '@/lib/db';
import { CLUSTER_OVERVIEW, QUOTA_ROLLUP } from '@/lib/queries';
import type { ClusterNode, QuotaRow } from '@/lib/types';
import SetupNotice from './setup-notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function load() {
  const nodes = await read<ClusterNode>(CLUSTER_OVERVIEW, {}, (row) => ({
    name: String(row.name),
    zone: String(row.zone),
    status: String(row.status),
    gpus: num(row.gpus),
    gpusInUse: num(row.gpusInUse),
    pods: num(row.pods),
    gangs: num(row.gangs),
  }));

  const quotas = await read<QuotaRow>(QUOTA_ROLLUP, {}, (row) => ({
    queue: String(row.queue),
    depth: num(row.depth),
    path: (row.path as unknown[]).map(String),
    ownQuota: num(row.ownQuota),
    subtreeQuota: num(row.subtreeQuota),
    team: String(row.team),
  }));

  return { nodes, quotas };
}

export default async function Home() {
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (err) {
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }

  const { nodes, quotas } = data;
  const gpus = nodes.reduce((total, n) => total + n.gpus, 0);
  const inUse = nodes.reduce((total, n) => total + n.gpusInUse, 0);
  const pods = nodes.reduce((total, n) => total + n.pods, 0);
  const busiest = [...nodes].sort((a, b) => b.gangs - a.gangs)[0];

  return (
    <>
      <h1>Cluster</h1>
      <p className="lede">
        Pick the machine you are about to take offline. Cascade walks the graph and tells you which
        jobs die, which of them cannot come back, and who to tell.
      </p>

      <div className="statbar">
        <div className="stat">
          <div className="k">Nodes</div>
          <div className="v">{nodes.length}</div>
        </div>
        <div className="stat">
          <div className="k">GPUs</div>
          <div className="v">{gpus}</div>
        </div>
        <div className="stat">
          <div className="k">Allocated</div>
          <div className="v">{Math.round((inUse / gpus) * 100)}%</div>
        </div>
        <div className="stat">
          <div className="k">Pods</div>
          <div className="v">{pods}</div>
        </div>
        <div className="stat hot">
          <div className="k">Most shared node</div>
          <div className="v">{busiest ? `${busiest.gangs} gangs` : '0'}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Nodes</h2>
          <span className="note">gang count is how many jobs one drain can touch first</span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>node</th>
                <th>zone</th>
                <th>status</th>
                <th className="num">gpus</th>
                <th>allocation</th>
                <th className="num">pods</th>
                <th className="num">gangs</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.name}>
                  <td>
                    <Link href={`/node/${node.name}`}>{node.name}</Link>
                  </td>
                  <td>{node.zone}</td>
                  <td>{node.status}</td>
                  <td className="num">
                    {node.gpusInUse}/{node.gpus}
                  </td>
                  <td>
                    <span className="bar">
                      <i style={{ width: `${node.gpus ? (node.gpusInUse / node.gpus) * 100 : 0}%` }} />
                    </span>
                  </td>
                  <td className="num">{node.pods}</td>
                  <td className="num">{node.gangs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Queue quota rollup</h2>
          <span className="note">(:Queue)-[:CHILD_OF*0..]-&gt;(:Queue), depth is not fixed</span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>queue</th>
                <th className="num">depth</th>
                <th>ancestors</th>
                <th>owner</th>
                <th className="num">own quota</th>
                <th className="num">subtree quota</th>
              </tr>
            </thead>
            <tbody>
              {quotas.map((row) => (
                <tr key={row.queue}>
                  <td>{row.queue}</td>
                  <td className="num">{row.depth}</td>
                  <td>{row.path.length ? row.path.join(' / ') : 'root'}</td>
                  <td>{row.team}</td>
                  <td className="num">{row.ownQuota}</td>
                  <td className="num">{row.subtreeQuota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

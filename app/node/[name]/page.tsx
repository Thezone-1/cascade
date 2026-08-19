import Link from 'next/link';
import { notFound } from 'next/navigation';
import { read, num } from '@/lib/db';
import { NODE_DETAIL, OWNERSHIP_ON_NODE } from '@/lib/queries';
import type { NodeDetail, OwnershipRow } from '@/lib/types';
import SetupNotice from '../../setup-notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function load(node: string) {
  const detail = await read<NodeDetail>(NODE_DETAIL, { node }, (row) => ({
    name: String(row.name),
    zone: String(row.zone),
    status: String(row.status),
    gpuModel: String(row.gpuModel),
    gpus: num(row.gpus),
    gpusInUse: num(row.gpusInUse),
    pinnedVolumes: num(row.pinnedVolumes),
  }));

  const ownership = await read<OwnershipRow>(OWNERSHIP_ON_NODE, { node }, (row) => ({
    pod: String(row.pod),
    gpu: String(row.gpu),
    gang: String(row.gang),
    queue: String(row.queue),
    team: String(row.team),
    contact: String(row.contact),
    priority: num(row.priority),
  }));

  return { detail: detail[0], ownership };
}

export default async function NodePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(name);
  } catch (err) {
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }

  const { detail, ownership } = data;
  if (!detail) notFound();

  const teams = [...new Set(ownership.map((row) => row.team))];

  return (
    <>
      <div className="crumbs" style={{ marginBottom: 10 }}>
        <Link href="/">cluster</Link> / {detail.name}
      </div>

      <h1>{detail.name}</h1>
      <p className="lede">
        {detail.gpus} x {detail.gpuModel} in {detail.zone}. Everything below runs here right now.
      </p>

      <div className="statbar">
        <div className="stat">
          <div className="k">GPUs in use</div>
          <div className="v">
            {detail.gpusInUse}/{detail.gpus}
          </div>
        </div>
        <div className="stat">
          <div className="k">Pods</div>
          <div className="v">{ownership.length}</div>
        </div>
        <div className="stat">
          <div className="k">Teams</div>
          <div className="v">{teams.length}</div>
        </div>
        <div className="stat hot">
          <div className="k">Zonal volumes</div>
          <div className="v">{detail.pinnedVolumes}</div>
        </div>
      </div>

      <p style={{ marginBottom: 24 }}>
        <Link className="cta" href={`/drain/${detail.name}`}>
          Simulate drain
        </Link>
      </p>

      <div className="panel">
        <div className="panel-head">
          <h2>Who owns what runs here</h2>
          <span className="note">
            Node &lt;- GPU &lt;- Pod -&gt; Gang -&gt; Queue -&gt; Team, five hops, one query
          </span>
        </div>
        {ownership.length === 0 ? (
          <div className="empty">Nothing scheduled on this node.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>pod</th>
                  <th>gpu</th>
                  <th>gang</th>
                  <th>queue</th>
                  <th>team</th>
                  <th>contact</th>
                  <th className="num">priority</th>
                </tr>
              </thead>
              <tbody>
                {ownership.map((row) => (
                  <tr key={row.pod}>
                    <td>{row.pod}</td>
                    <td>{row.gpu}</td>
                    <td>{row.gang}</td>
                    <td>{row.queue}</td>
                    <td>{row.team}</td>
                    <td>{row.contact}</td>
                    <td className="num">{row.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

import Link from 'next/link';
import { simulateDrain } from '@/lib/simulate';
import type { DrainResult, EvictionReason } from '@/lib/types';
import SetupNotice from '../../setup-notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASON: Record<EvictionReason, string> = {
  drained: 'ran on the drained node',
  quorum: 'gang fell below minMember',
  preempted: 'preempted by a requeued gang',
};

function count(value: number, noun: string) {
  return `${value} ${value === 1 ? noun : `${noun}s`}`;
}

export default async function DrainPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  let result: DrainResult;
  try {
    result = await simulateDrain(name);
  } catch (err) {
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }

  const indirect = result.evicted.length - result.directPods;
  const byRound = Array.from({ length: result.rounds }, (_, i) => {
    const round = i + 1;
    return {
      round,
      pods: result.evicted.filter((p) => p.round === round),
      gangs: result.broken.filter((g) => g.round === round),
    };
  });

  return (
    <>
      <div className="crumbs" style={{ marginBottom: 10 }}>
        <Link href="/">cluster</Link> / <Link href={`/node/${name}`}>{name}</Link> / drain
      </div>

      <h1>Draining {name}</h1>
      <p className="lede">
        {count(result.directPods, 'pod')} actually live on this machine. Once the graph is walked,{' '}
        {count(result.evicted.length, 'pod')} stop running and {count(result.broken.length, 'job')} die
        outright. The damage settles after {count(result.rounds, 'round')}.
      </p>

      <div className="statbar">
        <div className="stat">
          <div className="k">Pods on the node</div>
          <div className="v">{result.directPods}</div>
        </div>
        <div className="stat hot">
          <div className="k">Pods killed elsewhere</div>
          <div className="v">{indirect}</div>
        </div>
        <div className="stat">
          <div className="k">Gangs broken</div>
          <div className="v">{result.broken.length}</div>
        </div>
        <div className="stat">
          <div className="k">GPUs released</div>
          <div className="v">{result.gpusFreed}</div>
        </div>
        <div className="stat hot">
          <div className="k">Cannot reschedule</div>
          <div className="v">{result.stranded.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>How it spread</h2>
          <span className="note">rounds run until a round breaks nothing new</span>
        </div>
        <div className="rounds">
          {byRound.map((entry) => (
            <div className="round" key={entry.round}>
              <div className="k">round {entry.round}</div>
              <div className="v">
                {count(entry.pods.length, 'pod')}, {count(entry.gangs.length, 'gang')}
              </div>
              <div className="why">
                {entry.round === 1
                  ? 'evicted off the drained machine, then quorum checked'
                  : 'requeued gangs took quota back and preempted lower priority work'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Jobs that died</h2>
          <span className="note">survivors below minMember means the whole gang goes</span>
        </div>
        {result.broken.length === 0 ? (
          <div className="empty">No gang lost quorum. This drain is safe.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">round</th>
                  <th>gang</th>
                  <th className="num">survivors</th>
                  <th className="num">minMember</th>
                  <th className="num">size</th>
                  <th>queue</th>
                  <th>team</th>
                  <th className="num">priority</th>
                </tr>
              </thead>
              <tbody>
                {result.broken.map((gang) => (
                  <tr key={gang.gang}>
                    <td className="num">{gang.round}</td>
                    <td>{gang.gang}</td>
                    <td className="num">{gang.survivors}</td>
                    <td className="num">{gang.minMember}</td>
                    <td className="num">{gang.size}</td>
                    <td>{gang.queue}</td>
                    <td>{gang.team}</td>
                    <td className="num">{gang.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Stuck until the drain is cancelled</h2>
          <span className="note">zonal volume bound to this machine, nowhere else to go</span>
        </div>
        {result.stranded.length === 0 ? (
          <div className="empty">Every evicted pod can restart somewhere else.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>pod</th>
                  <th>gang</th>
                  <th>volume pinned to</th>
                </tr>
              </thead>
              <tbody>
                {result.stranded.map((pod) => (
                  <tr key={pod.pod}>
                    <td>{pod.pod}</td>
                    <td>{pod.gang}</td>
                    <td>{pod.pinnedTo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Who to tell</h2>
          <span className="note">queue path walked up the hierarchy to the owning team</span>
        </div>
        {result.queues.length === 0 ? (
          <div className="empty">Nobody to page.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>queue</th>
                  <th>path to root</th>
                  <th>team</th>
                  <th>contact</th>
                  <th className="num">jobs lost</th>
                  <th className="num">gpus</th>
                </tr>
              </thead>
              <tbody>
                {result.queues.map((entry) => (
                  <tr key={entry.queue}>
                    <td>{entry.queue}</td>
                    <td>{entry.path.join(' / ')}</td>
                    <td>{entry.team}</td>
                    <td>{entry.contact}</td>
                    <td className="num">{entry.gangsLost}</td>
                    <td className="num">{entry.gpusReleased}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Every pod that stops</h2>
          <span className="note">{result.evicted.length} total</span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th className="num">round</th>
                <th>pod</th>
                <th>node</th>
                <th>gang</th>
                <th>why</th>
                <th>restarts</th>
              </tr>
            </thead>
            <tbody>
              {result.evicted.map((pod) => (
                <tr key={pod.pod}>
                  <td className="num">{pod.round}</td>
                  <td>{pod.pod}</td>
                  <td>{pod.node}</td>
                  <td>{pod.gang}</td>
                  <td>{REASON[pod.reason]}</td>
                  <td>
                    {pod.reschedulable ? (
                      <span className="chip">elsewhere</span>
                    ) : (
                      <span className="chip hot">nowhere</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

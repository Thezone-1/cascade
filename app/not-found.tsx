import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>No such machine</h2>
      </div>
      <div className="empty">
        That node is not in the cluster graph. <Link href="/">Back to the node list</Link>.
      </div>
    </div>
  );
}

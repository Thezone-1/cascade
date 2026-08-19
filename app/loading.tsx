export default function Loading() {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Reading the graph</h2>
        <span className="note">walking relationships on CognoDB</span>
      </div>
      <div className="skeleton">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
    </div>
  );
}

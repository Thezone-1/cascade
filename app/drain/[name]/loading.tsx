export default function Loading() {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Simulating the drain</h2>
        <span className="note">tracing the cascade on CognoDB</span>
      </div>
      <div className="skeleton">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
    </div>
  );
}

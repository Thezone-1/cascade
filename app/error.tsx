'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="warn">
      <h2>Something went wrong</h2>
      <p style={{ marginTop: 6 }}>
        The page could not be built from the graph. If this keeps happening, check{' '}
        <code>/api/health</code> to see whether CognoDB is answering at all.
      </p>
      <p style={{ marginTop: 8 }}>
        <code>{error.message}</code>
      </p>
      <p style={{ marginTop: 12 }}>
        <button className="cta" onClick={reset}>
          Try again
        </button>
      </p>
    </div>
  );
}

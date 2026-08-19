export default function SetupNotice({ detail }: { detail: string }) {
  return (
    <div className="warn">
      <h2>CognoDB is not answering</h2>
      <p style={{ marginTop: 6 }}>
        Copy <code>.env.example</code> to <code>.env.local</code>, fill in the instance URI, user
        and password, then run <code>npm run seed</code>.
      </p>
      <p style={{ marginTop: 8 }}>
        <code>{detail}</code>
      </p>
    </div>
  );
}

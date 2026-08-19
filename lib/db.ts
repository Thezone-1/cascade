import neo4j, { Driver, Session } from 'neo4j-driver';

export class ConfigError extends Error {}
export class UnreachableError extends Error {}

declare global {
  var __cascadeDriver: Driver | undefined;
}

function config() {
  const uri = process.env.COGNODB_URI;
  const user = process.env.COGNODB_USER;
  const password = process.env.COGNODB_PASSWORD;

  if (!uri || !user || !password) {
    throw new ConfigError(
      'COGNODB_URI, COGNODB_USER and COGNODB_PASSWORD must all be set. Copy .env.example to .env.local.'
    );
  }
  return { uri, user, password };
}

export function getDriver(): Driver {
  if (global.__cascadeDriver) return global.__cascadeDriver;

  const { uri, user, password } = config();
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 8,
    connectionAcquisitionTimeout: 10_000,
    maxConnectionLifetime: 5 * 60 * 1000,
  });

  global.__cascadeDriver = driver;
  return driver;
}

export async function read<T>(
  cypher: string,
  params: Record<string, unknown>,
  map: (row: Record<string, any>) => T
): Promise<T[]> {
  let session: Session | undefined;
  try {
    session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
    const result = await session.run(cypher, params);
    return result.records.map((record) => map(record.toObject()));
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new UnreachableError(
      `CognoDB query failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    await session?.close();
  }
}

export async function ping(): Promise<{ ok: boolean; detail: string }> {
  try {
    const rows = await read('RETURN 1 AS ok', {}, (r) => num(r.ok));
    return { ok: rows[0] === 1, detail: 'reachable' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (neo4j.isInt(value)) return (value as any).toNumber();
  if (value == null) return 0;
  return Number(value);
}

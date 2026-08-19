import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateDrain, type Reader } from './simulate';
import { GANGS_ON_NODE, GANG_STATE, PREEMPTION_TARGETS, QUEUE_PATHS } from './queries';

type Fixture = {
  gangs: {
    gang: string;
    minMember: number;
    queue: string;
    team: string;
    members: { pod: string; node: string; pinnedTo?: string }[];
  }[];
  preempts: Record<string, string[]>;
};

function reader(fixture: Fixture): Reader {
  const rows = (cypher: string, params: Record<string, any>) => {
    if (cypher === GANGS_ON_NODE) {
      return fixture.gangs
        .filter((g) => g.members.some((m) => m.node === params.node))
        .map((g) => ({ gang: g.gang }));
    }

    if (cypher === GANG_STATE) {
      return fixture.gangs
        .filter((g) => params.gangs.includes(g.gang))
        .map((g) => ({
          gang: g.gang,
          minMember: g.minMember,
          priority: 50,
          queue: g.queue,
          team: g.team,
          members: g.members.map((m) => ({
            pod: m.pod,
            namespace: 'default',
            node: m.node,
            gpus: 1,
            pinnedTo: m.pinnedTo ?? null,
          })),
        }));
    }

    if (cypher === PREEMPTION_TARGETS) {
      return params.gangs.flatMap((name: string) =>
        (fixture.preempts[name] ?? []).map((victim) => ({ gang: victim, preemptedBy: name }))
      );
    }

    if (cypher === QUEUE_PATHS) {
      return params.queues.map((queue: string) => ({
        queue,
        team: 'perception',
        contact: '#ml-perception',
        path: [queue, 'root-research'],
      }));
    }

    throw new Error(`unexpected query: ${cypher.slice(0, 40)}`);
  };

  return (async (cypher: string, params: Record<string, any>, map: (row: any) => unknown) =>
    rows(cypher, params).map(map)) as Reader;
}

const fixture: Fixture = {
  gangs: [
    {
      gang: 'strict-8',
      minMember: 3,
      queue: 'research-llm',
      team: 'foundation',
      members: [
        { pod: 'strict-0', node: 'n1', pinnedTo: 'n1' },
        { pod: 'strict-1', node: 'n2' },
        { pod: 'strict-2', node: 'n3' },
      ],
    },
    {
      gang: 'victim',
      minMember: 2,
      queue: 'research-llm',
      team: 'foundation',
      members: [
        { pod: 'victim-0', node: 'n4' },
        { pod: 'victim-1', node: 'n5' },
      ],
    },
    {
      gang: 'second-victim',
      minMember: 1,
      queue: 'batch-sweeps',
      team: 'perception',
      members: [{ pod: 'second-0', node: 'n6' }],
    },
    {
      gang: 'elastic',
      minMember: 1,
      queue: 'research-audio',
      team: 'speech',
      members: [
        { pod: 'elastic-0', node: 'n1' },
        { pod: 'elastic-1', node: 'n7' },
      ],
    },
  ],
  preempts: {
    'strict-8': ['victim'],
    victim: ['second-victim'],
  },
};

test('a lost worker kills the whole gang once survivors fall below minMember', async () => {
  const result = await simulateDrain('n1', reader(fixture));
  const broken = result.broken.map((g) => g.gang);

  assert.ok(broken.includes('strict-8'));
  assert.ok(!broken.includes('elastic'));
  assert.equal(result.directPods, 2);
});

test('damage keeps propagating through preemption until a round breaks nothing', async () => {
  const result = await simulateDrain('n1', reader(fixture));

  assert.deepEqual(
    result.broken.map((g) => g.gang),
    ['strict-8', 'victim', 'second-victim']
  );
  assert.equal(result.rounds, 3);
  assert.equal(result.evicted.length, 7);
});

test('a pod pinned by a zonal volume on the drained node cannot restart', async () => {
  const result = await simulateDrain('n1', reader(fixture));

  assert.deepEqual(
    result.stranded.map((p) => p.pod),
    ['strict-0']
  );
});

test('a preemption cycle terminates instead of looping', async () => {
  const cyclic: Fixture = {
    ...fixture,
    preempts: { 'strict-8': ['victim'], victim: ['second-victim'], 'second-victim': ['strict-8'] },
  };

  const result = await simulateDrain('n1', reader(cyclic));
  assert.equal(result.broken.length, 3);
});

test('draining an empty node reports no damage', async () => {
  const result = await simulateDrain('n99', reader(fixture));

  assert.equal(result.evicted.length, 0);
  assert.equal(result.broken.length, 0);
  assert.equal(result.queues.length, 0);
});

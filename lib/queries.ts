export const CLUSTER_OVERVIEW = `
MATCH (n:Node)
OPTIONAL MATCH (gpu:GPU)-[:ON]->(n)
WITH n, count(gpu) AS gpus, count(CASE WHEN gpu.allocated THEN 1 END) AS gpusInUse
OPTIONAL MATCH (p:Pod)-[:SCHEDULED_ON]->(n)
OPTIONAL MATCH (p)-[:MEMBER_OF]->(g:Gang)
RETURN n.name AS name, n.zone AS zone, n.status AS status,
       gpus, gpusInUse, count(DISTINCT p) AS pods, count(DISTINCT g) AS gangs
ORDER BY n.name
`;

export const NODE_DETAIL = `
MATCH (n:Node {name: $node})
OPTIONAL MATCH (gpu:GPU)-[:ON]->(n)
WITH n, count(gpu) AS gpus,
     count(CASE WHEN gpu.allocated THEN 1 END) AS gpusInUse,
     head(collect(gpu.model)) AS gpuModel
OPTIONAL MATCH (pvc:PVC)-[:BOUND_TO]->(n)
RETURN n.name AS name, n.zone AS zone, n.status AS status,
       coalesce(gpuModel, 'none') AS gpuModel, gpus, gpusInUse,
       count(pvc) AS pinnedVolumes
`;

export const OWNERSHIP_ON_NODE = `
MATCH (n:Node {name: $node})<-[:ON]-(gpu:GPU)<-[:USES]-(p:Pod)
      -[:MEMBER_OF]->(g:Gang)-[:SUBMITTED_TO]->(q:Queue)-[:OWNED_BY]->(t:Team)
RETURN p.name AS pod, gpu.id AS gpu, g.name AS gang, q.name AS queue,
       t.name AS team, t.contact AS contact, g.priority AS priority
ORDER BY g.priority DESC, p.name
`;

export const QUOTA_ROLLUP = `
MATCH (q:Queue)
OPTIONAL MATCH ancestry = (q)-[:CHILD_OF*1..]->(:Queue)
WITH q, ancestry ORDER BY length(ancestry) DESC
WITH q, head(collect(ancestry)) AS longest
WITH q,
     CASE WHEN longest IS NULL THEN 0 ELSE length(longest) END AS depth,
     CASE WHEN longest IS NULL THEN [] ELSE [x IN tail(nodes(longest)) | x.name] END AS path
MATCH (sub:Queue)-[:CHILD_OF*0..]->(q)
MATCH (q)-[:OWNED_BY]->(t:Team)
RETURN q.name AS queue, depth, path, q.quota AS ownQuota,
       sum(sub.quota) AS subtreeQuota, t.name AS team
ORDER BY depth, queue
`;

export const GANGS_ON_NODE = `
MATCH (p:Pod)-[:SCHEDULED_ON]->(:Node {name: $node})
MATCH (p)-[:MEMBER_OF]->(g:Gang)
RETURN DISTINCT g.name AS gang
`;

export const GANG_STATE = `
UNWIND $gangs AS gangName
MATCH (g:Gang {name: gangName})<-[:MEMBER_OF]-(p:Pod)-[:SCHEDULED_ON]->(n:Node)
OPTIONAL MATCH (p)-[:USES]->(gpu:GPU)
OPTIONAL MATCH (p)-[:MOUNTS]->(:PVC {zonal: true})-[:BOUND_TO]->(pin:Node)
WITH g, p, n, count(DISTINCT gpu) AS gpus, head(collect(DISTINCT pin.name)) AS pinnedTo
WITH g, collect({pod: p.name, namespace: p.namespace, node: n.name,
                 gpus: gpus, pinnedTo: pinnedTo}) AS members
MATCH (g)-[:SUBMITTED_TO]->(q:Queue)-[:OWNED_BY]->(t:Team)
RETURN g.name AS gang, g.minMember AS minMember, g.priority AS priority,
       q.name AS queue, t.name AS team, members
`;

export const PREEMPTION_TARGETS = `
UNWIND $gangs AS gangName
MATCH (g:Gang {name: gangName})-[:PREEMPTS]->(victim:Gang)
RETURN DISTINCT victim.name AS gang, g.name AS preemptedBy
`;

export const QUEUE_PATHS = `
UNWIND $queues AS queueName
MATCH (q:Queue {name: queueName})-[:OWNED_BY]->(t:Team)
OPTIONAL MATCH ancestry = (q)-[:CHILD_OF*1..]->(:Queue)
WITH q, t, ancestry ORDER BY length(ancestry) DESC
WITH q, t, head(collect(ancestry)) AS longest
RETURN q.name AS queue, t.name AS team, t.contact AS contact,
       CASE WHEN longest IS NULL THEN [q.name]
            ELSE [q.name] + [x IN tail(nodes(longest)) | x.name] END AS path
`;

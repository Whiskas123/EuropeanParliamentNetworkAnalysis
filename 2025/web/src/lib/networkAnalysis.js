import { NEUTRAL_WEIGHT } from "./edgeStyle.js";

/**
 * Structure of the network, computed without any knowledge of politics.
 *
 * One question, awkward on this particular graph: if you hand a
 * community-detection algorithm the votes and nothing else, does it rediscover
 * the political groups?
 *
 * The answer is drawn rather than tabulated — lib/communityShapes.js turns each
 * community into an outline over the network, which is where a community
 * actually is. This file only finds them.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OBVIOUS APPROACH DOES NOT WORK HERE
 * ---------------------------------------------------------------------------
 *
 * This is not a sparse social network. Every pair of MEPs has voted on the same
 * roll calls, so every pair has an edge: 696 nodes and 241,860 edges in term
 * 10 — 696 x 695 / 2 exactly, a complete graph. Degree, the thing most network
 * measures are built on, is therefore the same number for everyone and carries
 * no information at all. All the signal is in the weights.
 *
 * And the weights are crowded. Measured over all 241,860 pairs the median is
 * 0.685 and the middle half runs 0.41 to 0.84. What actually reaches the
 * browser is narrower still: the precomputed files ship only the ties above
 * 0.6 (135,776 of them, mean 0.82), so from the client's point of view every
 * MEP agrees with every other MEP between 60% and 98% of the time. The signal
 * is not "connected vs unconnected" — it is a few percentage points between one
 * high number and another.
 *
 * Run textbook Louvain on that and modularity has almost nothing to work with:
 * every node is adjacent to every other with roughly the same strength, so the
 * null model expects roughly what it sees. On term 10 it returns three blocs at
 * modularity 0.24, the largest holding 63% of Parliament — and it is not even
 * a stable answer, because fed the complete edge list instead of the trimmed
 * one the same run gives modularity 0.11 and a 45% largest bloc. Those figures
 * are recorded here rather than on screen, and can be recomputed by passing
 * {includeNaive: true}, because they change what the result means.
 *
 * ---------------------------------------------------------------------------
 * THE PREPROCESSING, AND WHY
 * ---------------------------------------------------------------------------
 *
 * Two steps, both aimed at the same problem — turning "everyone agrees with
 * everyone" into "who does this MEP agree with *most*".
 *
 * 1. SPARSIFY TO EACH MEP'S K STRONGEST PARTNERS (k = round(sqrt(n)), 26 for
 *    term 10), then keep an edge if it survives for either endpoint — a union
 *    kNN graph. This throws away the crowd of middling ties that carry no
 *    information and keeps each MEP's own ranking of who they actually vote
 *    with. It is deliberately a *per-node* cut, not a global weight threshold:
 *    a global cut would strip almost every tie from the MEPs who agree with
 *    nobody much — the non-attached, the hard right — and leave them as near
 *    isolates, which says more about the threshold than about them. Every MEP
 *    keeps exactly their own top k, whoever they are.
 *
 *    That also makes the result independent of which edge list the loader hands
 *    over. The precomputed path supplies only the ties above 0.6, but every node
 *    still has at least 68 of those, so its top 26 are the same 26 that the
 *    complete 241,860-edge list would give. Checked, not assumed: run against
 *    both, the analysis returns the same 8 communities, the same modularity to
 *    four decimals, the same 13,153 kept edges and an identical label for all
 *    696 MEPs. The naive run above is the part that moves.
 *
 * 2. MEASURE WEIGHTS AS EXCESS OVER NEUTRAL (w - 0.5), the same scale the
 *    drawing uses for edge width (see edgeStyle.js). Agreement of 0.5 is a coin
 *    flip and means nothing, so treating a 0.90 tie as 1.5x a 0.60 tie badly
 *    understates it — as excess over neutral it is 4x, which is the honest
 *    ratio. Modularity is weight-proportional, so this is not cosmetic: it is
 *    what lets the strong ties dominate the partition.
 *
 * Neither step invents structure. Both are ways of asking the ranking question
 * instead of the threshold question, which is the only question this topology
 * can answer.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT ANSWER
 * ---------------------------------------------------------------------------
 *
 * "Which MEPs sit between blocs?" was computed here once, and is not any more.
 * Betweenness centrality is the textbook answer and it is meaningless on this
 * graph: every shortest path is one hop, so every score is zero, and running it
 * on the sparsified graph measures the choice of k rather than a fact about
 * Parliament. Asking the question directly instead — how far is an MEP from
 * their own group compared with the nearest other group — is what the Mavericks
 * ranking on the Leads screen does, over every term at once and from the
 * agreement scores rather than from a partition. Two implementations of one
 * measure is one too many, so this one went.
 */

/**
 * How many partners each MEP keeps when sparsifying.
 *
 * sqrt(n) is the standard heuristic for building a kNN graph, and the important
 * thing about it here is that it is chosen without looking at the answer. Tuning
 * k until the communities line up with the political groups would make the whole
 * exercise circular — the question is whether the algorithm finds the groups on
 * its own, so k has to be fixed by a rule about the data's size, not its
 * politics. For term 10 (696 MEPs) the rule gives 26.
 *
 * The result is not delicate: anywhere in k = 26..36 the partition holds at
 * seven or eight communities and the same MEPs are the exceptions. Smaller k
 * splits the big groups by nationality; much larger k starts merging them.
 */
export function defaultK(nodeCount) {
  return Math.max(6, Math.min(40, Math.round(Math.sqrt(nodeCount))));
}

/** Louvain resolution. 1 is the standard Newman-Girvan modularity. */
export const DEFAULT_RESOLUTION = 1;

/** Base seed. Fixed, so the same network always yields the same partition. */
const SEED = 0x5eed1e;

/**
 * Louvain is order-dependent, so a single run is a lottery. Keeping the best of
 * a few restarts by modularity is the usual remedy and costs a few milliseconds
 * at this size. It also removes the seed as a hidden parameter of the result.
 */
const RESTARTS = 6;

/** Below this many nodes a partition says nothing; small country networks. */
const MIN_NODES = 12;

/* -------------------------------------------------------------------------- */
/* small utilities                                                            */
/* -------------------------------------------------------------------------- */

/** Deterministic PRNG (mulberry32) so node visit order is fixed but unbiased. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place Fisher-Yates with the seeded generator. */
function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/** Max of a numeric array without spreading it — these arrays blow the stack. */
function maxOf(values) {
  let best = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > best) best = values[i];
  }
  return best;
}

/**
 * Compressed adjacency for an undirected weighted edge list.
 * Self-loops are stored once and flagged by u === v.
 */
function buildCsr(nodeCount, eu, ev, ew) {
  const degree = new Int32Array(nodeCount);
  for (let e = 0; e < eu.length; e++) {
    degree[eu[e]]++;
    if (eu[e] !== ev[e]) degree[ev[e]]++;
  }
  const offset = new Int32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) offset[i + 1] = offset[i] + degree[i];
  const cursor = offset.slice(0, nodeCount);
  const neighbour = new Int32Array(offset[nodeCount]);
  const weight = new Float64Array(offset[nodeCount]);
  for (let e = 0; e < eu.length; e++) {
    const u = eu[e];
    const v = ev[e];
    neighbour[cursor[u]] = v;
    weight[cursor[u]] = ew[e];
    cursor[u]++;
    if (u !== v) {
      neighbour[cursor[v]] = u;
      weight[cursor[v]] = ew[e];
      cursor[v]++;
    }
  }
  return { offset, neighbour, weight };
}

/* -------------------------------------------------------------------------- */
/* graph construction                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Index the nodes and turn the link list into flat typed arrays.
 * Links referencing unknown nodes, duplicates and self-links are dropped.
 */
function indexGraph(graphData) {
  const nodes = graphData.nodes || [];
  const index = new Map();
  for (let i = 0; i < nodes.length; i++) index.set(nodes[i].id, i);

  const links = graphData.allLinks || graphData.links || [];
  const n = nodes.length;
  const eu = new Int32Array(links.length);
  const ev = new Int32Array(links.length);
  const ew = new Float64Array(links.length);
  const seen = new Set();
  let count = 0;
  let minWeight = Infinity;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;
    const u = index.get(sourceId);
    const v = index.get(targetId);
    if (u === undefined || v === undefined || u === v) continue;
    const a = u < v ? u : v;
    const b = u < v ? v : u;
    const key = a * n + b;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = typeof link.weight === "number" ? link.weight : 0;
    eu[count] = a;
    ev[count] = b;
    ew[count] = w;
    if (w < minWeight) minWeight = w;
    count++;
  }

  return {
    nodes,
    index,
    eu: eu.subarray(0, count),
    ev: ev.subarray(0, count),
    ew: ew.subarray(0, count),
    edgeCount: count,
    minWeight: count > 0 ? minWeight : 0,
  };
}

/**
 * Union kNN sparsification: keep an edge if either endpoint ranks the other in
 * its k strongest ties. Weights are returned as excess over neutral, floored at
 * a small positive value so a barely-above-neutral tie still counts as a tie
 * rather than vanishing from the null model.
 */
function sparsify(nodeCount, eu, ev, ew, k) {
  const csr = buildCsr(nodeCount, eu, ev, ew);
  const keep = new Uint8Array(eu.length);
  const edgeIdOf = new Int32Array(csr.neighbour.length);

  // Re-walk the edges to remember which CSR slot belongs to which edge id.
  {
    const cursor = csr.offset.slice(0, nodeCount);
    for (let e = 0; e < eu.length; e++) {
      const u = eu[e];
      const v = ev[e];
      edgeIdOf[cursor[u]] = e;
      cursor[u]++;
      edgeIdOf[cursor[v]] = e;
      cursor[v]++;
    }
  }

  const scratch = [];
  for (let i = 0; i < nodeCount; i++) {
    const start = csr.offset[i];
    const end = csr.offset[i + 1];
    const degree = end - start;
    if (degree <= k) {
      for (let s = start; s < end; s++) keep[edgeIdOf[s]] = 1;
      continue;
    }
    scratch.length = 0;
    for (let s = start; s < end; s++) scratch.push(s);
    scratch.sort((a, b) => csr.weight[b] - csr.weight[a]);
    for (let r = 0; r < k; r++) keep[edgeIdOf[scratch[r]]] = 1;
  }

  let kept = 0;
  for (let e = 0; e < eu.length; e++) if (keep[e]) kept++;

  const su = new Int32Array(kept);
  const sv = new Int32Array(kept);
  const sw = new Float64Array(kept);
  let at = 0;
  for (let e = 0; e < eu.length; e++) {
    if (!keep[e]) continue;
    su[at] = eu[e];
    sv[at] = ev[e];
    // Excess over neutral: the same scale the canvas draws edge width on.
    sw[at] = Math.max(ew[e] - NEUTRAL_WEIGHT, 1e-4);
    at++;
  }
  return { eu: su, ev: sv, ew: sw, kept };
}

/* -------------------------------------------------------------------------- */
/* Louvain                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One local-moving pass set over a graph, returning a membership vector.
 * Standard Louvain gain: moving i into C changes Q by
 *   w(i -> C) - resolution * k_i * totalDegree(C) / 2m
 * (constant factors dropped, they do not change the argmax).
 */
function localMoving(nodeCount, eu, ev, ew, resolution, rng) {
  const csr = buildCsr(nodeCount, eu, ev, ew);
  const selfLoop = new Float64Array(nodeCount);
  for (let e = 0; e < eu.length; e++) {
    if (eu[e] === ev[e]) selfLoop[eu[e]] += ew[e];
  }

  const degree = new Float64Array(nodeCount);
  let m2 = 0;
  for (let i = 0; i < nodeCount; i++) {
    let sum = 2 * selfLoop[i];
    for (let s = csr.offset[i]; s < csr.offset[i + 1]; s++) {
      if (csr.neighbour[s] !== i) sum += csr.weight[s];
    }
    degree[i] = sum;
    m2 += sum;
  }
  if (m2 <= 0) {
    const trivial = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) trivial[i] = i;
    return { membership: trivial, moved: false };
  }

  const membership = new Int32Array(nodeCount);
  const totalDegree = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    membership[i] = i;
    totalDegree[i] = degree[i];
  }

  const order = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) order[i] = i;
  shuffle(order, rng);

  const weightToCommunity = new Float64Array(nodeCount);
  const touched = new Int32Array(nodeCount);
  let movedEver = false;

  for (let pass = 0; pass < 40; pass++) {
    let movedThisPass = 0;
    for (let o = 0; o < nodeCount; o++) {
      const i = order[o];
      const home = membership[i];

      let touchedCount = 0;
      for (let s = csr.offset[i]; s < csr.offset[i + 1]; s++) {
        const j = csr.neighbour[s];
        if (j === i) continue;
        const c = membership[j];
        if (weightToCommunity[c] === 0) {
          touched[touchedCount] = c;
          touchedCount++;
        }
        weightToCommunity[c] += csr.weight[s];
      }

      totalDegree[home] -= degree[i];
      const scale = (resolution * degree[i]) / m2;
      let best = home;
      let bestGain = weightToCommunity[home] - scale * totalDegree[home];
      for (let t = 0; t < touchedCount; t++) {
        const c = touched[t];
        if (c === home) continue;
        const gain = weightToCommunity[c] - scale * totalDegree[c];
        if (gain > bestGain + 1e-12) {
          bestGain = gain;
          best = c;
        }
      }
      totalDegree[best] += degree[i];
      membership[i] = best;
      if (best !== home) {
        movedThisPass++;
        movedEver = true;
      }

      for (let t = 0; t < touchedCount; t++) weightToCommunity[touched[t]] = 0;
    }
    if (movedThisPass === 0) break;
  }

  return { membership, moved: movedEver };
}

/** Renumber a membership vector to 0..c-1 and report the community count. */
function compact(membership) {
  const remap = new Map();
  const out = new Int32Array(membership.length);
  for (let i = 0; i < membership.length; i++) {
    let id = remap.get(membership[i]);
    if (id === undefined) {
      id = remap.size;
      remap.set(membership[i], id);
    }
    out[i] = id;
  }
  return { membership: out, count: remap.size };
}

/** Modularity of a partition on the graph it was found in. */
function modularityOf(nodeCount, eu, ev, ew, membership, resolution) {
  const communityCount = membership.length === 0 ? 0 : maxOf(membership) + 1;
  const internal = new Float64Array(communityCount);
  const total = new Float64Array(communityCount);
  const degree = new Float64Array(nodeCount);
  let m2 = 0;

  for (let e = 0; e < eu.length; e++) {
    const u = eu[e];
    const v = ev[e];
    const w = ew[e];
    if (u === v) {
      degree[u] += 2 * w;
      m2 += 2 * w;
      internal[membership[u]] += 2 * w;
    } else {
      degree[u] += w;
      degree[v] += w;
      m2 += 2 * w;
      if (membership[u] === membership[v]) internal[membership[u]] += 2 * w;
    }
  }
  if (m2 <= 0) return 0;
  for (let i = 0; i < nodeCount; i++) total[membership[i]] += degree[i];

  let q = 0;
  for (let c = 0; c < communityCount; c++) {
    const frac = total[c] / m2;
    q += internal[c] / m2 - resolution * frac * frac;
  }
  return q;
}

/**
 * Multi-level Louvain. Returns the membership of the original nodes plus the
 * modularity of that partition measured on the original graph.
 */
export function louvain(nodeCount, eu, ev, ew, options = {}) {
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const rng = makeRng(options.seed ?? SEED);

  const ownership = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) ownership[i] = i;

  let levelNodes = nodeCount;
  let levelU = eu;
  let levelV = ev;
  let levelW = ew;

  for (let level = 0; level < 20; level++) {
    const moving = localMoving(levelNodes, levelU, levelV, levelW, resolution, rng);
    const packed = compact(moving.membership);
    for (let i = 0; i < nodeCount; i++) ownership[i] = packed.membership[ownership[i]];
    if (!moving.moved || packed.count === levelNodes) break;

    // Aggregate: communities become nodes, internal weight becomes a self-loop.
    const merged = new Map();
    for (let e = 0; e < levelU.length; e++) {
      const a = packed.membership[levelU[e]];
      const b = packed.membership[levelV[e]];
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      const key = lo * packed.count + hi;
      merged.set(key, (merged.get(key) || 0) + levelW[e]);
    }
    const nextU = new Int32Array(merged.size);
    const nextV = new Int32Array(merged.size);
    const nextW = new Float64Array(merged.size);
    let at = 0;
    merged.forEach((weight, key) => {
      nextU[at] = Math.floor(key / packed.count);
      nextV[at] = key % packed.count;
      nextW[at] = weight;
      at++;
    });
    levelNodes = packed.count;
    levelU = nextU;
    levelV = nextV;
    levelW = nextW;
  }

  const final = compact(ownership);
  return {
    membership: final.membership,
    communityCount: final.count,
    modularity: modularityOf(nodeCount, eu, ev, ew, final.membership, resolution),
  };
}

/* -------------------------------------------------------------------------- */
/* partition comparison                                                       */
/* -------------------------------------------------------------------------- */

const choose2 = (x) => (x * (x - 1)) / 2;

/**
 * Adjusted Rand Index and normalised mutual information between the detected
 * communities and the political groups.
 *
 * ARI answers "do these two partitions agree on which pairs of MEPs belong
 * together, beyond what chance would give?" — 0 is chance, 1 is identical.
 * NMI answers "how much does knowing the community tell you about the group?"
 * Both are reported because they fail differently: NMI stays high when one
 * partition is a refinement of the other, ARI does not.
 */
export function comparePartitions(labelsA, labelsB) {
  const n = labelsA.length;
  if (n === 0) return { ari: 0, nmi: 0 };
  const table = new Map();
  const rows = new Map();
  const cols = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${labelsA[i]}|${labelsB[i]}`;
    table.set(key, (table.get(key) || 0) + 1);
    rows.set(labelsA[i], (rows.get(labelsA[i]) || 0) + 1);
    cols.set(labelsB[i], (cols.get(labelsB[i]) || 0) + 1);
  }

  let sumCellPairs = 0;
  let mutualInfo = 0;
  table.forEach((count, key) => {
    sumCellPairs += choose2(count);
    const sep = key.indexOf("|");
    const a = rows.get(key.slice(0, sep));
    const b = cols.get(key.slice(sep + 1));
    if (count > 0) mutualInfo += (count / n) * Math.log((count * n) / (a * b));
  });

  let sumRowPairs = 0;
  let entropyA = 0;
  rows.forEach((count) => {
    sumRowPairs += choose2(count);
    entropyA -= (count / n) * Math.log(count / n);
  });
  let sumColPairs = 0;
  let entropyB = 0;
  cols.forEach((count) => {
    sumColPairs += choose2(count);
    entropyB -= (count / n) * Math.log(count / n);
  });

  const expected = (sumRowPairs * sumColPairs) / choose2(n);
  const maxIndex = (sumRowPairs + sumColPairs) / 2;
  const ari = maxIndex - expected === 0 ? 0 : (sumCellPairs - expected) / (maxIndex - expected);
  const denominator = (entropyA + entropyB) / 2;
  const nmi = denominator === 0 ? 0 : mutualInfo / denominator;
  return { ari, nmi };
}

/* -------------------------------------------------------------------------- */
/* entry point                                                                */
/* -------------------------------------------------------------------------- */

const cache = new WeakMap();

/**
 * Run the whole analysis. Expensive enough to be worth memoising per graphData
 * and worth deferring until the reader asks for the outlines.
 *
 * @param {object} graphData - {nodes, allLinks, nodeMap}
 * @param {object} [options] - {k, resolution, seed, includeNaive}
 * @returns {object|null} null when the network is too small to partition
 */
export function analyzeStructure(graphData, options = {}) {
  if (!graphData || !graphData.nodes || graphData.nodes.length < MIN_NODES) {
    return null;
  }
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const seed = options.seed ?? SEED;
  const restarts = options.restarts ?? RESTARTS;
  // The comparison run — same algorithm, raw weights, every edge — is off by
  // default. It doubles the cost of the analysis and nothing on screen shows
  // it any more; the numbers it produces on term 10 are in the note at the top
  // of this file, and scripts that want to re-check them can ask for it.
  const includeNaive = options.includeNaive === true;

  const base = indexGraph(graphData);
  const { nodes } = base;
  const n = nodes.length;
  if (base.edgeCount === 0) return null;
  const k = options.k ?? defaultK(n);

  /** Best of a few restarts, by modularity. See RESTARTS. */
  const bestOf = (eu, ev, ew) => {
    let best = null;
    for (let r = 0; r < restarts; r++) {
      const run = louvain(n, eu, ev, ew, { resolution, seed: seed + r * 7919 });
      if (best === null || run.modularity > best.modularity) best = run;
    }
    return best;
  };

  // The comparison run: the same algorithm, same restarts, raw weights, every
  // edge the loader gave us. Reported so the preprocessing is visible rather
  // than hidden inside the result.
  let naive = null;
  if (includeNaive) {
    const naiveStart =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const raw = bestOf(base.eu, base.ev, base.ew);
    const sizes = new Int32Array(raw.communityCount);
    for (let i = 0; i < n; i++) sizes[raw.membership[i]]++;
    naive = {
      communityCount: raw.communityCount,
      modularity: raw.modularity,
      largestShare: raw.communityCount > 0 ? maxOf(sizes) / n : 0,
      edgeCount: base.edgeCount,
      ms:
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        naiveStart,
    };
  }

  const sparse = sparsify(n, base.eu, base.ev, base.ew, k);
  const result = bestOf(sparse.eu, sparse.ev, sparse.ew);
  const membership = result.membership;

  // Community composition by political group, and by country — the country
  // breakdown is what tells you whether a community that looks like a clean
  // slice of one group is actually a national delegation that broke away.
  const communities = [];
  for (let c = 0; c < result.communityCount; c++) {
    communities.push({
      id: c,
      size: 0,
      counts: new Map(),
      countries: new Map(),
      members: [],
    });
  }
  const groupSizes = new Map();
  const countrySizes = new Map();
  for (let i = 0; i < n; i++) {
    const community = communities[membership[i]];
    const groupId = nodes[i].groupId || "Unknown";
    const country = nodes[i].country || "Unknown";
    community.size++;
    community.counts.set(groupId, (community.counts.get(groupId) || 0) + 1);
    community.countries.set(country, (community.countries.get(country) || 0) + 1);
    community.members.push(nodes[i].id);
    groupSizes.set(groupId, (groupSizes.get(groupId) || 0) + 1);
    countrySizes.set(country, (countrySizes.get(country) || 0) + 1);
  }

  const shaped = communities.map((community) => {
    const composition = Array.from(community.counts.entries())
      .map(([groupId, count]) => ({
        groupId,
        count,
        share: count / community.size,
        // What share of that whole group landed here, and out of how many —
        // "23 of the EPP's 176" is the figure that separates a splinter from
        // a group, and neither number means much without the other.
        shareOfGroup: count / (groupSizes.get(groupId) || 1),
        groupTotal: groupSizes.get(groupId) || count,
      }))
      .sort((a, b) => b.count - a.count);
    const countries = Array.from(community.countries.entries())
      .map(([country, count]) => ({
        country,
        count,
        share: count / community.size,
        // And the other direction: what share of that country's whole
        // delegation is in here. A country of six can never be a large part of
        // a community of a hundred, but all six of them sitting in one
        // community is a fact about that country worth stating.
        countryTotal: countrySizes.get(country) || count,
        shareOfCountry: count / (countrySizes.get(country) || 1),
      }))
      .sort((a, b) => b.count - a.count);
    return {
      id: community.id,
      size: community.size,
      members: community.members,
      composition,
      countries,
      countryCount: countries.length,
      dominantGroup: composition.length > 0 ? composition[0].groupId : null,
      dominantShare: composition.length > 0 ? composition[0].share : 0,
      // A community that is one group *and* one country is a national
      // delegation the algorithm pulled out of its own group.
      nationalSplinter:
        composition.length > 0 &&
        composition[0].share >= 0.9 &&
        composition[0].shareOfGroup < 0.6 &&
        countries.length > 0 &&
        countries[0].share >= 0.9
          ? countries[0].country
          : null,
    };
  });
  shaped.sort((a, b) => b.size - a.size);
  const rank = new Map();
  for (let i = 0; i < shaped.length; i++) rank.set(shaped[i].id, i);

  // How many MEPs the algorithm filed under a community another group owns.
  // Only the count: who they are, and by how much they agree with the group
  // they landed in, is the Mavericks ranking on the Leads screen, computed
  // from the same agreement scores over every term at once.
  let mismatchedCount = 0;
  for (let i = 0; i < n; i++) {
    const community = shaped[rank.get(membership[i])];
    const groupId = nodes[i].groupId || "Unknown";
    if (!community.dominantGroup || community.dominantGroup === groupId) continue;
    mismatchedCount++;
  }

  const groupLabels = new Array(n);
  const communityLabels = new Array(n);
  for (let i = 0; i < n; i++) {
    groupLabels[i] = nodes[i].groupId || "Unknown";
    communityLabels[i] = String(membership[i]);
  }
  const agreement = comparePartitions(communityLabels, groupLabels);

  const totalMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    startedAt;

  return {
    preprocessing: {
      k,
      resolution,
      restarts,
      neutral: NEUTRAL_WEIGHT,
      inputEdges: base.edgeCount,
      keptEdges: sparse.kept,
      keptShare: sparse.kept / base.edgeCount,
      minInputWeight: base.minWeight,
      nodeCount: n,
    },
    naive,
    communities: shaped,
    communityCount: result.communityCount,
    modularity: result.modularity,
    membership,
    // Share of MEPs sitting in a community their own group dominates.
    concordantShare: n === 0 ? 0 : (n - mismatchedCount) / n,
    agreement,
    ms: totalMs,
  };
}

/**
 * Memoised wrapper: the analysis is deterministic for a given graphData, and
 * graphData is replaced wholesale on every network load, so a WeakMap keyed on
 * it is exactly the right lifetime.
 */
export function getStructureAnalysis(graphData, options) {
  if (!graphData) return null;
  const hit = cache.get(graphData);
  if (hit !== undefined) return hit;
  const value = analyzeStructure(graphData, options);
  cache.set(graphData, value);
  return value;
}

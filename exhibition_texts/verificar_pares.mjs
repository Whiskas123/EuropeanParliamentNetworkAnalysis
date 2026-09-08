import fs from "fs";
const ROOT = "/Users/joao.narciso/pessoal/EuropeanParliamentNetworkAnalysis";
const WT = ROOT + "/.claude/worktrees/partner-pairs-condensed";
const { familyPairs, pairKey } = await import(ROOT + "/2025/web/src/lib/families.js");

// Replay familyPairs over the five precomputed whole-Parliament networks.
const truth = {};
for (const t of [6, 7, 8, 9, 10]) {
  const j = JSON.parse(fs.readFileSync(`${ROOT}/2025/web/public/data/precomputed/mandate_${t}.json`, "utf8"));
  truth[t] = familyPairs(j.cohesionData.intergroupCohesion);
}

// Pull the literal the panel actually ships.
const html = fs.readFileSync(WT + "/exhibition_texts/painel_evolucao.html", "utf8");
const block = html.split("const PAIRS = [")[1].split("];")[0];
const rows = [...block.matchAll(/\{a:"([^"]+)", b:"([^"]+)", v:\[([^\]]+)\]\}/g)]
  .map(m => ({ a: m[1], b: m[2], v: m[3].split(",").map(Number) }));

let bad = 0;
if (rows.length !== 21) { console.log("WRONG COUNT:", rows.length); bad++; }
const seen = new Set();
for (const r of rows) {
  const k = pairKey(r.a, r.b);
  if (seen.has(k)) { console.log("DUPLICATE PAIR:", k); bad++; }
  seen.add(k);
  r.v.forEach((v, i) => {
    const want = +(truth[6 + i][k] * 100).toFixed(1);
    if (Math.abs(want - v) > 1e-9) { console.log("MISMATCH", k, "T" + (6 + i), "html", v, "data", want); bad++; }
  });
}
if (seen.size !== 21) { console.log("NOT ALL PAIRS PRESENT:", seen.size); bad++; }

// The claim the captions make: 10 up inside, 10 down across, 1 up between.
const RIGHT = new Set(["Conservatives", "FarRight"]);
const d = r => +(r.v[4] - r.v[0]).toFixed(1);
const inside = rows.filter(r => !RIGHT.has(r.a) && !RIGHT.has(r.b));
const across = rows.filter(r => RIGHT.has(r.a) !== RIGHT.has(r.b));
const both = rows.filter(r => RIGHT.has(r.a) && RIGHT.has(r.b));
console.log("inside:", inside.length, "all up:", inside.every(r => d(r) > 0),
  "| across:", across.length, "all down:", across.every(r => d(r) < 0),
  "| between:", both.length, "delta:", both.map(d));
const ups = inside.map(d).sort((x, y) => x - y), downs = across.map(d).sort((x, y) => y - x);
console.log("range up:", ups[0], "to", ups[ups.length - 1],
  "| range down:", downs[0], "to", downs[downs.length - 1]);
console.log(bad === 0 ? "OK — every figure in the panel replays from the precomputed networks" : `FAILED (${bad})`);
process.exit(bad === 0 ? 0 : 1);

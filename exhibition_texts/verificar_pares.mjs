/**
 * Replays every figure in gráficos 7, 8 e 9 out of the precomputed networks.
 *
 *     node exhibition_texts/verificar_pares.mjs
 *
 * The panel hard-codes its numbers — it is a standalone HTML file with no
 * fetch in it, which is what makes it printable and what makes it able to go
 * stale silently. This re-derives all 105 figures (21 pairs x 5 terms) from
 * `mandate_6..10.json` through the same `familyPairs` the site uses, and fails
 * loudly on any drift. It also re-checks the claim the captions rest on: ten
 * pairs up inside the bloc, ten down across it, one up between Conservatives
 * and the far right, no exceptions.
 *
 * Paths resolve from this file, so it runs the same in the main checkout and
 * in a worktree. Its only import is `families.js`, which is a pure table.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const WEB = path.join(ROOT, "2025", "web");
const { familyPairs, pairKey } = await import(path.join(WEB, "src", "lib", "families.js"));

// One term at a time, whole Parliament, straight out of the precomputed file.
const truth = {};
for (const t of [6, 7, 8, 9, 10]) {
  const file = path.join(WEB, "public", "data", "precomputed", `mandate_${t}.json`);
  truth[t] = familyPairs(JSON.parse(fs.readFileSync(file, "utf8")).cohesionData.intergroupCohesion);
}

// The literal the panel actually ships, read back out of the page.
const html = fs.readFileSync(path.join(HERE, "painel_evolucao.html"), "utf8");
const block = html.split("const PAIRS = [")[1].split("];")[0];
const rows = [...block.matchAll(/\{a:"([^"]+)", b:"([^"]+)", v:\[([^\]]+)\]\}/g)]
  .map(m => ({ a: m[1], b: m[2], v: m[3].split(",").map(Number) }));

let bad = 0;
const fail = (...msg) => { console.log("✗", ...msg); bad += 1; };

if (rows.length !== 21) fail("wrong number of pairs in the page:", rows.length);
const seen = new Set();
for (const r of rows) {
  const k = pairKey(r.a, r.b);
  if (seen.has(k)) fail("pair listed twice:", k);
  seen.add(k);
  r.v.forEach((v, i) => {
    const want = +(truth[6 + i][k] * 100).toFixed(1);
    if (Math.abs(want - v) > 1e-9) fail("mismatch", k, "T" + (6 + i), "page", v, "data", want);
  });
}
if (seen.size !== 21) fail("not all 21 pairs are present:", seen.size);

/* The captions' claim, re-derived rather than trusted. `d` uses the printed
   values at printed precision, which is the arithmetic the chart shows. */
const RIGHT = new Set(["Conservatives", "FarRight"]);
const d = r => +(r.v[4] - r.v[0]).toFixed(1);
const inside = rows.filter(r => !RIGHT.has(r.a) && !RIGHT.has(r.b));
const across = rows.filter(r => RIGHT.has(r.a) !== RIGHT.has(r.b));
const between = rows.filter(r => RIGHT.has(r.a) && RIGHT.has(r.b));

if (inside.length !== 10 || !inside.every(r => d(r) > 0)) fail("the ten inside-bloc pairs do not all rise");
if (across.length !== 10 || !across.every(r => d(r) < 0)) fail("the ten cross-boundary pairs do not all fall");
if (between.length !== 1 || d(between[0]) <= 0) fail("Conservatives ~ far right does not rise");

const ups = inside.map(d).sort((a, b) => a - b);
const downs = across.map(d).sort((a, b) => b - a);
console.log(`sobem: ${inside.length} (de +${ups[0]} a +${ups[ups.length - 1]})`);
console.log(`descem: ${across.length} (de ${downs[0]} a ${downs[downs.length - 1]})`);
console.log(`conservadores ~ direita radical: +${d(between[0])}`);
console.log(bad === 0
  ? "OK — os 105 números do painel saem dos ficheiros precomputados"
  : `FALHOU — ${bad} problema(s)`);
process.exit(bad === 0 ? 0 : 1);

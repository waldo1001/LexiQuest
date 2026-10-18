#!/usr/bin/env node
/**
 * scripts/validate-specs.js — the spec contract for docs/specs/*.md, as waldo.Jarvis's League reads it.
 *
 * Plain CommonJS, zero dependencies: a League draft runs this with no node_modules installed
 * (`node scripts/validate-specs.js <spec>` is the only command a draft may run, see .league.json).
 * The vitest meta-test api/src/__meta__/specs-frontmatter.test.ts exercises this module directly,
 * so the rules live here and nowhere else.
 *
 * Rules (docs/specs/README.md):
 *   - `---` on line 1; `issue:` a number; `status:` read by its first word, one of STATUSES;
 *   - the file name starts with `<issue>-` (the League refuses a draft otherwise);
 *   - the body `Status:` line stays in step: draft <-> proposed, implemented <-> implemented;
 *   - exactly one `# ` title (the League takes it as the spec title);
 *   - sections `## 1.` … `## 12.` are present (the ship-time "12. Built, deviations" keeps 12 and
 *     renumbers the old one to 13, so 12 stays required).
 *
 * CLI: `node scripts/validate-specs.js [file…]`. Without arguments every docs/specs/*.md whose
 * name starts with digits is required to have frontmatter; other files (README.md) are left alone
 * unless they carry frontmatter. Exit 1 with one `path: problem` line per problem.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const STATUSES = ["draft", "approved", "in-progress", "implemented", "failed"];
const BODY_STATUS = { draft: "proposed", implemented: "implemented" };
const REQUIRED_SECTIONS = 12;

/** `---` on line 1; bare scalars; a trailing ` # comment` is not part of the value; status is its first word. */
function parseSpecHead(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const body = fm ? text.slice(fm[0].length) : text;
  const bodyStatusMatch = /^Status: (\w[\w-]*)/m.exec(body);
  const bodyStatus = bodyStatusMatch ? bodyStatusMatch[1].toLowerCase() : undefined;
  const titles = (body.match(/^#[ \t]+\S/gm) || []).length;
  const sections = [...body.matchAll(/^##[ \t]+(\d+)\./gm)].map((m) => Number(m[1]));
  if (!fm) return { frontmatter: false, bodyStatus, titles, sections };
  const scalar = (key) => {
    const m = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(fm[1]);
    const v = m ? m[1].replace(/\s+#.*$/, "").trim() : undefined;
    return v === undefined || v === "" ? undefined : v;
  };
  const rawStatus = scalar("status") || "";
  const statusWord = /^[a-z][a-z-]*/i.exec(rawStatus);
  return {
    frontmatter: true,
    issue: scalar("issue"),
    status: statusWord ? statusWord[0].toLowerCase() : undefined,
    bodyStatus,
    titles,
    sections,
  };
}

/** What is wrong with a spec's head; empty when it is fine. A spec without frontmatter is only wrong when `required`. */
function specProblems(head, opts) {
  const { fileName, required } = opts;
  if (!head.frontmatter) return required ? ["no frontmatter: `---` must be line 1"] : [];
  const out = [];
  if (!head.issue || !/^\d+$/.test(head.issue)) {
    out.push(`issue must be a number, got ${head.issue === undefined ? "nothing" : head.issue}`);
  } else if (!fileName.startsWith(`${head.issue}-`)) {
    out.push(`file name must start with ${head.issue}- (the issue number), got ${fileName}`);
  }
  if (!head.status || !STATUSES.includes(head.status)) {
    out.push(`status must start with one of ${STATUSES.join(", ")}, got ${head.status === undefined ? "nothing" : head.status}`);
  } else if (BODY_STATUS[head.status] && head.bodyStatus !== BODY_STATUS[head.status]) {
    out.push(`status ${head.status} but the body line says "Status: ${head.bodyStatus === undefined ? "(none)" : head.bodyStatus}", expected "${BODY_STATUS[head.status]}"`);
  }
  if (head.titles !== 1) out.push(`exactly one \`# \` title expected, found ${head.titles}`);
  for (let n = 1; n <= REQUIRED_SECTIONS; n++) {
    if (!head.sections.includes(n)) out.push(`missing section ${n} (\`## ${n}. …\`)`);
  }
  return out;
}

/** Validate one file: required frontmatter when `required` (default: the name starts with digits). */
function validateFile(file, required) {
  const fileName = path.basename(file);
  const req = required === undefined ? /^\d/.test(fileName) : required;
  const text = fs.readFileSync(file, "utf8");
  return { path: file, problems: specProblems(parseSpecHead(text), { fileName, required: req }) };
}

/** Every *.md in `dir` except README.md. */
function validateSpecs(dir) {
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
    .sort()
    .map((n) => validateFile(path.join(dir, n)));
}

function main(argv) {
  const root = path.resolve(__dirname, "..");
  const results = argv.length > 0 ? argv.map((f) => validateFile(path.resolve(f), true)) : validateSpecs(path.join(root, "docs", "specs"));
  const bad = results.filter((r) => r.problems.length > 0);
  for (const r of bad) for (const p of r.problems) console.error(`${path.relative(process.cwd(), r.path)}: ${p}`);
  if (bad.length > 0) return 1;
  console.log(`ok: ${results.length} spec(s) checked`);
  return 0;
}

module.exports = { STATUSES, BODY_STATUS, REQUIRED_SECTIONS, parseSpecHead, specProblems, validateFile, validateSpecs };

if (require.main === module) process.exit(main(process.argv.slice(2)));

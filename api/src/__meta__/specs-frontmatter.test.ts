/**
 * Spec frontmatter contract for waldo.Jarvis's League (docs/specs/*.md, `.league.json`).
 *
 * The League reads a spec only through a YAML block with `---` on line 1, needs `issue:` (a
 * number) and reads `status:` by its first word. The file name must start with `<issue>-`
 * (a League draft is refused otherwise). The human `Status:` line in the body stays in step:
 * draft <-> proposed, implemented <-> implemented. The validator under test is the plain-node
 * script a League draft may run (`node scripts/validate-specs.js`), so this test exercises
 * that script and nothing else.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface SpecHead {
  frontmatter: boolean;
  issue?: string;
  status?: string;
  bodyStatus?: string;
  titles: number;
  sections: number[];
}

interface Validator {
  STATUSES: readonly string[];
  parseSpecHead(text: string): SpecHead;
  specProblems(head: SpecHead, opts: { fileName: string; required: boolean }): string[];
  validateSpecs(dir: string): { path: string; problems: string[] }[];
  REQUIRED_SECTIONS: number;
}

const ROOT = resolve(__dirname, "../../..");
const VALIDATOR = join(ROOT, "scripts/validate-specs.js");
const SPECS_DIR = join(ROOT, "docs/specs");
const require = createRequire(__filename);
const v = require(VALIDATOR) as Validator;

const SECTION_TITLES = [
  "Goal", "Behaviour after", "Decisions", "Contract", "Test plan (write first)", "Tasks",
  "Verification", "Later, not in this spec", "Risks and open questions", "Files",
  "Definition of Done", "Proposed edits to other files (not applied)",
];

function goodSpec(issue: number, status: string, bodyStatus = "proposed"): string {
  const sections = SECTION_TITLES.map((t, i) => `## ${i + 1}. ${t}\n\n...\n`).join("\n");
  return `---\nissue: ${issue}\nstatus: ${status}\n---\n\n# A title\n\nStatus: ${bodyStatus}, 2026-10-18. Owner: waldo.\n\n${sections}`;
}

const problems = (text: string, fileName = "5-a-title.md", required = true): string[] =>
  v.specProblems(v.parseSpecHead(text), { fileName, required });

describe("specs-frontmatter: parseSpecHead", () => {
  it("reads issue and the first word of status, ignoring inline comments", () => {
    const h = v.parseSpecHead("---\nissue: 12\nstatus: draft   # waiting for waldo\n---\n\n# T\n\nStatus: proposed, 2026-10-15.\n");
    expect(h).toMatchObject({ frontmatter: true, issue: "12", status: "draft", bodyStatus: "proposed", titles: 1 });
    expect(v.parseSpecHead("---\nissue: 3\nstatus: Implemented, 2026-10-15\n---\n# T\n").status).toBe("implemented");
  });

  it("has no frontmatter when `---` is not on line 1", () => {
    expect(v.parseSpecHead("\n---\nissue: 1\nstatus: draft\n---\n").frontmatter).toBe(false);
    expect(v.parseSpecHead("# T\n\nStatus: implemented, 2026-10-08.\n").frontmatter).toBe(false);
  });

  it("counts `# ` titles and lists the numbered `## N.` sections", () => {
    const h = v.parseSpecHead(goodSpec(5, "draft"));
    expect(h.titles).toBe(1);
    expect(h.sections).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("specs-frontmatter: specProblems", () => {
  it("accepts a complete draft and a complete implemented spec", () => {
    expect(problems(goodSpec(5, "draft"))).toEqual([]);
    expect(problems(goodSpec(5, "implemented", "implemented"))).toEqual([]);
  });

  it("flags a missing or malformed issue", () => {
    expect(problems(goodSpec(5, "draft").replace("issue: 5\n", ""))[0]).toMatch(/issue must be a number/);
    expect(problems(goodSpec(5, "draft").replace("issue: 5", "issue: #5"))[0]).toMatch(/issue must be a number/);
  });

  it("flags a file name that does not start with `<issue>-`", () => {
    expect(problems(goodSpec(5, "draft"), "a-title.md")[0]).toMatch(/file name must start with 5-/);
    expect(problems(goodSpec(5, "draft"), "55-a-title.md")[0]).toMatch(/file name must start with 5-/);
  });

  it("flags an unknown status and a body line out of step", () => {
    expect(problems(goodSpec(5, "ready"))[0]).toMatch(/status must start with one of/);
    expect(problems(goodSpec(5, "draft", "implemented"))[0]).toMatch(/expected "proposed"/);
    expect(problems(goodSpec(5, "implemented", "proposed"))[0]).toMatch(/expected "implemented"/);
    expect(problems(goodSpec(5, "draft").replace(/^Status: .*$/m, "No status line."))[0]).toMatch(/\(none\)/);
  });

  it("leaves the body line alone for approved, in-progress and failed", () => {
    for (const s of ["approved", "in-progress", "failed"]) expect(problems(goodSpec(5, s))).toEqual([]);
  });

  it("flags a missing numbered section and a missing or doubled title", () => {
    expect(problems(goodSpec(5, "draft").replace("## 7. Verification", "## Verification"))[0]).toMatch(/missing section 7/);
    expect(problems(goodSpec(5, "draft").replace("# A title", "A title"))[0]).toMatch(/exactly one `# ` title/);
    expect(problems(goodSpec(5, "draft").replace("# A title", "# A title\n\n# Another"))[0]).toMatch(/exactly one `# ` title/);
  });

  it("treats a file without frontmatter as wrong only when one is required", () => {
    const h = v.parseSpecHead("# T\n\nStatus: implemented, 2026-10-08.\n");
    expect(v.specProblems(h, { fileName: "notes.md", required: false })).toEqual([]);
    expect(v.specProblems(h, { fileName: "7-notes.md", required: true })).toEqual(["no frontmatter: `---` must be line 1"]);
  });
});

describe("specs-frontmatter: the committed docs/specs/", () => {
  it("every committed spec is valid (README.md is not a spec)", () => {
    const bad = v.validateSpecs(SPECS_DIR).filter((r) => r.problems.length > 0);
    expect(bad).toEqual([]);
  });

  it("every spec listed under `## Open specs` in PROGRESS.md exists and has valid frontmatter", () => {
    const progress = readFileSync(join(ROOT, "PROGRESS.md"), "utf8");
    const open = /^## Open specs\n([\s\S]*?)(?=^## )/m.exec(progress)?.[1] ?? "";
    const listed = [...open.matchAll(/\(?(docs\/specs\/\d+-[a-z0-9-]+\.md)\)?/g)].map((m) => m[1] as string);
    const bad: string[] = [];
    for (const path of listed) {
      const text = readFileSync(join(ROOT, path), "utf8");
      const p = v.specProblems(v.parseSpecHead(text), { fileName: path.split("/").pop() as string, required: true });
      if (p.length) bad.push(`${path}: ${p.join("; ")}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("specs-frontmatter: the CLI a League draft runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "lexiquest-specs-"));

  it("exits 0 for a valid spec and 1 with a path-prefixed line for an invalid one", () => {
    const good = join(dir, "9-good.md");
    const bad = join(dir, "9-bad.md");
    writeFileSync(good, goodSpec(9, "draft"));
    writeFileSync(bad, goodSpec(9, "ready"));
    expect(execFileSync("node", [VALIDATOR, good], { encoding: "utf8" })).toMatch(/ok/);
    let out = "";
    let code = 0;
    try {
      execFileSync("node", [VALIDATOR, bad], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      code = e.status;
      out = `${e.stdout}${e.stderr}`;
    }
    expect(code).toBe(1);
    expect(out).toMatch(/9-bad\.md: status must start with one of/);
  });
});

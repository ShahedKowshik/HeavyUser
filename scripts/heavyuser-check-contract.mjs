import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const VALID_RISK_AREAS = new Set([
  "auth",
  "calendar",
  "docs",
  "lifecycle",
  "persistence",
  "process",
  "release",
  "retry",
  "scheduler",
  "security",
  "supabase",
  "timer",
  "ui",
  "ui-lifecycle",
]);

export const HIGH_RISK_AREAS = new Set([
  "auth",
  "calendar",
  "lifecycle",
  "persistence",
  "retry",
  "scheduler",
  "security",
  "supabase",
  "timer",
  "ui-lifecycle",
]);

const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export const ALLOWED_STATUSES = new Set(["PASS", "BLOCKED", "NOT RUN", "N/A"]);
export const ALLOWED_EVIDENCE_LAYERS = new Set([
  "code",
  "mocked",
  "local",
  "linked-database",
  "provider-qa",
  "production",
]);

const RISK_PATH_RULES = [
  {
    area: "auth",
    patterns: ["src/app/login/**", "src/app/auth/**", "src/app/api/auth/**", "src/app/settings/**", "src/components/auth-provider.tsx", "src/proxy.ts"],
  },
  {
    area: "calendar",
    patterns: [
      "src/app/api/google/**",
      "src/app/api/spaces/**",
      "src/app/settings/**",
      "src/lib/google/**",
      "src/components/google-calendar-panel.tsx",
      "src/components/spaces-settings.tsx",
    ],
  },
  { area: "scheduler", patterns: ["src/app/api/scheduler/**", "src/app/api/spaces/**", "src/app/settings/**", "src/lib/scheduler/**"] },
  { area: "timer", patterns: ["src/app/page.tsx", "src/app/api/timer/**", "src/lib/timer/**"] },
  { area: "supabase", patterns: ["supabase/**", "src/app/api/spaces/**", "src/app/settings/**", "src/lib/supabase/**"] },
  { area: "persistence", patterns: ["src/app/page.tsx", "src/app/settings/**", "src/lib/task-rules.ts", "src/lib/supabase/tasks.ts"] },
  {
    area: "retry",
    patterns: ["src/app/page.tsx", "src/app/api/google/calendar/webhook/**", "src/lib/google/**", "src/lib/scheduler/**", "src/lib/timer/**"],
  },
  {
    area: "lifecycle",
    patterns: ["src/app/api/spaces/**", "src/app/page.tsx", "src/lib/google/**", "src/lib/scheduler/**", "src/lib/timer/**", "src/components/auth-provider.tsx"],
  },
  {
    area: "ui-lifecycle",
    patterns: ["src/app/page.tsx", "src/app/settings/**"],
  },
  {
    area: "security",
    patterns: [
      ".github/workflows/**",
      "src/app/login/**",
      "src/app/auth/**",
      "src/app/api/auth/**",
      "src/components/auth-provider.tsx",
      "src/proxy.ts",
      "src/lib/security/**",
      "next.config.ts",
      "supabase/migrations/**",
      "supabase/tests/database/**",
      "src/lib/supabase/**",
      ".github/dependabot.yml",
    ],
  },
];

const REQUIRED_HEADINGS = [
  "Goal",
  "Out of scope",
  "Affected systems and risks",
  "Source of truth and ownership",
  "State and failure contract",
  "Concurrency, retries, and time",
  "User-visible recovery",
  "Edge-case and evidence matrix",
  "Rollback and cleanup",
];

function normalizeCell(value) {
  return value.trim().replaceAll("`", "");
}

function splitTableRow(line) {
  const content = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return content.split("|").map((cell) => normalizeCell(cell));
}

function isTableSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function sectionAfterHeading(text, heading) {
  const headingPattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*$`, "mi");
  const match = headingPattern.exec(text);
  if (!match) return "";

  const remainder = text.slice(match.index + match[0].length);
  const nextHeading = remainder.search(/^##\s+/m);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

export function parseContractRows(text) {
  const section = sectionAfterHeading(text, "Edge-case and evidence matrix");
  const tableLines = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (tableLines.length < 3) {
    return { headers: [], rows: [], error: "the edge-case matrix needs a header, separator, and at least one row" };
  }

  const headers = splitTableRow(tableLines[0]).map((header) => header.toLowerCase());
  const separatorIndex = tableLines.findIndex((line) => isTableSeparator(splitTableRow(line)));
  if (separatorIndex < 1) {
    return { headers, rows: [], error: "the edge-case matrix needs a Markdown separator row" };
  }

  const requiredColumns = ["area", "scenario", "expected result", "test/evidence", "layer", "status", "reason or link"];
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length) {
    return { headers, rows: [], error: `the edge-case matrix is missing columns: ${missingColumns.join(", ")}` };
  }

  const rows = tableLines.slice(separatorIndex + 1).map((line) => {
    const cells = splitTableRow(line);
    return {
      cells,
      area: cells[headers.indexOf("area")] ?? "",
      scenario: cells[headers.indexOf("scenario")] ?? "",
      expected: cells[headers.indexOf("expected result")] ?? "",
      evidence: cells[headers.indexOf("test/evidence")] ?? "",
      layer: cells[headers.indexOf("layer")]?.toLowerCase() ?? "",
      status: cells[headers.indexOf("status")]?.toUpperCase() ?? "",
      reason: cells[headers.indexOf("reason or link")] ?? "",
    };
  });

  return { headers, rows, error: null };
}

function patternMatches(file, pattern) {
  const escape = (value) => value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const expression = `^${pattern.split("**").map((part) => escape(part).replaceAll("*", "[^/]*")).join(".*")}$`;
  return new RegExp(expression).test(file);
}

export function inferRiskAreas(changedFiles) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  return [...new Set(
    RISK_PATH_RULES
      .filter(({ patterns }) => files.some((file) => patterns.some((pattern) => patternMatches(file, pattern))))
      .map(({ area }) => area),
  )];
}

function runGit(rootPath, args) {
  return execFileSync("git", args, { cwd: rootPath, encoding: "utf8" }).trim();
}

function isZeroSha(value) {
  return /^0{40}$/.test(value);
}

export function resolveComparisonBase(rootPath, configuredBase = process.env.HEAVYUSER_SCOPE_BASE) {
  const base = configuredBase?.trim();
  if (!base) return { kind: "working-tree", ref: "HEAD" };
  if (!isZeroSha(base)) return { kind: "commit", ref: base };

  return { kind: "empty-tree", ref: EMPTY_TREE_SHA };
}

export function collectChangedFiles(rootPath, configuredBase = process.env.HEAVYUSER_SCOPE_BASE) {
  const comparison = resolveComparisonBase(rootPath, configuredBase);
  const tracked = runGit(rootPath, ["diff", "--name-only", comparison.ref]).split("\n").filter(Boolean);
  const untracked = runGit(rootPath, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

function isRelativePathInsideRoot(rootPath, relativePath) {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\")) return false;
  const absolutePath = resolve(rootPath, relativePath);
  const resolvedRelative = relative(rootPath, absolutePath);
  return resolvedRelative && !resolvedRelative.startsWith("..") && !resolvedRelative.includes("/../");
}

function hasHeading(text, heading) {
  return new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*$`, "mi").test(text);
}

export function isHighRiskManifest(manifest) {
  if (manifest?.mode !== "mutating") return false;
  const riskAreas = Array.isArray(manifest.riskAreas) ? manifest.riskAreas : [];
  return manifest.changeType === "release" || riskAreas.some((area) => HIGH_RISK_AREAS.has(area));
}

export function validateContract({
  manifest,
  root: rootPath,
  changedFiles = [],
  fileExists = existsSync,
  readText = (path) => readFileSync(path, "utf8"),
}) {
  const failures = [];
  const riskAreas = manifest?.riskAreas;
  const declaredRiskAreas = Array.isArray(riskAreas) ? riskAreas : [];
  const highRisk = isHighRiskManifest(manifest);
  const inferredRiskAreas = inferRiskAreas(changedFiles);

  if (manifest?.mode === "mutating" && (!Array.isArray(riskAreas) || riskAreas.length === 0)) {
    failures.push("mutating changes must declare at least one riskAreas entry");
  }

  if (Array.isArray(riskAreas)) {
    const unknown = riskAreas.filter((area) => typeof area !== "string" || !VALID_RISK_AREAS.has(area));
    if (unknown.length) failures.push(`unknown riskAreas: ${unknown.join(", ")}`);
  }

  const missingRiskAreas = inferredRiskAreas.filter((area) => !declaredRiskAreas.includes(area));
  if (missingRiskAreas.length) {
    failures.push(`changed files imply these risk areas: ${inferredRiskAreas.join(", ")}; declare every matching riskAreas entry (missing: ${missingRiskAreas.join(", ")})`);
  }

  const planFile = typeof manifest?.planFile === "string" ? manifest.planFile.trim() : "";
  if (highRisk && !planFile) {
    failures.push("high-risk mutating work must declare planFile");
  }

  const changeId = typeof manifest?.changeId === "string" ? manifest.changeId.trim() : "";
  if ((highRisk || planFile) && !changeId) {
    failures.push(`${highRisk ? "high-risk mutating work" : "a declared contract"} must declare changeId`);
  }

  if (!planFile) return { failures, rows: [], highRisk, inferredRiskAreas };

  if (!isRelativePathInsideRoot(rootPath, planFile)) {
    failures.push("planFile must be a relative path inside the repository");
    return { failures, rows: [], highRisk, inferredRiskAreas };
  }

  if (!planFile.startsWith("docs/qa/changes/")) {
    failures.push("planFile must be stored under docs/qa/changes/");
  }

  const allowedPaths = Array.isArray(manifest?.allowedPaths) ? manifest.allowedPaths : [];
  const invalidAllowedPaths = allowedPaths.filter((pattern) => typeof pattern !== "string");
  if (invalidAllowedPaths.length) {
    failures.push("allowedPaths must contain only string patterns");
  }
  if (!allowedPaths.some((pattern) => typeof pattern === "string" && patternMatches(planFile, pattern))) {
    failures.push(`planFile is outside the declared allowedPaths: ${planFile}`);
  }

  if (!changedFiles.includes(planFile)) {
    failures.push(`planFile must be new or changed in the current work: ${planFile}`);
  }

  const absolutePlanPath = resolve(rootPath, planFile);
  if (!fileExists(absolutePlanPath)) {
    failures.push(`planFile does not exist: ${planFile}`);
    return { failures, rows: [], highRisk, inferredRiskAreas };
  }

  let text;
  try {
    text = readText(absolutePlanPath);
  } catch (error) {
    failures.push(`planFile could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return { failures, rows: [], highRisk, inferredRiskAreas };
  }

  if (changeId) {
    const contractId = /^Change ID:\s*(\S+)\s*$/mi.exec(text)?.[1] ?? "";
    if (!contractId) {
      failures.push("planFile must contain a Change ID line");
    } else if (contractId !== changeId) {
      failures.push(`planFile Change ID does not match manifest changeId: expected ${changeId}, found ${contractId}`);
    }
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!hasHeading(text, heading)) failures.push(`planFile is missing the required heading: ## ${heading}`);
  }

  if (/\b(?:TBD|TODO)\b/i.test(text)) {
    failures.push("planFile still contains TBD or TODO placeholders");
  }

  const parsed = parseContractRows(text);
  if (parsed.error) {
    failures.push(`planFile edge-case matrix: ${parsed.error}`);
    return { failures, rows: [], highRisk, inferredRiskAreas };
  }

  if (parsed.rows.length === 0) {
    failures.push("planFile edge-case matrix must contain at least one scenario row");
  }

  for (const [index, row] of parsed.rows.entries()) {
    const label = `planFile edge-case row ${index + 1}`;
    if (!row.area || !row.scenario || !row.expected || !row.evidence || !row.layer || !row.status) {
      failures.push(`${label} must include area, scenario, expected result, test/evidence, layer, and status`);
    }
    if (!ALLOWED_EVIDENCE_LAYERS.has(row.layer)) {
      failures.push(`${label} has an invalid evidence layer: ${row.layer || "(empty)"}`);
    }
    if (!ALLOWED_STATUSES.has(row.status)) {
      failures.push(`${label} has an invalid status: ${row.status || "(empty)"}`);
    }
    if (["BLOCKED", "NOT RUN", "N/A"].includes(row.status) && !row.reason) {
      failures.push(`${label} must explain ${row.status}`);
    }
  }

  return { failures, rows: parsed.rows, highRisk, inferredRiskAreas };
}

function loadManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`contract check failed: unable to read manifest: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function main() {
  const manifestPath = resolve(root, ".heavyuser/change-manifest.json");
  const manifest = loadManifest(manifestPath);
  const result = validateContract({ manifest, root, changedFiles: collectChangedFiles(root) });

  if (result.failures.length) {
    console.error("contract check failed:");
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  if (result.highRisk) {
    const inferred = result.inferredRiskAreas.length ? `; changed files imply ${result.inferredRiskAreas.join(", ")}` : "";
    console.log(`contract check passed: ${manifest.planFile} contains ${result.rows.length} evidence row${result.rows.length === 1 ? "" : "s"}${inferred}`);
  } else {
    console.log("contract check passed: low-risk or read-only work does not require a filled contract");
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedScript === fileURLToPath(import.meta.url)) main();

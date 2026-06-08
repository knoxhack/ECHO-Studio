import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repoName = path.basename(root);
const ignoredDirs = new Set([".git", "node_modules", "dist", "build", "target", ".gradle", ".next", "installer-artifacts", "release-artifacts", "coverage"]);
const errors = [];

function exists(file) {
  return fs.existsSync(file);
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function markdownFiles() {
  const all = walk(root).filter((file) => /\.(md|mdx)$/i.test(file));
  return all.filter((file) => {
    const r = rel(file);
    if (r.startsWith("reports/") || r.startsWith("publishing/")) return false;
    if (repoName === "ECHO-Modules") {
      return r === "README.md" || r.startsWith("docs/") || /^addons\/[^/]+\/README\.md$/.test(r) || /^addons\/[^/]+\/docs\//.test(r);
    }
    return true;
  });
}

function stripLinkTarget(raw) {
  return raw.trim().replace(/^<|>$/g, "").split(/\s+/)[0].split("#")[0];
}

function isExternal(target) {
  return /^(https?:|mailto:|tel:|app:|#)/i.test(target) || target === "";
}

function candidatePaths(baseDir, target) {
  const decoded = decodeURI(target);
  const base = path.resolve(baseDir, decoded);
  const candidates = [base];
  if (!path.extname(base)) {
    candidates.push(base + ".md", base + ".mdx", path.join(base, "README.md"), path.join(base, "index.md"), path.join(base, "index.mdx"));
  }
  return candidates;
}

for (const file of markdownFiles()) {
  const text = fs.readFileSync(file, "utf8");
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(text))) {
    const target = stripLinkTarget(match[1]);
    if (isExternal(target)) continue;
    if (target.startsWith("/docs/")) {
      const route = path.join(root, target.replace(/^\/docs\//, "docs/"));
      if ([route, route + ".md", route + ".mdx", path.join(route, "index.md"), path.join(route, "index.mdx")].some(exists)) continue;
      errors.push(rel(file) + " links missing route " + target);
      continue;
    }
    if (target.startsWith("/")) {
      const route = path.join(root, "app", target.replace(/^\//, ""));
      if ([route, path.join(route, "page.tsx"), path.join(route, "page.ts"), path.join(route, "page.jsx"), path.join(route, "page.js"), path.join(route, "page.mdx")].some(exists)) continue;
      errors.push(rel(file) + " links missing app route " + target);
      continue;
    }
    if (candidatePaths(path.dirname(file), target).some(exists)) continue;
    errors.push(rel(file) + " links missing " + target);
  }
}

if (!exists(path.join(root, "README.md"))) {
  errors.push("Missing root README.md");
}

const stalePatterns = [/echolabs/i, /ECHOLauncher/, /ECHODEVELOPERSTUDIO/, /standalone showcase/i];
for (const file of markdownFiles()) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of stalePatterns) {
    if (pattern.test(text)) errors.push(rel(file) + " contains stale reference " + pattern);
  }
}

if (repoName === "ECHO-Modules") {
  const addonsDir = path.join(root, "addons");
  for (const entry of fs.readdirSync(addonsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleDir = path.join(addonsDir, entry.name);
    if (!exists(path.join(moduleDir, "README.md"))) errors.push("addons/" + entry.name + " missing README.md");
    if (!exists(path.join(moduleDir, "docs/artifacts.md"))) errors.push("addons/" + entry.name + " missing docs/artifacts.md");
    if (!exists(path.join(moduleDir, "src/main/resources/META-INF/echo.mod.json"))) errors.push("addons/" + entry.name + " missing src/main/resources/META-INF/echo.mod.json");
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Docs audit passed for " + repoName);

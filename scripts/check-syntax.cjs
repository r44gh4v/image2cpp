const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", "node_modules"]);
const targets = [];

function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        if (ignoredDirs.has(entry.name)) {
            continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath);
            continue;
        }

        if (fullPath.endsWith(".js") || fullPath.endsWith(".cjs")) {
            targets.push(fullPath);
        }
    }
}

walk(repoRoot);

if (targets.length === 0) {
    console.log("No JavaScript files found for syntax check.");
    process.exit(0);
}

let hasFailures = false;

for (const filePath of targets) {
    const result = childProcess.spawnSync(process.execPath, ["--check", filePath], {
        encoding: "utf8",
    });

    if (result.status !== 0) {
        hasFailures = true;
        console.error(`Syntax error: ${path.relative(repoRoot, filePath)}`);
        if (result.stderr) {
            console.error(result.stderr.trim());
        }
    }
}

if (hasFailures) {
    process.exit(1);
}

console.log(`Syntax check passed for ${targets.length} files.`);

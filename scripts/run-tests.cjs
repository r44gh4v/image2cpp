const fs = require("fs");
const path = require("path");

const testsDir = path.resolve(__dirname, "..", "tests");
const testFiles = fs
    .readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.cjs"))
    .sort();

if (testFiles.length === 0) {
    console.log("No contract tests found.");
    process.exit(0);
}

let failures = 0;

for (const fileName of testFiles) {
    const fullPath = path.join(testsDir, fileName);
    try {
        require(fullPath);
        console.log(`PASS ${fileName}`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${fileName}`);
        console.error(error && error.stack ? error.stack : error);
    }
}

if (failures > 0) {
    process.exit(1);
}

console.log(`All contract tests passed (${testFiles.length}).`);

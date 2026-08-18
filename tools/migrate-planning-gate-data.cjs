#!/usr/bin/env node
/** One-off mechanical migration of Planning's gate constants into Location Editor. */

const fs = require("node:fs");
const path = require("node:path");

const source = process.argv[2];
const target = process.argv[3];
if (!source || !target) throw new Error("Usage: migrate-planning-gate-data.cjs SOURCE TARGET");
const constants = JSON.parse(fs.readFileSync(source, "utf8"));
const value = {
	schema: "org.ajrm.marine.tidal-gate-seed/v1",
	standardPortId: "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4",
	constants,
};
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);

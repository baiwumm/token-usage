// Build-time snapshot sync (docs/badge.md §2.4, apps/landing/README.md).
//
// Pulls GET /api/badge/data?token=… from the public instance and rewrites
// src/data/snapshot.json, so the static landing page tracks the same
// aggregation the public page renders. The token and origin come from the
// repository README — the same single source src/lib/badge-url.ts parses at
// build time — so nothing is hardcoded here.
//
// Every failure (missing README, offline, non-200, unexpected shape) keeps the
// committed snapshot and exits 0: a static deploy must never be blocked by the
// API. Set TOKEN_USAGE_SNAPSHOT_SYNC=off to skip the network call entirely.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(here, "..");
const README_PATH = join(APP_ROOT, "..", "..", "README.md");
const SNAPSHOT_PATH = join(APP_ROOT, "src", "data", "snapshot.json");
const TIMEOUT_MS = 10_000;

/** Snapshot keys the landing app consumes; provenance fields are dropped. */
const SNAPSHOT_KEYS = [
	"fetchedAt",
	"totals",
	"meta",
	"heatmap",
	"sources",
	"models",
	"series",
];

function warn(message) {
	process.stderr.write(`sync-snapshot: ${message}\n`);
}

function findSource() {
	let readme;

	try {
		readme = readFileSync(README_PATH, "utf8");
	} catch {
		return null;
	}

	// §2.4 数据令牌：优先公开页令牌（README 徽章块的 <a href>，2026-11-14 起每
	// 用户一份公开页，/u/ 只认它）；没有公开页链接时回退徽章令牌（旧 README
	// 兼容，新服务端会 404 → 保留已提交快照并告警）。
	const badgeMatch = readme.match(
		/https:\/\/[^\s"'<>]+\/api\/badge\?token=([A-Za-z0-9_-]+)/,
	);
	const pageMatch = readme.match(
		/https:\/\/[^\s"'<>]+\/u\/(tu_page_[A-Za-z0-9_-]+)/,
	);

	if (!badgeMatch && !pageMatch) return null;

	return {
		origin: new URL((badgeMatch ?? pageMatch)[0]).origin,
		token: (pageMatch ?? badgeMatch)[1],
	};
}

function isFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shape gate: only a fully valid payload may replace the committed file. */
function validate(payload) {
	if (!isRecord(payload) || payload.schemaVersion !== 1) return "schema";
	if (!isRecord(payload.totals)) return "totals";
	const { tokens, costUsd, activeDays } = payload.totals;

	if (!isFiniteNumber(tokens) || !isFiniteNumber(costUsd)) return "totals";
	if (!isFiniteNumber(activeDays)) return "totals";
	if (!isRecord(payload.meta)) return "meta";

	const { sourceCount, modelCount, longestStreakDays } = payload.meta;

	if (!isFiniteNumber(sourceCount)) return "meta";
	if (!isFiniteNumber(modelCount)) return "meta";
	if (!isFiniteNumber(longestStreakDays)) return "meta";
	if (!isRecord(payload.heatmap)) return "heatmap";

	const { from, to, activeDays: heatActiveDays, cells } = payload.heatmap;

	if (typeof from !== "string" || typeof to !== "string") return "heatmap";
	if (!isFiniteNumber(heatActiveDays)) return "heatmap";
	if (!Array.isArray(cells) || cells.length === 0) return "heatmap";

	for (const cell of cells) {
		if (
			!Array.isArray(cell) ||
			cell.length !== 3 ||
			typeof cell[0] !== "string" ||
			!isFiniteNumber(cell[1]) ||
			!isFiniteNumber(cell[2])
		) {
			return "cells";
		}
	}

	if (!Array.isArray(payload.sources) || !Array.isArray(payload.models)) {
		return "rankings";
	}

	for (const source of payload.sources) {
		if (
			!isRecord(source) ||
			typeof source.label !== "string" ||
			!isFiniteNumber(source.tokens) ||
			!isFiniteNumber(source.share)
		) {
			return "sources";
		}
	}

	for (const model of payload.models) {
		if (
			!isRecord(model) ||
			typeof model.label !== "string" ||
			!isFiniteNumber(model.tokens)
		) {
			return "models";
		}
	}

	if (!Array.isArray(payload.series)) return "series";

	return null;
}

async function main() {
	if (process.env.TOKEN_USAGE_SNAPSHOT_SYNC === "off") {
		process.stdout.write("sync-snapshot: skipped (TOKEN_USAGE_SNAPSHOT_SYNC=off)\n");

		return;
	}

	const source = findSource();

	if (!source) {
		warn("no public badge URL in README.md — keeping the committed snapshot");

		return;
	}

	const url =
		process.env.TOKEN_USAGE_SNAPSHOT_URL?.trim() ||
		`${source.origin}/api/badge/data?token=${source.token}`;
	let payload;

	try {
		const response = await fetch(url, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		if (!response.ok) {
			warn(`HTTP ${response.status} from ${url} — keeping the committed snapshot`);

			return;
		}

		payload = await response.json();
	} catch (error) {
		warn(`${error?.message ?? error} — keeping the committed snapshot`);

		return;
	}

	const invalid = validate(payload);

	if (invalid) {
		warn(`unexpected payload (${invalid}) — keeping the committed snapshot`);

		return;
	}

	const next = {};

	for (const key of SNAPSHOT_KEYS) next[key] = payload[key];
	const text = `${JSON.stringify(next, null, "\t")}\n`;

	let current = "";

	try {
		current = readFileSync(SNAPSHOT_PATH, "utf8");
	} catch {
		// Missing file: writing a fresh one is the correct repair.
	}

	if (current === text) {
		process.stdout.write(
			`sync-snapshot: up to date (${next.fetchedAt}, ${next.meta.sourceCount} sources)\n`,
		);

		return;
	}

	writeFileSync(SNAPSHOT_PATH, text);

	process.stdout.write(
		`sync-snapshot: updated to ${next.fetchedAt} (${next.meta.sourceCount} sources, ${next.meta.modelCount} models)\n`,
	);
}

await main();

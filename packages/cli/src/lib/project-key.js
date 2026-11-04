"use strict";

// Contract v2 (docs/cli-contract.md §2.4): the server keeps only the project
// basename for both hourly buckets and sessions. The CLI must apply the same
// rule before it writes a queue row or keys a reconciliation baseline —
// otherwise `owner/repo` and `repo` are two different local identities while
// the cloud stores one, which under-counts same-basename repos and makes
// reconcile report permanent false drift.
//
// This is the single implementation shared by the hourly writer, the session
// uploader and reconcile.
function basenameKey(value) {
  const raw = String(value || "").replace(/[\\/]+$/, "");
  if (!raw || raw === "." || raw === "..") return null;
  const base = raw.split(/[\\/]/).pop().trim();
  if (!base || base === "." || base === "..") return null;
  // Control characters are rejected server-side; strip instead of failing.
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120);
  return clean || null;
}

module.exports = { basenameKey };

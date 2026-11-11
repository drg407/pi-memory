// ---------------------------------------------------------------------------
// Memory-age annotation
//
// Models are poor at date arithmetic: a raw entry stamp
// (<!-- 2026-09-08 19:46:46 [01a08344] -->) requires the model to subtract two
// timestamps to judge freshness, which it does unreliably. Instead, each stamp
// gets a pre-computed human-readable age appended inside the comment
// ("…[01a08344] (13d old) -->"), so injected memory reads as fresh or stale
// without arithmetic.
//
// Stamps are written by index.ts's nowTimestamp() in LOCAL time, so they are
// parsed as local. This is an in-memory rendering concern only: the source
// files are never rewritten with ages, so the stamps stay canonical on disk.
//
// Pure module, zero imports — see test/memory-ages.ts for the hostile-input
// battery (run: node test/memory-ages.ts).
// ---------------------------------------------------------------------------

/**
 * Human-readable age label for a timestamp, relative to `nowMs`.
 * Future timestamps (clock skew) clamp to "just now" — never a negative age.
 */
export function memoryAgeLabel(thenMs: number, nowMs: number): string {
	const diff = nowMs - thenMs;
	if (diff < 90_000) return "just now";
	const min = Math.floor(diff / 60_000);
	if (min < 60) return `${min}min old`;
	const h = Math.floor(diff / 3_600_000);
	if (h < 48) return `${h}h old`;
	const d = Math.floor(diff / 86_400_000);
	if (d < 14) return `${d}d old`;
	if (d < 70) return `${Math.floor(d / 7)}w old`;
	if (d < 730) return `${Math.floor(d / 30)}mo old`;
	return `${Math.floor(d / 365)}y old`;
}

/**
 * Stamp-line shapes accepted (superset of the meta-comment regexes in
 * index.ts): "<!-- 2026-09-21 06:09:27 [01a0c371] -->", with optional
 * "last updated: " or "HANDOFF " prefix. Only exact line matches are touched;
 * stamps quoted or indented elsewhere in the text are left alone.
 */
const STAMP_LINE_REGEX =
	/^<!-- (?:(?:last updated: )?|HANDOFF )?(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) \[[^\]\r\n]+\] -->$/;

/**
 * Annotate every recognized stamp line in `content` with a pre-computed age.
 * Lines with invalid or rolled-over date components (the shape admits month 13,
 * day 45, hour 99) are left untouched.
 */
export function annotateMemoryAges(content: string, nowMs: number = Date.now()): string {
	if (!content.trim()) return content;
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(STAMP_LINE_REGEX);
		if (!m) continue;
		const y = Number(m[1]);
		const mo = Number(m[2]);
		const d = Number(m[3]);
		const h = Number(m[4]);
		const mi = Number(m[5]);
		const s = Number(m[6]);
		const then = new Date(y, mo - 1, d, h, mi, s);
		// Reject rolled-over components: new Date() silently normalizes them.
		if (
			then.getFullYear() !== y ||
			then.getMonth() !== mo - 1 ||
			then.getDate() !== d ||
			then.getHours() !== h ||
			then.getMinutes() !== mi ||
			then.getSeconds() !== s
		) {
			continue;
		}
		lines[i] = lines[i].replace(/ -->$/, ` (${memoryAgeLabel(then.getTime(), nowMs)}) -->`);
	}
	return lines.join("\n");
}

// Hostile-input test for memory-ages.ts.
// Run: node test/memory-ages.ts            # green battery (node >= 22.18)
//       node test/memory-ages.ts --red     # red check: run the battery against
//                                           # a broken copy (rolled-over guard
//                                           # stripped); expects FAILs, exits 0
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RED_FLAG = process.argv.includes("--red");

type AgeModule = typeof import("../memory-ages.ts");
let mod: AgeModule;
if (RED_FLAG) {
	// Build a mutated copy with the rolled-over-component guard stripped,
	// then import THAT, so the battery runs against the broken code.
	const dir = mkdtempSync(join(tmpdir(), "memory-ages-"));
	const src = readFileSync(new URL("../memory-ages.ts", import.meta.url), "utf8");
	const guardStart = src.indexOf("// Reject rolled-over components");
	const guardEnd = src.indexOf("lines[i] = lines[i].replace");
	if (guardStart === -1 || guardEnd === -1 || guardEnd <= guardStart) {
		console.error("MUTATION FAILED — guard text drifted from expected");
		process.exit(2);
	}
	const brokenPath = join(dir, "memory-ages-broken.ts");
	writeFileSync(brokenPath, src.slice(0, guardStart) + src.slice(guardEnd));
	mod = (await import(pathToFileURL(brokenPath).href)) as AgeModule;
} else {
	mod = await import("../memory-ages.ts");
}
const { annotateMemoryAges, memoryAgeLabel } = mod;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) {
		pass++;
		console.log(`ok    ${name}`);
	} else {
		fail++;
		console.log(`FAIL  ${name}  ${detail}`);
	}
}

// Fixed "now": 2026-09-21 12:00:00 local
const NOW = new Date(2026, 8, 21, 12, 0, 0).getTime();
const stamp = (s: string) => `<!-- ${s} [01a0test] -->`;

// --- memoryAgeLabel buckets & edges ---
check("label: zero diff → just now", memoryAgeLabel(NOW, NOW) === "just now");
check("label: 30s → just now", memoryAgeLabel(NOW - 30_000, NOW) === "just now");
check("label: 2h → 2h old", memoryAgeLabel(NOW - 2 * 3_600_000, NOW) === "2h old");
check("label: 5d → 5d old", memoryAgeLabel(NOW - 5 * 86_400_000, NOW) === "5d old");
check("label: 16d → 2w old", memoryAgeLabel(NOW - 16 * 86_400_000, NOW) === "2w old");
check("label: 90d → 3mo old", memoryAgeLabel(NOW - 90 * 86_400_000, NOW) === "3mo old");
check("label: 800d → 2y old", memoryAgeLabel(NOW - 800 * 86_400_000, NOW) === "2y old");
check("label: FUTURE stamp clamps to just now (no negative)", memoryAgeLabel(NOW + 9_000_000, NOW) === "just now");

// --- annotateMemoryAges: positive cases ---
check(
	"annotates plain stamp",
	annotateMemoryAges(stamp("2026-09-18 06:00:00"), NOW) === "<!-- 2026-09-18 06:00:00 [01a0test] (3d old) -->",
);
check(
	"annotates 'last updated:' stamp",
	annotateMemoryAges("<!-- last updated: 2026-09-21 11:00:00 [01a0test] -->", NOW) ===
		"<!-- last updated: 2026-09-21 11:00:00 [01a0test] (1h old) -->",
);
check(
	"annotates HANDOFF stamp",
	annotateMemoryAges("<!-- HANDOFF 2026-09-21 12:00:00 [01a0test] -->", NOW) ===
		"<!-- HANDOFF 2026-09-21 12:00:00 [01a0test] (just now) -->",
);
check(
	"future stamp → just now, never negative",
	annotateMemoryAges(stamp("2026-09-22 12:00:00"), NOW) === "<!-- 2026-09-22 12:00:00 [01a0test] (just now) -->",
);
const multi = [stamp("2026-09-01 00:00:00"), "body line", stamp("2026-09-21 00:00:00")].join("\n");
check(
	"multi-line: both stamps, body untouched",
	annotateMemoryAges(multi, NOW) ===
		"<!-- 2026-09-01 00:00:00 [01a0test] (2w old) -->\nbody line\n<!-- 2026-09-21 00:00:00 [01a0test] (12h old) -->",
);

// --- hostile inputs ---
check("empty string → unchanged", annotateMemoryAges("", NOW) === "");
check("whitespace-only → unchanged", annotateMemoryAges("   \n  ", NOW) === "   \n  ");
check("no stamps → unchanged", annotateMemoryAges("just text\nand more", NOW) === "just text\nand more");
check(
	"indented stamp (quoted line) untouched",
	annotateMemoryAges(`\t${stamp("2026-09-01 00:00:00")}`, NOW) === `\t${stamp("2026-09-01 00:00:00")}`,
);
check(
	"stamp missing session id untouched",
	annotateMemoryAges("<!-- 2026-09-01 00:00:00 -->", NOW) === "<!-- 2026-09-01 00:00:00 -->",
);
check(
	"month 13 (rolled-over) untouched",
	annotateMemoryAges(stamp("2026-13-01 00:00:00"), NOW) === stamp("2026-13-01 00:00:00"),
);
check(
	"day 45 (rolled-over) untouched",
	annotateMemoryAges(stamp("2026-09-45 00:00:00"), NOW) === stamp("2026-09-45 00:00:00"),
);
check(
	"hour 99 (rolled-over) untouched",
	annotateMemoryAges(stamp("2026-09-01 99:00:00"), NOW) === stamp("2026-09-01 99:00:00"),
);
check(
	"year 0000 (rolled-over) untouched",
	annotateMemoryAges(stamp("0000-01-01 00:00:00"), NOW) === stamp("0000-01-01 00:00:00"),
);
check("non-stamp comment untouched", annotateMemoryAges("<!-- note -->", NOW) === "<!-- note -->");
check(
	"stamp embedded mid-line untouched",
	annotateMemoryAges(`see ${stamp("2026-09-01 00:00:00")} inline`, NOW) ===
		`see ${stamp("2026-09-01 00:00:00")} inline`,
);
check(
	"already-annotated line cannot stack (rejected)",
	annotateMemoryAges("<!-- 2026-09-01 00:00:00 [01a0test] (3w old) -->", NOW) ===
		"<!-- 2026-09-01 00:00:00 [01a0test] (3w old) -->",
);

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed${RED_FLAG ? " (RED MODE — failures expected)" : ""}`);
process.exit(RED_FLAG ? (fail > 0 ? 0 : 1) : fail === 0 ? 0 : 1);

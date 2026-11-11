// Child process for the cross-process write race test (spawned by unit.test.ts).
// argv: <memoryDir> <writerId> <count> <target daily|long_term>
import ext, { _setBaseDir } from "../index.ts";

const [dir, id, count, target] = process.argv.slice(2);
_setBaseDir(dir);
const tools: Record<string, any> = {};
ext({
	registerTool: (t: any) => {
		tools[t.name] = t;
	},
	on: () => {},
	registerCommand: () => {},
} as any);
const ctx = { sessionManager: { getSessionId: () => `race${id}000000000000` }, hasUI: false, ui: { notify() {} } };
for (let i = 0; i < Number(count); i++) {
	await tools.memory_write.execute(`c${i}`, { target, content: `W${id}-${i}` }, null, null, ctx);
}
process.exit(0);

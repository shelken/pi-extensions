// 把第一次发给 provider 的 payload 原样写到 $PROBE_OUT，供 pi-context 统计
import { existsSync, writeFileSync } from "node:fs";

export default function (pi: any) {
	pi.on("before_provider_request", (event: any) => {
		const out = process.env.PROBE_OUT;
		if (out && !existsSync(out)) writeFileSync(out, JSON.stringify(event.payload));
	});
}

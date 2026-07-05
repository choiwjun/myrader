/**
 * X-SAG Core Engine — v2/backlink barrel export
 *
 * Phase R-D: 백링크/도메인 권위 어댑터 (휴리스틱 + 외부 API 스텁).
 */

export type {
	BacklinkAdapter,
	BacklinkInput,
	BacklinkResult,
	BacklinkSignals,
	BacklinkSource,
} from "./types.js";

export {
	BacklinkAdapterChain,
	createBacklinkAdapter,
} from "./adapter.js";

export { HeuristicBacklinkProvider } from "./providers/heuristic.js";
export { AhrefsBacklinkProvider } from "./providers/ahrefs.js";
export { MozBacklinkProvider } from "./providers/moz.js";
export { MockBacklinkProvider } from "./providers/mock.js";

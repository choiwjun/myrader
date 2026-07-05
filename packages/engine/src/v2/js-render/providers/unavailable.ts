/**
 * Unavailable JS render provider.
 *
 * Returned when browser rendering was requested implicitly but Playwright is not
 * installed. This keeps launch-readiness checks from mistaking mock HTML for a
 * real rendered page.
 */

import type { JsRenderAdapter, RenderOptions, RenderResult } from "../types.js";

export class UnavailableJsRenderProvider implements JsRenderAdapter {
	readonly name = "unavailable" as const;

	isAvailable(): boolean {
		return false;
	}

	async fetchRendered(
		_url: string,
		_opts?: RenderOptions,
	): Promise<RenderResult> {
		throw new Error(
			"JS render adapter unavailable: playwright is not installed",
		);
	}
}

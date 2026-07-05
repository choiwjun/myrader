/**
 * PlaywrightProvider availability tests.
 *
 * The provider is ESM, so optional peer detection must not rely on a global
 * CommonJS `require`.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { PlaywrightProvider } from "../../../v2/js-render/providers/playwright.js";

const resolveOptionalPeer = createRequire(import.meta.url);

function canResolvePlaywright(): boolean {
	try {
		resolveOptionalPeer.resolve("playwright");
		return true;
	} catch {
		return false;
	}
}

describe("PlaywrightProvider", () => {
	it("reports availability from ESM optional peer resolution", () => {
		const provider = new PlaywrightProvider();

		expect(provider.isAvailable()).toBe(canResolvePlaywright());
	});
});

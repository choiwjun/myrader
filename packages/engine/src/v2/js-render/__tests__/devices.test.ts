/**
 * X-SAG Core Engine v2 — Device Presets Tests
 *
 * Phase O-C: 디바이스 프리셋 유효성 검증
 */

import { describe, expect, it } from "vitest";
import {
	DEVICES,
	type DeviceId,
	getDesktopDevices,
	getDevicePreset,
	getMobileDevices,
	getTabletDevices,
} from "../devices.js";

describe("Device Presets", () => {
	it("should have valid device presets with required fields", () => {
		const deviceIds = Object.keys(DEVICES) as DeviceId[];

		expect(deviceIds.length).toBeGreaterThan(0);

		for (const deviceId of deviceIds) {
			const preset = DEVICES[deviceId];

			// Validate structure
			expect(preset).toHaveProperty("name");
			expect(preset).toHaveProperty("viewport");
			expect(preset).toHaveProperty("userAgent");
			expect(preset).toHaveProperty("deviceScaleFactor");
			expect(preset).toHaveProperty("isMobile");
			expect(preset).toHaveProperty("hasTouch");

			// Validate types
			expect(typeof preset.name).toBe("string");
			expect(preset.name.length).toBeGreaterThan(0);

			expect(typeof preset.viewport.width).toBe("number");
			expect(typeof preset.viewport.height).toBe("number");
			expect(preset.viewport.width).toBeGreaterThan(0);
			expect(preset.viewport.height).toBeGreaterThan(0);

			expect(typeof preset.userAgent).toBe("string");
			expect(preset.userAgent.length).toBeGreaterThan(0);

			expect(typeof preset.deviceScaleFactor).toBe("number");
			expect(preset.deviceScaleFactor).toBeGreaterThan(0);

			expect(typeof preset.isMobile).toBe("boolean");
			expect(typeof preset.hasTouch).toBe("boolean");
		}
	});

	it("should distinguish mobile and desktop devices", () => {
		const mobilePresets = Object.entries(DEVICES)
			.filter(([_, p]) => p.isMobile)
			.map(([id]) => id);
		const desktopPresets = Object.entries(DEVICES)
			.filter(([_, p]) => !p.isMobile)
			.map(([id]) => id);

		expect(mobilePresets.length).toBeGreaterThan(0);
		expect(desktopPresets.length).toBeGreaterThan(0);

		// Mobile devices should have touch
		mobilePresets.forEach((id) => {
			expect(DEVICES[id as DeviceId].hasTouch).toBe(true);
		});

		// Desktop devices should not have touch
		desktopPresets.forEach((id) => {
			expect(DEVICES[id as DeviceId].hasTouch).toBe(false);
		});
	});

	it("should have iOS and Android user agents", () => {
		const userAgents = Object.values(DEVICES).map((p) => p.userAgent);

		const hasIOS = userAgents.some(
			(ua) => ua.includes("iPhone") || ua.includes("iPad"),
		);
		const hasAndroid = userAgents.some((ua) => ua.includes("Android"));

		expect(hasIOS).toBe(true);
		expect(hasAndroid).toBe(true);
	});

	it("should have Korean market devices", () => {
		// 한국 시장 주요 디바이스 확인
		const hasKoreanDefault = "korean-mobile-default" in DEVICES;
		const hasGalaxyS24 = "galaxy-s24" in DEVICES;
		const hasGalaxyS23 = "galaxy-s23" in DEVICES;
		const hasIPhone14 = "iphone-14" in DEVICES;

		expect(hasKoreanDefault).toBe(true);
		expect(hasGalaxyS24).toBe(true);
		expect(hasGalaxyS23).toBe(true);
		expect(hasIPhone14).toBe(true);
	});

	describe("getDevicePreset", () => {
		it("should return device preset by ID", () => {
			const preset = getDevicePreset("iphone-14");

			expect(preset).toBeDefined();
			expect(preset.name).toContain("iPhone");
			expect(preset.isMobile).toBe(true);
			expect(preset.hasTouch).toBe(true);
		});

		it("should return Galaxy device with correct properties", () => {
			const preset = getDevicePreset("galaxy-s24");

			expect(preset).toBeDefined();
			expect(preset.name).toContain("Galaxy S24");
			expect(preset.viewport.width).toBe(360);
			expect(preset.viewport.height).toBe(800);
			expect(preset.userAgent).toContain("Android");
		});
	});

	describe("getMobileDevices", () => {
		it("should return all mobile devices", () => {
			const mobiles = getMobileDevices();

			expect(mobiles.length).toBeGreaterThan(0);

			mobiles.forEach(([id, preset]) => {
				expect(preset.isMobile).toBe(true);
				expect(preset.hasTouch).toBe(true);
			});
		});

		it("should not include desktop devices", () => {
			const mobiles = getMobileDevices();
			const mobileIds = mobiles.map(([id]) => id);

			expect(mobileIds).not.toContain("desktop-1280");
			expect(mobileIds).not.toContain("desktop-1920");
		});
	});

	describe("getTabletDevices", () => {
		it("should return tablet devices", () => {
			const tablets = getTabletDevices();

			expect(tablets.length).toBeGreaterThan(0);

			tablets.forEach(([id, preset]) => {
				expect(preset.isMobile).toBe(true);
				// Tablets have larger viewports than phones
				const area = preset.viewport.width * preset.viewport.height;
				expect(area).toBeGreaterThan(300 * 600); // Rough minimum for tablet
			});
		});
	});

	describe("getDesktopDevices", () => {
		it("should return all desktop devices", () => {
			const desktops = getDesktopDevices();

			expect(desktops.length).toBeGreaterThan(0);

			desktops.forEach(([id, preset]) => {
				expect(preset.isMobile).toBe(false);
				expect(preset.hasTouch).toBe(false);
			});
		});
	});

	it("should have viewport aspect ratios typical for device types", () => {
		const iphone14 = getDevicePreset("iphone-14");
		const iphone14Ratio = iphone14.viewport.width / iphone14.viewport.height;

		// iPhones typically have tall aspect ratio (< 0.5)
		expect(iphone14Ratio).toBeLessThan(0.5);

		const desktop1280 = getDevicePreset("desktop-1280");
		const desktopRatio =
			desktop1280.viewport.width / desktop1280.viewport.height;

		// Desktops typically have wider aspect ratio (> 1)
		expect(desktopRatio).toBeGreaterThan(1);
	});

	it("should have device scale factors matching device types", () => {
		// Desktops: 1x
		expect(getDevicePreset("desktop-1280").deviceScaleFactor).toBe(1);

		// Tablets: 2x
		expect(getDevicePreset("ipad-air").deviceScaleFactor).toBe(2);

		// Modern phones: 3x
		expect(getDevicePreset("iphone-14").deviceScaleFactor).toBe(3);
		expect(getDevicePreset("galaxy-s24").deviceScaleFactor).toBe(3);
	});
});

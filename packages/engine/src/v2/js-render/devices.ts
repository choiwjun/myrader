/**
 * X-SAG Core Engine v2 — Device Presets for Playwright Emulation
 *
 * 디바이스별 viewport, User-Agent, deviceScaleFactor 를 정의.
 * 한국 시장 주요 디바이스 (iPhone, Galaxy S 시리즈) 우선.
 *
 * Phase O-C: 모바일/태블릿 emulation + 디바이스별 진단 차이 검증
 */

// ---------------------------------------------------------------------------
// DevicePreset Interface
// ---------------------------------------------------------------------------

export interface DevicePreset {
	/** 디바이스 이름 (사용자 표시용) */
	name: string;
	/** Playwright viewport 크기 */
	viewport: { width: number; height: number };
	/** User-Agent 문자열 */
	userAgent: string;
	/** CSS pixel ratio (1 = 1x, 2 = 2x, 3 = 3x) */
	deviceScaleFactor: number;
	/** 모바일 디바이스인지 여부 */
	isMobile: boolean;
	/** 터치 지원 여부 */
	hasTouch: boolean;
}

// ---------------------------------------------------------------------------
// DEVICES — 디바이스 프리셋 카탈로그
// ---------------------------------------------------------------------------

export const DEVICES = {
	// 데스크탑 — 1280x800 / 1920x1080
	"desktop-1280": {
		name: "Desktop 1280×800",
		viewport: { width: 1280, height: 800 },
		userAgent:
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		deviceScaleFactor: 1,
		isMobile: false,
		hasTouch: false,
	},
	"desktop-1920": {
		name: "Desktop 1920×1080",
		viewport: { width: 1920, height: 1080 },
		userAgent:
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		deviceScaleFactor: 1,
		isMobile: false,
		hasTouch: false,
	},

	// 태블릿 — iPad / Galaxy Tab
	"ipad-air": {
		name: "iPad Air (5th gen)",
		viewport: { width: 1024, height: 1366 },
		userAgent:
			"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
	},
	"galaxy-tab-s9": {
		name: "Samsung Galaxy Tab S9",
		viewport: { width: 800, height: 1280 },
		userAgent:
			"Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
	},

	// 모바일 — 한국 시장 주요 모델
	"iphone-14": {
		name: "Apple iPhone 14",
		viewport: { width: 390, height: 844 },
		userAgent:
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	},
	"iphone-15-pro": {
		name: "Apple iPhone 15 Pro",
		viewport: { width: 393, height: 852 },
		userAgent:
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	},
	"galaxy-s24": {
		name: "Samsung Galaxy S24",
		viewport: { width: 360, height: 800 },
		userAgent:
			"Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	},
	"galaxy-s23": {
		name: "Samsung Galaxy S23",
		viewport: { width: 360, height: 800 },
		userAgent:
			"Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	},
	"pixel-7": {
		name: "Google Pixel 7",
		viewport: { width: 412, height: 915 },
		userAgent:
			"Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	},

	// 한국 시장 기본 모바일 프리셋 (Galaxy S24 기준)
	"korean-mobile-default": {
		name: "한국 모바일 (Galaxy S24 기준)",
		viewport: { width: 360, height: 800 },
		userAgent:
			"Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	},
} as const;

// ---------------------------------------------------------------------------
// DeviceId — 모든 가능한 디바이스 ID의 union type
// ---------------------------------------------------------------------------

export type DeviceId = keyof typeof DEVICES;

// ---------------------------------------------------------------------------
// Device Preset Getters
// ---------------------------------------------------------------------------

/**
 * 디바이스 ID로 프리셋 조회.
 * @param deviceId 디바이스 ID (예: "iphone-14")
 * @returns DevicePreset 또는 undefined (존재하지 않으면)
 */
export function getDevicePreset(deviceId: DeviceId): DevicePreset {
	return DEVICES[deviceId];
}

/**
 * 모든 모바일 디바이스 프리셋 반환.
 */
export function getMobileDevices(): [DeviceId, DevicePreset][] {
	return (Object.entries(DEVICES) as [DeviceId, DevicePreset][]).filter(
		([_, preset]) => preset.isMobile,
	);
}

/**
 * 모든 태블릿 디바이스 프리셋 반환.
 */
export function getTabletDevices(): [DeviceId, DevicePreset][] {
	return getMobileDevices().filter(([_, preset]) => {
		const width = preset.viewport.width;
		const height = preset.viewport.height;
		const diagonalInch = Math.sqrt(width * width + height * height) / 163; // 대략적인 대각선 길이 (인치)
		return diagonalInch > 5 && diagonalInch < 10;
	});
}

/**
 * 모든 데스크탑 디바이스 프리셋 반환.
 */
export function getDesktopDevices(): [DeviceId, DevicePreset][] {
	return (Object.entries(DEVICES) as [DeviceId, DevicePreset][]).filter(
		([_, preset]) => !preset.isMobile,
	);
}

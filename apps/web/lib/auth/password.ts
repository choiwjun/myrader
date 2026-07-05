// @TASK P1-R1 - 비밀번호 해시 (scrypt, 외부 의존성 0)
// @SPEC docs/planning/04-database-design.md (accounts.password_hash)
// @SPEC .claude/skills (Guardrails: md5/sha1 금지 — KDF 사용)
//
// node:crypto scrypt 로 비밀번호를 해시한다(전용 KDF, salt 포함).
// 저장 포맷: scrypt$N$r$p$<saltHex>$<hashHex> — verify 시 파라미터를 복원한다.
// md5/sha1 같은 약한 해시는 금지(Guardrails). bcrypt 등 외부 패키지 미설치이므로
// 표준 라이브러리 scrypt 로 안전하게 처리한다.

import { type ScryptOptions, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/**
 * scrypt 를 Promise 로 감싼다(옵션 오버로드 포함).
 * promisify 의 타입이 옵션 인자를 잃어버려, 옵션을 받는 시그니처를 직접 래핑한다.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// scrypt 파라미터(OWASP 권고 기준 메모리-하드 설정).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

/** 평문 비밀번호를 salt 포함 scrypt 해시 문자열로 만든다. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** 평문 비밀번호가 저장된 해시와 일치하는지 상수시간 비교한다. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!saltHex || !hashHex || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(plain, salt, expected.length, { N: n, r, p });

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readAppSource(relativePath: string): string {
  return readFileSync(join(__dirname, "../../app", relativePath), "utf-8");
}

describe("A0-7: removed paywall flow follows the current planning scope", () => {
  it("free users continue to the writing workflow instead of a checkout path", () => {
    function resolveLockedResultTarget(isPaid: boolean): string {
      return isPaid ? "/rivals" : "/write";
    }

    expect(resolveLockedResultTarget(false)).toBe("/write");
    expect(resolveLockedResultTarget(false)).not.toBe("/checkout");
  });

  it("login return targets preserve the product workflow instead of chaining through checkout", () => {
    const returnTo = "/write?diagnosisId=diag-123";
    const loginUrl = `/login?returnTo=${encodeURIComponent(returnTo)}`;

    expect(decodeURIComponent(loginUrl)).toContain("/write");
    expect(decodeURIComponent(loginUrl)).not.toContain("/checkout");
  });

  it("checkout page is only a compatibility redirect", () => {
    const source = readAppSource("(app)/checkout/page.tsx");

    expect(source).toContain('redirect("/home")');
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("useRouter");
    expect(source).not.toContain("useSearchParams");
  });
});

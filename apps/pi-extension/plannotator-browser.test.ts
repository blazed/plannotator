import { describe, expect, test } from "bun:test";
import { shouldUseLocalPrCheckout } from "./plannotator-browser";

describe("shouldUseLocalPrCheckout", () => {
	test("uses local PR checkout by default for non-JJ repos", () => {
		expect(shouldUseLocalPrCheckout({})).toBe(true);
		expect(shouldUseLocalPrCheckout({ detectedVcsType: "git" })).toBe(true);
		expect(shouldUseLocalPrCheckout({ useLocal: true, detectedVcsType: "git" })).toBe(true);
	});

	test("honors the Pi --no-local opt-out", () => {
		expect(shouldUseLocalPrCheckout({ useLocal: false })).toBe(false);
	});

	test("does not use Git local checkout behavior in JJ repos without --git", () => {
		expect(shouldUseLocalPrCheckout({ detectedVcsType: "jj" })).toBe(false);
		expect(shouldUseLocalPrCheckout({ useLocal: true, detectedVcsType: "jj" })).toBe(false);
	});

	test("allows JJ PR local checkout only when Git mode is explicit", () => {
		expect(shouldUseLocalPrCheckout({ vcsType: "git", detectedVcsType: "jj" })).toBe(true);
		expect(shouldUseLocalPrCheckout({ vcsType: "git", useLocal: true, detectedVcsType: "jj" })).toBe(true);
		expect(shouldUseLocalPrCheckout({ vcsType: "git", useLocal: false, detectedVcsType: "jj" })).toBe(false);
	});
});

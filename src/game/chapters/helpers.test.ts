// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lines } from "./helpers";

describe("lines", () => {
	it("多行用換行接起來，結尾補一個換行", () => {
		expect(lines("第一行", "第二行")).toBe("第一行\n第二行\n");
	});

	it("單行也補結尾換行", () => {
		expect(lines("只有一行")).toBe("只有一行\n");
	});

	it("空字串保留成空行", () => {
		expect(lines("a", "", "b")).toBe("a\n\nb\n");
	});
});

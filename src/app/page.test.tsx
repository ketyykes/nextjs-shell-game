import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
	it("顯示 Click me 按鈕", () => {
		render(<HomePage />);
		expect(screen.getByRole("button", { name: "Click me" })).toBeDefined();
	});
});

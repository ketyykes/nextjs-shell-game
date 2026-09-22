import { expect, test } from "@playwright/test";

test("首頁顯示 Click me 按鈕", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("button", { name: "Click me" })).toBeVisible();
});

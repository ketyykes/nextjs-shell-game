import { expect, test } from "@playwright/test";
import { enterPlay, seedSave, TERMINALS_PER_CHAPTER, walkToTerminal } from "./helpers/deck";

/**
 * NOVA 看狀態（設計文件 4.14）：第五章安全管制台保留了回滾當下的 NOVA_DIR，玩家用 echo 重現那三秒，
 * unset NOVA_DIR 時 NOVA 在終端機裡插一句；同一章再做一次不再說。
 */

/** 第一到四章全部過關，加上第五章前三台。 */
function solvedBeforeSecurity(): string[] {
	const solved: string[] = [];
	for (let chapter = 1; chapter <= 4; chapter += 1) {
		for (let index = 1; index <= TERMINALS_PER_CHAPTER; index += 1) {
			solved.push(`ch${chapter}-t${index}`);
		}
	}
	return [...solved, "ch5-t1", "ch5-t2", "ch5-t3"];
}

const UNSET_LINE = "NOVA_DIR 空了。現在那行 rm 會從 / 開始刪。……三年前，沒有人提醒那個工程師。";

test("第五章安全管制台：echo 看到 /opt/nova/，unset NOVA_DIR 之後只剩 /，NOVA 插一句，同一章不再說", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	await seedSave(page, {
		chapter: 5,
		solvedTerminals: solvedBeforeSecurity(),
		flags: ["ch5.introShown"],
	});
	await enterPlay(page);

	await walkToTerminal(page, 3, "安全管制台");
	await page.keyboard.press("e");
	const modal = page.getByTestId("terminal-modal");
	await expect(modal).toBeVisible();
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();

	async function run(command: string): Promise<void> {
		await input.fill(command);
		await input.press("Enter");
	}

	await run("cat audit_note.txt");
	await expect(modal).toContainText("把 rm 換成 echo");

	await run('echo "$NOVA_DIR/"');
	await expect(modal).toContainText("/opt/nova/");

	await run("unset NOVA_DIR");
	const reaction = modal.getByTestId("dialogue-block").filter({ hasText: UNSET_LINE });
	await expect(reaction).toHaveCount(1);

	await run('echo "$NOVA_DIR/"');
	// 最後一道指令的區塊：第一行是提示符加指令，接著只有一行 /
	const lastCommand = modal.locator('[data-entry-kind="command"]').last();
	await expect(lastCommand.locator(":scope > div")).toHaveText([/echo "\$NOVA_DIR\/"$/, "/"]);

	// 同一章再做一次：不再說
	await run("export NOVA_DIR=/opt/nova");
	await run("unset NOVA_DIR");
	await expect(modal.locator('[data-entry-kind="command"]')).toHaveCount(6);
	await expect(reaction).toHaveCount(1);

	// 選讀：目標沒有因此達成
	await expect(page.getByTestId("objective-progress")).toHaveText(`3/${TERMINALS_PER_CHAPTER}`);
	expect(pageErrors).toEqual([]);
});

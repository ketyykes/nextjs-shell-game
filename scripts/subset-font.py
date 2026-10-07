#!/usr/bin/env python3
"""Fusion Pixel 字型子集化（pnpm font:subset）。

全字型 931KB 是首載最大單一資產，但遊戲顯示的中文字全部寫在 src 的程式碼裡，
掃出來做子集就夠了。玩家在輸入列亂打的罕用字會 fallback 到系統字型（可讀，只是不是像素風）。

流程：
1. 掃 src/**/*.ts、*.tsx（排除 .test.）字串裡的所有非 ASCII 字元。
2. 加上 ASCII 可見字元當保底。
3. pyftsubset 產出 .subset.woff2（fonts.ts 指向它，全字型檔留著給下次重跑）。
4. 寫 subset-chars.txt 字元清單，`src/app/fonts/subset.test.ts` 用它守護：
   劇本新增了子集沒有的字時測試會紅，提醒重跑本腳本。

需要 fonttools 與 brotli：python3 -m pip install --user fonttools brotli
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
FONT_DIR = SRC / "app" / "fonts"
FULL_FONT = FONT_DIR / "fusion-pixel-12px-proportional-zh_hant.woff2"
SUBSET_FONT = FONT_DIR / "fusion-pixel-12px-proportional-zh_hant.subset.woff2"
MANIFEST = FONT_DIR / "subset-chars.txt"


def collect_chars() -> set[str]:
    chars: set[str] = set()
    for path in SRC.rglob("*"):
        if path.suffix not in {".ts", ".tsx"} or ".test." in path.name:
            continue
        for char in path.read_text(encoding="utf8"):
            if ord(char) > 0x7E:
                chars.add(char)
    # ASCII 可見字元與空白當保底（終端機的英數內容）
    chars.update(chr(code) for code in range(0x20, 0x7F))
    return chars


def main() -> None:
    chars = collect_chars()
    text = "".join(sorted(chars))
    MANIFEST.write_text(text + "\n", encoding="utf8")

    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(FULL_FONT),
            f"--text-file={MANIFEST}",
            "--flavor=woff2",
            f"--output-file={SUBSET_FONT}",
            # 像素字型沒有 hinting；layout 功能保留預設即可
        ],
        check=True,
    )

    before = FULL_FONT.stat().st_size
    after = SUBSET_FONT.stat().st_size
    print(f"字元 {len(chars)} 個；{before / 1000:.0f}KB → {after / 1000:.0f}KB（省 {1 - after / before:.0%}）")


if __name__ == "__main__":
    main()

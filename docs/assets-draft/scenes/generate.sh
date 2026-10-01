#!/bin/zsh
# 第一章八張插圖的 codex 批次產圖腳本（M6-1）。
# 先產冷凍艙當風格基準，其餘用 -i 附它當參考圖。原圖 *-original.png 不進版控，縮圖另外做。
set -u
cd "$(dirname "$0")"
PREFIX="16-bit 像素風遊戲插圖，廢棄太空站 Kepler-9 的室內場景，冷藍色調搭配少量琥珀色警示燈，低亮度、死寂、心理恐怖氣氛，帶輕微 CRT 掃描線質感，橫向 16:9 構圖，沒有任何人物或人臉。"
typeset -A SCENES
SCENES=(
  cryo "冷凍艙：六個直立式冷凍艙排成一列，其中第六個艙門敞開、內部結霜還在冒冷氣，其他五個是空的，天花板一盞燈忽明忽暗，地上有薄霜。"
  lifesupport "維生艙：牆面布滿管線與氧氣壓力表，中央一台監控台螢幕顯示波形，一個表的指針打到紅區，角落的通風口透出微光。"
  quarters "宿舍：兩張上下鋪，一張床鋪整齊、另一張凌亂且貼滿手寫便條，桌上一台小終端機還亮著，牆上有一張被撕掉一角的名單。"
  medbay "醫療艙：一張檢查床、玻璃藥櫃、一台閃爍的病歷螢幕，吊架上的點滴袋空了，地面有一道拖痕通往門口。"
  power "配電室：整面牆的斷路器面板，其中標著 B3 的一組開關跳脫並冒出細小火花，警示燈紅色旋轉，地板電纜雜亂。"
  airlock "主艙門：巨大的氣密艙門上有 DECK 2 的標示，門縫透出遠方走廊的燈光一盞盞延伸到深處，門邊一台控制台亮著綠燈。"
  intro "開場過場：從冷凍艙內部往外看的視角，艙門正在打開，玻璃上結霜與水珠，外面是昏暗閃爍的冷凍艙室，一片寂靜。"
  outro "結尾過場：長走廊往遠方延伸、燈一盞盞亮向深處，走廊盡頭隱約有個模糊的小小剪影站著，而觀者身後的冷凍艙門正在緩緩關上。"
)
ORDER=(cryo lifesupport quarters medbay power airlock intro outro)
for name in $ORDER; do
  out="scene-${name}-original.png"
  if [[ -f "$out" ]]; then echo "skip $name (exists)"; continue; fi
  echo "=== $name $(date +%H:%M:%S) ==="
  if [[ "$name" == "cryo" ]]; then
    codex exec --skip-git-repo-check -s workspace-write -- <<PROMPT
請用你的 image_generation 工具產生一張圖：${PREFIX} ${SCENES[$name]} 產生後把圖片存成目前目錄下的 ${out}，最後回報實際存檔的絕對路徑與圖片尺寸。
PROMPT
  else
    codex exec --skip-git-repo-check -s workspace-write -i scene-cryo-original.png -- <<PROMPT
附上的圖是這個遊戲已定稿的冷凍艙插圖，請沿用它的像素密度、配色與光線風格。請用你的 image_generation 工具產生一張圖：${PREFIX} ${SCENES[$name]} 產生後把圖片存成目前目錄下的 ${out}，最後回報實際存檔的絕對路徑與圖片尺寸。
PROMPT
  fi
  echo "=== done $name $(date +%H:%M:%S) exit=$? ==="
done
ls -la

import Phaser from "phaser";
import { ASSET_KEYS, CAMERA_ZOOM, MAP_LAYERS, MAP_OBJECT_LAYER, TILESET_NAME } from "../constants";
import { AudioManager, attachAudioEvents } from "../audio";
import { emitGameEvent, onGameEvent } from "../EventBus";
import type { RoomId } from "../events";
import { airlockTilePosition, powerOnOrder, shadowFlashPosition } from "../objects/effects";
import { LightMask } from "../objects/LightMask";
import { Player } from "../objects/Player";
import { RoomTracker } from "../objects/RoomTracker";
import { ShadowFigure } from "../objects/ShadowFigure";
import { TerminalZones } from "../objects/TerminalZone";
import { REGISTRY_KEYS, SCENE_KEYS } from "./keys";
import {
	parseMapMarkers,
	type DoorMarker,
	type SpawnPoint,
	type TerminalMarker,
	type TiledObject,
} from "./mapObjects";

/** 艙區範圍，包成 Phaser 的矩形方便做 `contains` 判定。 */
export interface StationRoom {
	roomId: RoomId;
	rect: Phaser.Geom.Rectangle;
}

/** 鏡頭跟隨的平滑係數（0 到 1，越小越慢跟上）。 */
const CAMERA_FOLLOW_LERP = 0.1;

/** 這些 tile index 不碰撞：-1 是空格，0 保留給「無 tile」。 */
const NON_COLLIDING_INDEXES = [-1, 0];

// ---- 過關演出（M4-3） ----

/** 配電箱：過關後燈一盞盞亮起、走廊盡頭人影閃現（設計文件 4.4 第 4 列）。 */
const POWER_TERMINAL_ID = "ch1-t4";
/** 艙門控制台：過關後主艙門打開（設計文件 4.4 第 6 列）。 */
const AIRLOCK_TERMINAL_ID = "ch1-t6";
/** 主艙門在地圖 `markers` 層的 doorId。 */
const AIRLOCK_DOOR_ID = "airlock";
/** 亮燈序列的起點艙區。 */
const POWER_ROOM_ID: RoomId = "power";
/** 人影出現在這間艙區亮起的那一刻。 */
const SHADOW_ROOM_ID: RoomId = "corridor";
/** 亮燈序列每間艙區的間隔（ms）。 */
const POWER_ON_STEP_MS = 450;
/** 人影夾在視野內時離畫面邊緣的距離（px），避免剛好貼在邊上被裁掉。 */
const SHADOW_VIEW_MARGIN = 48;
/** 開門時鏡頭閃一下全息藍（#5fb3e8 = 95, 179, 232），毫秒。 */
const DOOR_FLASH_DURATION = 300;
const HOLOGRAM_BLUE_RGB = { red: 95, green: 179, blue: 232 } as const;

/**
 * 第一章的太空站甲板一。
 *
 * 負責地圖、圖層碰撞、物件標記、鏡頭、玩家角色、終端機互動區、艙區偵測、斷電燈光遮罩與過關演出。
 * 跟 React 的溝通全部走 EventBus（設計文件 3.1）。
 */
export class Station extends Phaser.Scene {
	// ---- 圖層 ----
	public floorLayer!: Phaser.Tilemaps.TilemapLayer;
	public wallsLayer!: Phaser.Tilemaps.TilemapLayer;
	public objectsLayer!: Phaser.Tilemaps.TilemapLayer;
	/** 隱形阻擋格，例如鎖住的主艙門；開門時清掉對應的 tile。 */
	public collisionLayer!: Phaser.Tilemaps.TilemapLayer;

	// ---- 物件標記 ----
	public spawnPoint!: SpawnPoint;
	public terminals: TerminalMarker[] = [];
	public rooms: StationRoom[] = [];
	public doors: DoorMarker[] = [];

	public player!: Player;

	/** 終端機互動區：靠近發光、顯示「按 E」、按 E 發 `terminal:open`。 */
	private terminalZones!: TerminalZones;
	/** 艙區偵測：玩家走進新艙區時發 `room:enter`。 */
	private roomTracker!: RoomTracker;
	/** 斷電燈光遮罩：角色周圍一圈光，配電箱過關後 `powerOnSequence` 一間間亮起再全亮。 */
	public lightMask!: LightMask;
	/** 走廊盡頭的人影，配電箱過關時閃現一幀。 */
	private shadowFigure!: ShadowFigure;

	/**
	 * 已套用過的過關演出（終端機 id）。`puzzle:solved` 重複發（例如重整後從存檔補發）時不重播。
	 * 場景重啟會重用同一個實例，所以在 `create()` 重設。
	 */
	private appliedEffects = new Set<string>();
	/** 終端機開著（場景暫停）時收到的過關，等場景 resume 再播，玩家關掉終端機才看得到演出。 */
	private pendingEffects: string[] = [];
	/**
	 * 終端機開著（場景暫停）時收到的「燈閃一下」總長（毫秒），只留最後一次，resume 時播。
	 * 暫停中的場景 tween 不會動，直接播只會卡在第一格，所以跟過關演出一樣先排隊。
	 */
	private pendingFlickerMs: number | null = null;

	/** 音效的唯一出口（4.10），React 端透過 `sfx:play` 請它播。 */
	private audio!: AudioManager;

	private unsubscribers: Array<() => void> = [];

	constructor() {
		super({ key: SCENE_KEYS.station });
	}

	create(): void {
		const map = this.make.tilemap({ key: ASSET_KEYS.map });
		const tileset = map.addTilesetImage(TILESET_NAME, ASSET_KEYS.tileset);
		if (!tileset) {
			throw new Error(`[Station] 地圖裡找不到名為「${TILESET_NAME}」的 tileset`);
		}

		this.createLayers(map, tileset);
		this.readMarkers(map);

		this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

		const camera = this.cameras.main;
		camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
		camera.setZoom(CAMERA_ZOOM);
		camera.setRoundPixels(true);

		this.createPlayer();

		// 遮罩要在圖層與玩家之後建立，深度 50 才蓋得住地板與角色
		this.terminalZones = new TerminalZones(this, this.terminals);
		this.roomTracker = new RoomTracker(this.rooms);
		this.lightMask = new LightMask(this, map.widthInPixels, map.heightInPixels, this.terminals);
		this.shadowFigure = new ShadowFigure(this);

		// 音量與靜音由 PlayScreen 經 registry 給初始值，之後的變動走 audio:settings 事件
		const volume = (this.registry.get(REGISTRY_KEYS.volume) as number | undefined) ?? 1;
		const muted = (this.registry.get(REGISTRY_KEYS.muted) as boolean | undefined) ?? false;
		this.audio = new AudioManager(this, { volume, muted });
		const detachAudio = attachAudioEvents(this, this.audio);
		this.audio.play("ambient");

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.terminalZones.destroy();
			this.lightMask.destroy();
			this.shadowFigure.destroy();
			detachAudio();
			this.audio.destroy();
		});

		// 重整後還原：先不播動畫套上已過關的最終狀態，再訂閱事件，之後補發的 puzzle:solved 會被 appliedEffects 擋掉
		this.appliedEffects = new Set();
		this.pendingEffects = [];
		this.pendingFlickerMs = null;
		this.applySolvedState(this.readSolvedTerminalsFromRegistry());

		this.subscribeEvents();

		emitGameEvent("scene:ready", { sceneKey: SCENE_KEYS.station });
	}

	/** 每幀更新：玩家移動、終端機互動、艙區偵測、燈光跟隨。 */
	update(): void {
		this.player.update();
		this.terminalZones.update(this.player.x, this.player.y);
		this.roomTracker.update(this.player.x, this.player.y);
		this.lightMask.update(this.player.x, this.player.y);
	}

	/**
	 * 播放某台終端機的過關演出。重複呼叫同一個 id 只會播一次。
	 *
	 * 場景暫停中（玩家還在終端機裡）先排隊，等 `terminal:close` 讓場景 resume 時再播，
	 * 這樣燈亮與人影不會在終端機彈窗後面悄悄播完。音效也一起延後，讓聲音與畫面同步。
	 */
	playSolvedEffect(terminalId: string): void {
		if (this.appliedEffects.has(terminalId)) {
			return;
		}
		this.appliedEffects.add(terminalId);

		if (this.scene.isPaused()) {
			this.pendingEffects.push(terminalId);
			return;
		}
		this.runSolvedEffect(terminalId);
	}

	/**
	 * 重整後還原用：不播動畫，直接套用已過關終端機的最終狀態。
	 *
	 * - 配電箱已過關：遮罩立即全亮。
	 * - 艙門控制台已過關：主艙門 tile 與阻擋格直接移除。
	 * 套過的 id 會記進 `appliedEffects`，之後再收到同一個 `puzzle:solved` 不會重播。
	 */
	applySolvedState(solvedTerminalIds: readonly string[]): void {
		for (const terminalId of solvedTerminalIds) {
			if (this.appliedEffects.has(terminalId)) {
				continue;
			}
			this.appliedEffects.add(terminalId);

			if (terminalId === POWER_TERMINAL_ID) {
				this.lightMask.setPowered(true, true);
			} else if (terminalId === AIRLOCK_TERMINAL_ID) {
				this.openAirlockDoor();
				// 門開了代表電早就恢復，存檔若漏了 T4 也不要讓玩家摸黑
				this.lightMask.setPowered(true, true);
			}
		}
	}

	/** 依終端機 id 分派演出。只在場景執行中呼叫。 */
	private runSolvedEffect(terminalId: string): void {
		if (terminalId === POWER_TERMINAL_ID) {
			this.playPowerRestored();
			return;
		}
		if (terminalId === AIRLOCK_TERMINAL_ID) {
			this.playAirlockOpened();
			return;
		}
		// 其他終端機（T1、T2、T3、T5）在地圖上沒有對應的變化，過關回饋由 React 端的終端機畫面負責，
		// Phaser 這裡刻意不發音效，避免與終端機自己的過關提示疊在一起。
	}

	/**
	 * 配電箱過關：燈從配電室一間一間亮起，走廊亮起那一刻在走廊盡頭閃現人影。
	 * 演出期間不鎖輸入，玩家可以繼續走。
	 */
	private playPowerRestored(): void {
		emitGameEvent("sfx:play", { sound: "power" });

		const order = powerOnOrder(
			this.rooms.map((room) => room.roomId),
			POWER_ROOM_ID,
		);
		const corridor = this.rooms.find((room) => room.roomId === SHADOW_ROOM_ID);

		void this.lightMask.powerOnSequence(this.rooms, order, POWER_ON_STEP_MS, (roomId) => {
			if (roomId !== SHADOW_ROOM_ID || corridor === undefined) {
				return;
			}
			// 位置在這一刻才算，取離玩家當下位置較遠的那一端，但夾在鏡頭看得到的範圍內（視野半寬減去一點邊）
			const viewHalfWidth = this.cameras.main.width / CAMERA_ZOOM / 2 - SHADOW_VIEW_MARGIN;
			const position = shadowFlashPosition(corridor.rect, this.player.x, viewHalfWidth);
			void this.shadowFigure.flashAt(position.x, position.y);
		});
	}

	/** 艙門控制台過關：門開、鏡頭閃全息藍、還沒亮的燈一起淡亮（「走廊燈亮向遠方」）。 */
	private playAirlockOpened(): void {
		emitGameEvent("sfx:play", { sound: "door" });
		this.openAirlockDoor();
		this.cameras.main.flash(
			DOOR_FLASH_DURATION,
			HOLOGRAM_BLUE_RGB.red,
			HOLOGRAM_BLUE_RGB.green,
			HOLOGRAM_BLUE_RGB.blue,
		);
		this.lightMask.setPowered(true);
	}

	/** 移除主艙門的紅門 tile 與隱形阻擋格。重複呼叫無害（空格再移除一次不會怎樣）。 */
	private openAirlockDoor(): void {
		const door = this.doors.find((item) => item.doorId === AIRLOCK_DOOR_ID);
		if (door === undefined) {
			console.warn(`[Station] 地圖裡找不到 doorId「${AIRLOCK_DOOR_ID}」的門，無法開門`);
			return;
		}

		const { tileX, tileY } = airlockTilePosition(door);
		this.objectsLayer.removeTileAt(tileX, tileY);
		this.collisionLayer.removeTileAt(tileX, tileY);
	}

	/** 場景 resume 時把暫停期間排隊的演出播掉。過關演出先播，燈閃遇到亮燈序列會自己略過。 */
	private flushPendingEffects(): void {
		const pending = this.pendingEffects;
		this.pendingEffects = [];
		for (const terminalId of pending) {
			this.runSolvedEffect(terminalId);
		}

		const flickerMs = this.pendingFlickerMs;
		this.pendingFlickerMs = null;
		if (flickerMs !== null) {
			this.lightMask.flicker(flickerMs);
		}
	}

	/** 環境反應階梯的「燈閃一下」（M5-4）。場景暫停中（終端機開著）先排隊，關掉終端機時才閃。 */
	private playFlicker(durationMs: number): void {
		if (this.scene.isPaused()) {
			this.pendingFlickerMs = durationMs;
			return;
		}
		this.lightMask.flicker(durationMs);
	}

	/** 讀 registry 的已過關清單，型別不對就當空陣列（registry 沒有型別保證）。 */
	private readSolvedTerminalsFromRegistry(): string[] {
		const value: unknown = this.registry.get(REGISTRY_KEYS.solvedTerminals);
		if (!Array.isArray(value)) {
			return [];
		}
		return value.filter((item): item is string => typeof item === "string");
	}

	/** 在出生點建立玩家，對三個碰撞圖層加 collider，鏡頭平滑跟隨。 */
	private createPlayer(): void {
		this.player = new Player(this, this.spawnPoint.x, this.spawnPoint.y);

		this.physics.add.collider(this.player, this.wallsLayer);
		this.physics.add.collider(this.player, this.objectsLayer);
		this.physics.add.collider(this.player, this.collisionLayer);

		this.cameras.main.startFollow(this.player, true, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);
	}

	/** 依 `MAP_LAYERS` 建四層，牆、物件、隱形阻擋三層設碰撞。 */
	private createLayers(map: Phaser.Tilemaps.Tilemap, tileset: Phaser.Tilemaps.Tileset): void {
		this.floorLayer = this.createTileLayer(map, tileset, MAP_LAYERS.floor);
		this.wallsLayer = this.createTileLayer(map, tileset, MAP_LAYERS.walls);
		this.objectsLayer = this.createTileLayer(map, tileset, MAP_LAYERS.objects);
		this.collisionLayer = this.createTileLayer(map, tileset, MAP_LAYERS.collision);

		this.wallsLayer.setCollisionByExclusion(NON_COLLIDING_INDEXES);
		this.objectsLayer.setCollisionByExclusion(NON_COLLIDING_INDEXES);
		this.collisionLayer.setCollisionByExclusion(NON_COLLIDING_INDEXES);
		this.collisionLayer.setVisible(false);
	}

	/**
	 * 建立單一 tile 圖層。
	 *
	 * Phaser 4 的 `createLayer` 型別是 `TilemapLayer | TilemapGPULayer`（第五個參數 `gpu` 預設 false），
	 * 這裡要 arcade 碰撞，所以確認拿到的是一般的 TilemapLayer。
	 */
	private createTileLayer(
		map: Phaser.Tilemaps.Tilemap,
		tileset: Phaser.Tilemaps.Tileset,
		layerName: string,
	): Phaser.Tilemaps.TilemapLayer {
		const layer = map.createLayer(layerName, tileset, 0, 0);
		if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
			throw new Error(`[Station] 無法建立圖層「${layerName}」，請確認地圖 JSON 有這個 tile 圖層`);
		}
		return layer;
	}

	/** 讀 `markers` 物件層，解析成型別化的標記。 */
	private readMarkers(map: Phaser.Tilemaps.Tilemap): void {
		const objectLayer = map.getObjectLayer(MAP_OBJECT_LAYER);
		if (!objectLayer) {
			throw new Error(`[Station] 地圖裡找不到物件層「${MAP_OBJECT_LAYER}」`);
		}

		// Phaser 的 TiledObject 保留 Tiled 原本的 properties 陣列與 type 欄位，結構與純資料的 TiledObject 相容
		const markers = parseMapMarkers(objectLayer.objects as TiledObject[]);

		this.spawnPoint = markers.spawnPoint;
		this.terminals = markers.terminals;
		this.doors = markers.doors;
		this.rooms = markers.rooms.map((room) => ({
			roomId: room.roomId,
			rect: new Phaser.Geom.Rectangle(room.rect.x, room.rect.y, room.rect.width, room.rect.height),
		}));
	}

	/**
	 * 訂閱 React 端的事件，場景關閉或銷毀時取消。
	 *
	 * 暫停由發 `terminal:open` 的一方（終端機互動邏輯）呼叫 `this.scene.pause()`，
	 * 這裡收到 `terminal:open` 只負責關掉角色輸入；收到 `terminal:close` 負責恢復場景與輸入。
	 */
	private subscribeEvents(): void {
		this.unsubscribers.push(
			onGameEvent("terminal:open", () => {
				this.player.setInputEnabled(false);
			}),
			onGameEvent("terminal:close", () => {
				if (this.scene.isPaused()) {
					this.scene.resume();
				}
				// 暫停期間放開的鍵收不到 keyup，按住狀態可能卡著，先全部重設再交還控制
				this.input.keyboard?.resetKeys();
				this.player.setInputEnabled(true);
			}),
			onGameEvent("puzzle:solved", ({ terminalId }) => {
				this.playSolvedEffect(terminalId);
			}),
			onGameEvent("ambient:flicker", ({ durationMs }) => {
				this.playFlicker(durationMs);
			}),
			onGameEvent("audio:settings", ({ volume, muted }) => {
				this.audio.setVolume(volume);
				this.audio.setMuted(muted);
			}),
			// 暫停選單只停角色輸入，場景繼續跑（燈光脈動、NOVA 對話等不受影響）
			onGameEvent("game:pause", () => {
				this.player.setInputEnabled(false);
			}),
			onGameEvent("game:resume", () => {
				this.input.keyboard?.resetKeys();
				this.player.setInputEnabled(true);
			}),
		);

		// 終端機開著時過關的演出排在 pendingEffects，場景 resume（關掉終端機）時播
		this.events.on(Phaser.Scenes.Events.RESUME, this.flushPendingEffects, this);

		// EventBus 是全域的，場景重啟（shutdown）或 game.destroy（destroy）都要清掉，避免殘留舊場景的 handler
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.unsubscribeEvents, this);
		this.events.once(Phaser.Scenes.Events.DESTROY, this.unsubscribeEvents, this);
	}

	private unsubscribeEvents(): void {
		for (const unsubscribe of this.unsubscribers) {
			unsubscribe();
		}
		this.unsubscribers = [];
		this.events.off(Phaser.Scenes.Events.RESUME, this.flushPendingEffects, this);
	}
}

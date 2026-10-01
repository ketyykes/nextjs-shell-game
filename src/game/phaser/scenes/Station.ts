import Phaser from "phaser";
import { ASSET_KEYS, CAMERA_ZOOM, MAP_LAYERS, MAP_OBJECT_LAYER, TILESET_NAME } from "../constants";
import { emitGameEvent, onGameEvent } from "../EventBus";
import type { RoomId } from "../events";
import { LightMask } from "../objects/LightMask";
import { Player } from "../objects/Player";
import { RoomTracker } from "../objects/RoomTracker";
import { TerminalZones } from "../objects/TerminalZone";
import { SCENE_KEYS } from "./keys";
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

/**
 * 第一章的太空站甲板一。
 *
 * 負責地圖、圖層碰撞、物件標記、鏡頭、玩家角色、終端機互動區、艙區偵測與斷電燈光遮罩。
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
	/** 斷電燈光遮罩：角色周圍一圈光，M4 配電箱過關後 `setPowered(true)` 全亮。 */
	public lightMask!: LightMask;

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
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.terminalZones.destroy();
			this.lightMask.destroy();
		});

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
		);

		// EventBus 是全域的，場景重啟（shutdown）或 game.destroy（destroy）都要清掉，避免殘留舊場景的 handler
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.unsubscribeEvents, this);
		this.events.once(Phaser.Scenes.Events.DESTROY, this.unsubscribeEvents, this);
	}

	private unsubscribeEvents(): void {
		for (const unsubscribe of this.unsubscribers) {
			unsubscribe();
		}
		this.unsubscribers = [];
	}
}

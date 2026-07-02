// v0.3 렌더러 (Tiny Swords): 지형·거품·건물·유닛 애니메이션·조명·색보정
/* global PIXI */
import {
  TILE, MAP_W, MAP_H, TS, BUILDS, UNITS, COLORS,
  ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX,
} from './config.js';
import {
  idx, ix, iy, inMap, T_WATER, T_GRASS, T_SAND, buildingDef,
} from './world.js';
import { poseOf, isToolPose } from './pawns.js';
import { bpMissing } from './jobs.js';

export function createRenderer(world) {
  var app = new PIXI.Application({
    resizeTo: window,
    background: 0x47abc8, // 바다색
    antialias: false,
  });
  document.getElementById('stage').appendChild(app.view);
  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

  // ── 베이스 텍스처 ──
  var SHEETS = ['Tilemap_Flat', 'Water', 'Foam', 'Tree', 'Fire', 'Sheep_Idle', 'Dead',
    'House', 'House_C', 'Tower', 'Tower_C', 'Castle', 'Castle_C',
    'GoldMine_Active', 'GoldMine_Destroyed',
    'W_Idle', 'G_Idle', 'M_Idle',
    'Goblin', 'Bridge_All', 'Food_Grain',
    'deco03'];
  // 외형 시트 (직업 x 색상)
  for (var uk in UNITS) {
    for (var ci = 0; ci < COLORS.length; ci++) SHEETS.push(UNITS[uk].sheet + COLORS[ci]);
  }
  var base = {};
  SHEETS.forEach(function (n) {
    base[n] = PIXI.BaseTexture.from(TS + n + '.png');
    base[n].scaleMode = PIXI.SCALE_MODES.NEAREST;
  });

  var texCache = {};
  function tx(n, x, y, w, h) {
    var k = n + ':' + x + ':' + y + ':' + w + ':' + h;
    if (!texCache[k]) {
      texCache[k] = new PIXI.Texture(base[n], new PIXI.Rectangle(x, y, w, h));
    }
    return texCache[k];
  }

  // 지형 오토타일 (잔디 ox=0, 모래 ox=320)
  function groundTex(kind, up, dn, lf, rt) {
    var ox = kind === T_SAND ? 320 : 0;
    var col = (!lf && rt) ? 0 : (lf && rt) ? 1 : (lf && !rt) ? 2 : 3;
    var row = (!up && dn) ? 0 : (up && dn) ? 1 : (up && !dn) ? 2 : 3;
    if (col === 3 && row !== 3) row = Math.min(row, 2);
    if (row === 3 && col !== 3) col = Math.min(col, 2);
    return tx('Tilemap_Flat', ox + col * 64, row * 64, 64, 64);
  }

  var foamFrames = [], treeFrames = [], fireFrames = [], sheepFrames = [];
  for (var ff = 0; ff < 8; ff++) foamFrames.push(tx('Foam', ff * 192, 0, 192, 192));
  for (var tf = 0; tf < 4; tf++) treeFrames.push(tx('Tree', tf * 192, 0, 192, 192));
  var stumpTex = tx('Tree', 0, 384, 192, 192);
  for (var fi = 0; fi < 7; fi++) fireFrames.push(tx('Fire', fi * 128, 0, 128, 128));
  for (var sf = 0; sf < 8; sf++) sheepFrames.push(tx('Sheep_Idle', sf * 128, 0, 128, 128));
  var mushroomTex = PIXI.Texture.from(TS + 'deco03.png');

  // 작물 스프라이트 (v0.2 때 받아둔 Kenney RPG 시트 재사용 — 새 에셋 불필요)
  var rpgBase = PIXI.BaseTexture.from('assets/rpg/roguelikeSheet_transparent.png');
  rpgBase.scaleMode = PIXI.SCALE_MODES.NEAREST;
  function rpgTex(i) {
    var cols = 57, sp = 1, cell = 16;
    var col = i % cols, row = (i / cols) | 0;
    return new PIXI.Texture(rpgBase, new PIXI.Rectangle(col * (cell + sp), row * (cell + sp), cell, cell));
  }
  var cropGrowingTex = rpgTex(649); // 새싹
  var cropReadyTex = rpgTex(594);   // 열매 맺은 밀 (수확 가능)
  var ITEM_TEX = {
    wood: function () { return tx('W_Idle', 0, 0, 128, 128); },
    gold: function () { return tx('G_Idle', 0, 0, 128, 128); },
    food: function () { return tx('Food_Grain', 0, 0, 48, 48); }, // 농산물(곡물·열매)
    // 철은 금 아이콘 색조로 구분, 요리(meal)는 고기(조리된 음식) 아이콘
    iron: function () { return tx('G_Idle', 0, 0, 128, 128); },
    meal: function () { return tx('M_Idle', 0, 0, 128, 128); },
    // 검·활 아이템은 별도 아이콘 에셋이 없어 해당 유닛 스프라이트(파랑) 아이들 프레임을 재사용
    sword: function () { return tx('Warrior_Blue', 0, 0, 192, 192); },
    bow: function () { return tx('Archer_Blue', 0, 0, 192, 192); },
    ironSword: function () { return tx('Warrior_Blue', 0, 0, 192, 192); },
    ironBow: function () { return tx('Archer_Blue', 0, 0, 192, 192); },
  };
  var ITEM_TINT = { iron: 0xb8c0cc, meal: 0xffcf87, ironSword: 0xc8d0dc, ironBow: 0xc8d0dc };

  // 고블린(적) 프레임: 7열 시트, row0 idle / row1 walk / row2 attack
  var goblinIdle = [], goblinWalk = [], goblinAtk = [];
  for (var gf = 0; gf < 6; gf++) {
    goblinIdle.push(tx('Goblin', gf * 192, 0, 192, 192));
    goblinWalk.push(tx('Goblin', gf * 192, 192, 192, 192));
    goblinAtk.push(tx('Goblin', gf * 192, 384, 192, 192));
  }

  function pawnTex(look, rowName, frame) {
    var u = UNITS[look.unit] || UNITS.pawn;
    return tx(u.sheet + look.color, frame * 192, u.rows[rowName] * 192, 192, 192);
  }

  // ── 레이어 ──
  var camera = new PIXI.Container();
  app.stage.addChild(camera);

  var waterLayer = new PIXI.Container();
  var foamLayer = new PIXI.Container();
  var landLayer = new PIXI.Container();
  var groundDecor = new PIXI.Container();  // 그루터기
  var zoneGfx = new PIXI.Graphics();
  var itemLayer = new PIXI.Container();
  var objLayer = new PIXI.Container();     // y정렬: 나무·건물·유닛·양·불
  objLayer.sortableChildren = true;
  var selGfx = new PIXI.Graphics();
  var dragGfx = new PIXI.Graphics();
  camera.addChild(waterLayer, foamLayer, landLayer, groundDecor, zoneGfx, itemLayer, objLayer, selGfx, dragGfx);

  var seasonOverlay = new PIXI.Graphics(); // 계절 색보정 (밤보다 아래)
  app.stage.addChild(seasonOverlay);
  var tintOverlay = new PIXI.Graphics(); // 시간대 색보정
  app.stage.addChild(tintOverlay);
  var lightLayer = new PIXI.Container(); // 광원 (스크린 좌표)
  app.stage.addChild(lightLayer);

  // ── 지형 렌더 (정적 + 거품 애니) ──
  var foamSprites = [];
  function landAt(x, y) { return inMap(x, y) && world.terrain[idx(x, y)] !== T_WATER; }

  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var w = new PIXI.Sprite(tx('Water', 0, 0, 64, 64));
      w.x = x * TILE; w.y = y * TILE;
      waterLayer.addChild(w);
      var k = world.terrain[idx(x, y)];
      if (k === T_WATER) continue;
      if (!landAt(x - 1, y) || !landAt(x + 1, y) || !landAt(x, y - 1) || !landAt(x, y + 1)) {
        var f = new PIXI.Sprite(foamFrames[(x + y) % 8]);
        f.anchor.set(0.5);
        f.x = x * TILE + 32; f.y = y * TILE + 32;
        f.foamPhase = (x * 3 + y * 5) % 8;
        foamLayer.addChild(f);
        foamSprites.push(f);
      }
      var g = new PIXI.Sprite(groundTex(k,
        landAt(x, y - 1), landAt(x, y + 1), landAt(x - 1, y), landAt(x + 1, y)));
      g.x = x * TILE; g.y = y * TILE;
      landLayer.addChild(g);
    }
  }

  // ── 자연물·건물 (동적) ──
  var objSprites = {};    // idx -> sprite (tree/mushroom)
  var stumpSprites = {};  // idx -> sprite
  var bSprites = {};      // buildingId -> sprite
  var treeList = [];      // 흔들림 애니용

  function refreshTile(i) {
    var o = world.objects[i];
    var cur = objSprites[i];
    var wantKind = o && (o.kind === 'tree' || o.kind === 'mushroom') ? o.kind : null;
    if (cur && cur.objKind !== wantKind) {
      objLayer.removeChild(cur); cur.destroy();
      if (cur.objKind === 'tree') treeList.splice(treeList.indexOf(cur), 1);
      delete objSprites[i];
      cur = null;
    }
    if (wantKind && !cur) {
      var s;
      if (wantKind === 'tree') {
        s = new PIXI.Sprite(treeFrames[o.phase || 0]);
        s.anchor.set(0.5, 0.88);
        s.x = ix(i) * TILE + 32; s.y = (iy(i) + 1) * TILE;
        s.treePhase = o.phase || 0;
        treeList.push(s);
      } else {
        s = new PIXI.Sprite(mushroomTex);
        s.anchor.set(0.5, 0.85);
        s.x = ix(i) * TILE + 32; s.y = (iy(i) + 1) * TILE - 8;
      }
      s.objKind = wantKind;
      s.zIndex = (iy(i) + 1) * TILE;
      objLayer.addChild(s);
      objSprites[i] = s;
    }
    // 그루터기
    var wantStump = o && o.kind === 'stump';
    if (wantStump && !stumpSprites[i]) {
      var st = new PIXI.Sprite(stumpTex);
      st.anchor.set(0.5, 0.88);
      st.x = ix(i) * TILE + 32; st.y = (iy(i) + 1) * TILE;
      groundDecor.addChild(st);
      stumpSprites[i] = st;
    } else if (!wantStump && stumpSprites[i]) {
      groundDecor.removeChild(stumpSprites[i]);
      stumpSprites[i].destroy();
      delete stumpSprites[i];
    }
  }

  // ── 작물 ──
  var cropSprites = {};
  function refreshCrop(i) {
    var c = world.crops[i];
    var e = cropSprites[i];
    if (!c) {
      if (e) { groundDecor.removeChild(e); e.destroy(); delete cropSprites[i]; }
      return;
    }
    if (!e) {
      e = new PIXI.Sprite(cropGrowingTex);
      e.anchor.set(0.5, 0.85);
      e.scale.set(2.6);
      e.x = ix(i) * TILE + 32; e.y = (iy(i) + 1) * TILE - 8;
      groundDecor.addChild(e);
      cropSprites[i] = e;
    }
    e.texture = c.stage === 'ready' ? cropReadyTex : cropGrowingTex;
  }

  function buildingTexture(b) {
    if (b.kind === 'goldmine' || b.kind === 'ironmine') {
      return b.depleted ? tx('GoldMine_Destroyed', 0, 0, 192, 128) : tx('GoldMine_Active', 0, 0, 192, 128);
    }
    if (b.kind === 'bridge') return tx('Bridge_All', 0, 0, 192, 64);
    if (b.kind === 'campfire') return fireFrames[0];
    var def = BUILDS[b.kind];
    if (b.stage === 'bp' && bpMissing(b) === null) {
      return tx(def.imgC, 0, 0, def.pw, def.ph); // 자재 완비 → 공사 중 모습
    }
    return tx(def.img, 0, 0, def.pw, def.ph);
  }

  function refreshBuilding(b) {
    var e = bSprites[b.id];
    if (!b || !world.buildings[b.id]) {
      if (e) { objLayer.removeChild(e); e.destroy(); delete bSprites[b.id]; }
      return;
    }
    var def = buildingDef(b.kind);
    if (!e) {
      e = new PIXI.Sprite(buildingTexture(b));
      e.anchor.set(0.5, 1);
      e.x = (b.x + def.fw / 2) * TILE;
      e.y = (b.y + def.fh) * TILE;
      e.zIndex = (b.y + def.fh) * TILE - 1;
      objLayer.addChild(e);
      bSprites[b.id] = e;
      if (b.kind === 'campfire') {
        e.firePhase = ((b.x + b.y) % 7);
        e.anchor.set(0.5, 0.8);
      }
      if (b.kind === 'bridge') { // 1타일 다리: 판자 슬라이스를 타일 크기로
        e.anchor.set(0.5, 0.5);
        e.width = TILE; e.height = TILE;
        e.x = (b.x + 0.5) * TILE; e.y = (b.y + 0.5) * TILE;
        e.zIndex = 0; // 지면 위, 유닛 아래
      }
    } else {
      e.texture = buildingTexture(b);
    }
    if (b.kind === 'bridge') { rebuildLights(); return; }
    if (b.stage === 'bp') {
      var ready = bpMissing(b) === null;
      e.alpha = ready ? 0.95 : 0.45;
      e.tint = ready ? 0xffffff : 0x9ec7ff;
    } else {
      e.alpha = 1;
      e.tint = b.kind === 'ironmine' ? 0xaab4c2 : (def.tint || 0xffffff);
    }
    rebuildLights();
  }

  function removeBuildingSprite(bid) {
    var e = bSprites[bid];
    if (e) { objLayer.removeChild(e); e.destroy(); delete bSprites[bid]; }
    rebuildLights();
  }

  // ── 아이템 ──
  var itemSprites = {};
  function refreshItem(i) {
    var slot = world.items[i];
    var entry = itemSprites[i];
    var type = null, total = 0;
    if (slot) {
      for (var k in slot) { if (slot[k] > 0) { type = type || k; total += slot[k]; } }
    }
    if (type) {
      if (!entry) {
        var spr = new PIXI.Sprite(ITEM_TEX[type]());
        spr.tint = ITEM_TINT[type] || 0xffffff;
        spr.anchor.set(0.5, 0.6);
        var label = new PIXI.Text('', {
          fontFamily: 'Malgun Gothic', fontSize: 26, fill: 0xffffff,
          stroke: 0x000000, strokeThickness: 6, fontWeight: '700',
        });
        label.scale.set(0.55);
        entry = { spr: spr, label: label, type: type };
        itemSprites[i] = entry;
        itemLayer.addChild(spr);
        itemLayer.addChild(label);
      }
      if (entry.type !== type) {
        entry.spr.texture = ITEM_TEX[type]();
        entry.spr.tint = ITEM_TINT[type] || 0xffffff;
        entry.type = type;
      }
      entry.spr.x = ix(i) * TILE + 32; entry.spr.y = iy(i) * TILE + 36;
      entry.label.text = String(total);
      entry.label.x = ix(i) * TILE + 34;
      entry.label.y = iy(i) * TILE + 30;
      return;
    }
    if (entry) {
      itemLayer.removeChild(entry.spr); entry.spr.destroy();
      itemLayer.removeChild(entry.label); entry.label.destroy();
      delete itemSprites[i];
    }
  }

  // ── 구역·지정 오버레이 ──
  var DESIG_COLOR = { chop: 0xffa04d, forage: 0x8dea76 };
  function refreshZones() {
    zoneGfx.clear();
    var i;
    for (i in world.stockpile) {
      zoneGfx.beginFill(0xffd76e, 0.14);
      zoneGfx.drawRect(ix(+i) * TILE, iy(+i) * TILE, TILE, TILE);
      zoneGfx.endFill();
      zoneGfx.lineStyle(2, 0xffd76e, 0.45);
      zoneGfx.drawRect(ix(+i) * TILE + 1, iy(+i) * TILE + 1, TILE - 2, TILE - 2);
      zoneGfx.lineStyle(0);
    }
    for (i in world.farmZone) {
      zoneGfx.beginFill(0x8a5a2e, 0.28);
      zoneGfx.drawRect(ix(+i) * TILE, iy(+i) * TILE, TILE, TILE);
      zoneGfx.endFill();
      zoneGfx.lineStyle(2, 0xc98a4b, 0.5);
      zoneGfx.drawRect(ix(+i) * TILE + 1, iy(+i) * TILE + 1, TILE - 2, TILE - 2);
      zoneGfx.lineStyle(0);
    }
    for (i in world.designations) {
      var c = DESIG_COLOR[world.designations[i]] || 0xffffff;
      zoneGfx.lineStyle(3, c, 0.85);
      zoneGfx.drawRect(ix(+i) * TILE + 3, iy(+i) * TILE + 3, TILE - 6, TILE - 6);
      zoneGfx.lineStyle(0);
    }
    for (var id in world.mineDesig) {
      var b = world.buildings[id];
      if (!b) continue;
      zoneGfx.lineStyle(3, 0xffd94d, 0.9);
      zoneGfx.drawRect(b.x * TILE + 3, b.y * TILE + 3, 3 * TILE - 6, 2 * TILE - 6);
      zoneGfx.lineStyle(0);
    }
  }

  function refreshAll() {
    var seen = {}, i;
    for (i in world.objects) seen[i] = 1;
    for (i in objSprites) seen[i] = 1;
    for (i in stumpSprites) seen[i] = 1;
    for (i in seen) refreshTile(+i);
    for (var id in world.buildings) refreshBuilding(world.buildings[id]);
    var seenI = {};
    for (i in world.items) seenI[i] = 1;
    for (i in itemSprites) seenI[i] = 1;
    for (i in seenI) refreshItem(+i);
    for (i in world.crops) refreshCrop(+i);
    refreshZones();
  }

  // ── 정착민 ──
  var pawnSprites = {};
  function addPawn(pawn) {
    var s = new PIXI.Sprite(pawnTex(pawn.look, 'idle', 0));
    s.anchor.set(0.5, 0.72);
    var name = new PIXI.Text(pawn.name, {
      fontFamily: 'Malgun Gothic', fontSize: 22, fill: 0xffffff, fontWeight: '600',
      stroke: 0x14161c, strokeThickness: 5,
    });
    name.anchor.set(0.5, 1);
    name.scale.set(0.62);
    var carry = new PIXI.Sprite();
    carry.visible = false;
    pawnSprites[pawn.id] = { spr: s, name: name, carry: carry, animOff: pawn.id * 2 };
    objLayer.addChild(s); objLayer.addChild(name); objLayer.addChild(carry);
    updatePawnSprite(pawn);
  }

  var animTime = 0;
  function updatePawnSprite(pawn) {
    var e = pawnSprites[pawn.id];
    if (!e) return;
    var wx = (pawn.px + 0.5) * TILE, wy = (pawn.py + 0.5) * TILE;
    e.spr.x = wx; e.spr.y = wy + 14;
    e.spr.zIndex = wy + TILE * 0.5;
    e.spr.scale.x = pawn.face < 0 ? -1 : 1;

    var pose = poseOf(pawn);
    if (pose === 'dead') {
      e.spr.texture = tx('Dead', 768, 0, 128, 256);
      e.spr.alpha = 0.85;
    } else {
      e.spr.alpha = 1;
      var frame = (((animTime / 0.1) | 0) + e.animOff) % 6;
      // 채집·채굴 등 작업 중에는 무기 대신 도구를 든 일꾼 모습으로 렌더
      var look = isToolPose(pose) ? { unit: 'pawn', color: pawn.look.color } : pawn.look;
      e.spr.texture = pawnTex(look, pose, frame);
    }

    if (e.name.text !== pawn.name) e.name.text = pawn.name;
    e.name.x = wx; e.name.y = wy - 44;
    e.name.zIndex = 999999;
    if (pawn.carry) {
      e.carry.visible = true;
      e.carry.texture = ITEM_TEX[pawn.carry.type]();
      e.carry.width = 40; e.carry.height = 40;
      e.carry.anchor.set(0.5);
      e.carry.x = wx; e.carry.y = wy - 52;
      e.carry.zIndex = 999999;
    } else {
      e.carry.visible = false;
    }
  }

  // ── 양 ──
  var sheepSprites = [];
  function syncSheep() {
    while (sheepSprites.length < world.sheep.length) {
      var s = new PIXI.Sprite(sheepFrames[0]);
      s.anchor.set(0.5, 0.7);
      objLayer.addChild(s);
      sheepSprites.push(s);
    }
    for (var n = 0; n < world.sheep.length; n++) {
      var sh = world.sheep[n], sp = sheepSprites[n];
      sp.x = (sh.px + 0.5) * TILE;
      sp.y = (sh.py + 0.5) * TILE + 10;
      sp.zIndex = sp.y;
      sp.scale.x = sh.dir < 0 ? -1 : 1;
      sp.texture = sheepFrames[(((animTime / 0.18) | 0) + sh.phase) % 8];
      sp.tint = sh.hunt ? 0xffb0b0 : 0xffffff; // 사냥 지정 시 붉게
    }
    // 초과 스프라이트 제거 (사냥으로 양이 줄었을 때)
    while (sheepSprites.length > world.sheep.length) {
      var extra = sheepSprites.pop();
      objLayer.removeChild(extra); extra.destroy();
    }
  }

  // ── 적(고블린) ──
  var enemySprites = {};
  function syncEnemies() {
    var live = {};
    for (var n = 0; n < world.enemies.length; n++) {
      var en = world.enemies[n];
      live[en.id] = 1;
      var sp = enemySprites[en.id];
      if (!sp) {
        sp = new PIXI.Sprite(goblinIdle[0]);
        sp.anchor.set(0.5, 0.72);
        objLayer.addChild(sp);
        enemySprites[en.id] = sp;
      }
      sp.x = (en.px + 0.5) * TILE;
      sp.y = (en.py + 0.5) * TILE + 14;
      sp.zIndex = sp.y;
      sp.scale.x = en.dir < 0 ? -1 : 1;
      var frames = en.moving ? goblinWalk : goblinIdle;
      sp.texture = frames[(((animTime / 0.12) | 0) + en.anim) % 6];
    }
    for (var id in enemySprites) {
      if (!live[id]) { objLayer.removeChild(enemySprites[id]); enemySprites[id].destroy(); delete enemySprites[id]; }
    }
  }

  // ── 선택·드래그 ── (여러 정착민 동시 선택 지원)
  var selList = [];
  function setSelected(list) {
    if (!list) selList = [];
    else if (list.length !== undefined) selList = list.slice();
    else selList = [list]; // 단일 pawn 도 허용
    drawSelection();
  }
  function drawSelection() {
    selGfx.position.set(0, 0);
    selGfx.clear();
    if (!selList.length) return;
    selGfx.lineStyle(3, 0xffffff, 0.9);
    for (var n = 0; n < selList.length; n++) {
      var p = selList[n];
      selGfx.drawEllipse((p.px + 0.5) * TILE, (p.py + 0.5) * TILE + 18, TILE * 0.42, TILE * 0.26);
    }
    selGfx.lineStyle(0);
  }
  function tickSelection() {
    if (selList.length) drawSelection();
  }
  function showDrag(x0, y0, x1, y1, color) {
    dragGfx.clear();
    if (x0 === null || x0 === undefined) return;
    var minX = Math.min(x0, x1), minY = Math.min(y0, y1);
    var w2 = Math.abs(x1 - x0) + 1, h2 = Math.abs(y1 - y0) + 1;
    dragGfx.beginFill(color, 0.13);
    dragGfx.drawRect(minX * TILE, minY * TILE, w2 * TILE, h2 * TILE);
    dragGfx.endFill();
    dragGfx.lineStyle(2, color, 0.9);
    dragGfx.drawRect(minX * TILE, minY * TILE, w2 * TILE, h2 * TILE);
    dragGfx.lineStyle(0);
  }

  // ── 조명·색보정 ──
  function glowTexture(r, color) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = r * 2;
    var c2 = cv.getContext('2d');
    var grd = c2.createRadialGradient(r, r, r * 0.08, r, r, r);
    var cs = '#' + color.toString(16).padStart(6, '0');
    grd.addColorStop(0, cs + 'c8');
    grd.addColorStop(0.5, cs + '4d');
    grd.addColorStop(1, cs + '00');
    c2.fillStyle = grd;
    c2.fillRect(0, 0, r * 2, r * 2);
    return PIXI.Texture.from(cv);
  }
  var glowBig = null, glowSmall = null;
  var lights = []; // {wx, wy, spr}

  function rebuildLights() {
    if (!glowBig) { glowBig = glowTexture(170, 0xff9a33); glowSmall = glowTexture(110, 0xffb050); }
    lights.forEach(function (l) { lightLayer.removeChild(l.spr); l.spr.destroy(); });
    lights = [];
    for (var id in world.buildings) {
      var b = world.buildings[id];
      if (b.stage !== 'built') continue;
      var def = buildingDef(b.kind);
      var wx = (b.x + def.fw / 2) * TILE;
      var wy = (b.y + def.fh * 0.55) * TILE;
      var spr = null;
      if (b.kind === 'campfire') spr = new PIXI.Sprite(glowBig);
      else if (def.light) spr = new PIXI.Sprite(glowSmall);
      if (spr) {
        spr.anchor.set(0.5);
        spr.blendMode = PIXI.BLEND_MODES.ADD;
        lightLayer.addChild(spr);
        lights.push({ wx: wx, wy: wy, spr: spr });
      }
    }
  }

  var nightAlpha = 0;
  function setTimeOfDay(hour) {
    var color = 0x16204d, alpha = 0;
    if (hour >= 21 && hour < 23) alpha = 0.5 * (hour - 21) / 2;
    else if (hour >= 23 || hour < 4) alpha = 0.52;
    else if (hour >= 4 && hour < 6) alpha = 0.52 * (1 - (hour - 4) / 2);
    else if (hour >= 6 && hour < 7.2) { color = 0xff9a55; alpha = 0.12 * (1 - (hour - 6) / 1.2); }
    else if (hour >= 17.5 && hour < 21) { color = 0xff8844; alpha = 0.16 * ((hour - 17.5) / 3.5); }
    nightAlpha = (hour >= 20 || hour < 5.5) ? 1 : (hour >= 17.5 ? (hour - 17.5) / 2.5 : 0);
    if (nightAlpha > 1) nightAlpha = 1;
    tintOverlay.clear();
    if (alpha > 0.01) {
      tintOverlay.beginFill(color, alpha);
      tintOverlay.drawRect(0, 0, app.screen.width, app.screen.height);
      tintOverlay.endFill();
    }
    // 밤~해질녘 색보정이 강할수록 광원 표시
    var flicker = 0.9 + Math.sin(animTime * 7) * 0.08;
    for (var n = 0; n < lights.length; n++) {
      var l = lights[n];
      l.spr.alpha = nightAlpha * flicker;
      l.spr.visible = nightAlpha > 0.03;
      l.spr.x = cam.x + l.wx * cam.zoom;
      l.spr.y = cam.y + l.wy * cam.zoom;
      l.spr.scale.set(cam.zoom);
    }
  }

  function setSeasonTint(color, alpha) {
    seasonOverlay.clear();
    if (color && alpha > 0.01) {
      seasonOverlay.beginFill(color, alpha);
      seasonOverlay.drawRect(0, 0, app.screen.width, app.screen.height);
      seasonOverlay.endFill();
    }
  }

  // ── 미니맵 (9) — DOM 캔버스에 다운스케일 렌더 ──
  var miniCv = document.getElementById('minimap');
  var miniCtx = miniCv ? miniCv.getContext('2d') : null;
  var MINI = miniCv ? miniCv.width / MAP_W : 0; // 픽셀/타일
  var miniLandCache = null;
  function drawMinimap(pawns) {
    if (!miniCtx) return;
    var W = miniCv.width, H = miniCv.height;
    // 지형은 최초 1회 캐시
    if (!miniLandCache) {
      miniCtx.fillStyle = '#2f6db0'; miniCtx.fillRect(0, 0, W, H); // 바다
      for (var y = 0; y < MAP_H; y++) for (var x = 0; x < MAP_W; x++) {
        var tt = world.terrain[idx(x, y)];
        if (tt === T_WATER) continue;
        miniCtx.fillStyle = tt === T_SAND ? '#dcc98a' : '#6ab04a';
        miniCtx.fillRect(x * MINI, y * MINI, MINI + 0.5, MINI + 0.5);
      }
      miniLandCache = miniCtx.getImageData(0, 0, W, H);
    } else {
      miniCtx.putImageData(miniLandCache, 0, 0);
    }
    // 건물
    for (var id in world.buildings) {
      var b = world.buildings[id];
      if (b.stage !== 'built') continue;
      miniCtx.fillStyle = (b.kind === 'goldmine') ? '#ffd94d'
        : (b.kind === 'ironmine') ? '#b8c0cc'
        : (b.natural ? '#888' : '#c98a4b');
      var def = buildingDef(b.kind);
      miniCtx.fillRect(b.x * MINI, b.y * MINI, def.fw * MINI, def.fh * MINI);
    }
    // 적(빨강)·정착민(흰)
    var n;
    miniCtx.fillStyle = '#ff4b4b';
    for (n = 0; n < world.enemies.length; n++) {
      miniCtx.fillRect(world.enemies[n].px * MINI - 1, world.enemies[n].py * MINI - 1, 3, 3);
    }
    miniCtx.fillStyle = '#ffffff';
    for (n = 0; n < pawns.length; n++) {
      if (pawns[n].state === 'dead') continue;
      miniCtx.fillRect(pawns[n].px * MINI - 1, pawns[n].py * MINI - 1, 3, 3);
    }
    // 카메라 뷰포트 사각형
    var vx = (-cam.x / cam.zoom / TILE) * MINI;
    var vy = (-cam.y / cam.zoom / TILE) * MINI;
    var vw = (app.screen.width / cam.zoom / TILE) * MINI;
    var vh = (app.screen.height / cam.zoom / TILE) * MINI;
    miniCtx.strokeStyle = 'rgba(255,255,255,0.9)'; miniCtx.lineWidth = 1;
    miniCtx.strokeRect(vx, vy, vw, vh);
  }

  // ── 카메라 ──
  var cam = { x: 0, y: 0, zoom: ZOOM_DEFAULT };
  function applyCamera() {
    cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom));
    var worldPxW = MAP_W * TILE * cam.zoom;
    var worldPxH = MAP_H * TILE * cam.zoom;
    var margin = 160;
    cam.x = Math.max(-(worldPxW - app.screen.width + margin), Math.min(margin, cam.x));
    cam.y = Math.max(-(worldPxH - app.screen.height + margin), Math.min(margin, cam.y));
    camera.scale.set(cam.zoom);
    camera.position.set(cam.x, cam.y);
  }
  function centerOn(tileX, tileY) {
    cam.x = app.screen.width / 2 - (tileX + 0.5) * TILE * cam.zoom;
    cam.y = app.screen.height / 2 - (tileY + 0.5) * TILE * cam.zoom;
    applyCamera();
  }
  function screenToTile(sx, sy) {
    return {
      x: Math.floor((sx - cam.x) / cam.zoom / TILE),
      y: Math.floor((sy - cam.y) / cam.zoom / TILE),
    };
  }

  // ── 애니메이션 틱 ──
  function tick(dtSec) {
    animTime += dtSec;
    var foamF = (animTime / 0.15) | 0;
    for (var n = 0; n < foamSprites.length; n++) {
      var fs = foamSprites[n];
      fs.texture = foamFrames[(foamF + fs.foamPhase) % 8];
    }
    var treeF = (animTime / 0.3) | 0;
    for (var m = 0; m < treeList.length; m++) {
      var ts2 = treeList[m];
      ts2.texture = treeFrames[(treeF + ts2.treePhase) % 4];
    }
    var fireF = (animTime / 0.09) | 0;
    for (var id in bSprites) {
      var b = world.buildings[id];
      if (b && b.kind === 'campfire' && b.stage === 'built') {
        bSprites[id].texture = fireFrames[(fireF + bSprites[id].firePhase) % 7];
      }
    }
    syncSheep();
    syncEnemies();
  }

  refreshAll();
  rebuildLights();
  centerOn(MAP_W / 2, MAP_H / 2);

  return {
    app: app,
    cam: cam,
    applyCamera: applyCamera,
    centerOn: centerOn,
    screenToTile: screenToTile,
    refreshTile: refreshTile,
    refreshItem: refreshItem,
    refreshCrop: refreshCrop,
    refreshZones: refreshZones,
    refreshBuilding: refreshBuilding,
    removeBuildingSprite: removeBuildingSprite,
    refreshAll: refreshAll,
    rebuildLights: rebuildLights,
    addPawn: addPawn,
    updatePawnSprite: updatePawnSprite,
    setSelected: setSelected,
    tickSelection: tickSelection,
    showDrag: showDrag,
    setTimeOfDay: setTimeOfDay,
    setSeasonTint: setSeasonTint,
    syncEnemies: syncEnemies,
    drawMinimap: drawMinimap,
    invalidateMinimapTerrain: function () { miniLandCache = null; },
    tick: tick,
  };
}

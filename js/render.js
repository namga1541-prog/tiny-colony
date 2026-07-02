// PixiJS 렌더러: 지형·오브젝트·아이템·설계도·정착민·구역 오버레이·카메라
/* global PIXI */
import { TILE, MAP_W, MAP_H, SHEET, SPR, SHORE, GHOST_CHAR } from './config.js';
import { idx, ix, iy, inMap, T_WATER } from './world.js';

var SCALE = 3; // 16px 타일을 48px 로 표시 (기본 줌)

export function createRenderer(world) {
  var app = new PIXI.Application({
    resizeTo: window,
    background: 0x2a3b28,
    antialias: false,
  });
  document.getElementById('stage').appendChild(app.view);

  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

  var sheets = {};
  for (var sk in SHEET) {
    sheets[sk] = PIXI.BaseTexture.from(SHEET[sk].url);
    sheets[sk].scaleMode = PIXI.SCALE_MODES.NEAREST;
  }

  var texCache = {};
  function texOf(sheetKey, i) {
    var ck = sheetKey + ':' + i;
    if (texCache[ck]) return texCache[ck];
    var meta = SHEET[sheetKey];
    var col = i % meta.cols, row = (i / meta.cols) | 0;
    var step = TILE + meta.sp;
    var t = new PIXI.Texture(sheets[sheetKey],
      new PIXI.Rectangle(col * step, row * step, TILE, TILE));
    texCache[ck] = t;
    return t;
  }
  function tex(sprKey) {
    var def = SPR[sprKey];
    return texOf(def[0], def[1]);
  }

  // ── 캐릭터 텍스처 (Ninja Adventure: Walk 4방향x4프레임, Idle 4방향) ──
  var charCache = {};
  function charTex(name) {
    if (charCache[name]) return charCache[name];
    var wb = PIXI.BaseTexture.from('assets/ninja/' + name + '/Walk.png');
    var ib = PIXI.BaseTexture.from('assets/ninja/' + name + '/Idle.png');
    wb.scaleMode = PIXI.SCALE_MODES.NEAREST;
    ib.scaleMode = PIXI.SCALE_MODES.NEAREST;
    var walk = [], idle = [];
    for (var d = 0; d < 4; d++) {
      idle.push(new PIXI.Texture(ib, new PIXI.Rectangle(d * TILE, 0, TILE, TILE)));
      var frames = [];
      for (var f = 0; f < 4; f++) {
        frames.push(new PIXI.Texture(wb, new PIXI.Rectangle(d * TILE, f * TILE, TILE, TILE)));
      }
      walk.push(frames);
    }
    charCache[name] = { walk: walk, idle: idle };
    return charCache[name];
  }

  // ── 레이어 ──
  var camera = new PIXI.Container();
  app.stage.addChild(camera);

  var terrainLayer = new PIXI.Container();
  var builtLayer = new PIXI.Container();     // 바닥·벽·침대
  var zoneGfx = new PIXI.Graphics();         // 비축 구역·지정 표시
  var itemLayer = new PIXI.Container();
  var bpLayer = new PIXI.Container();        // 설계도 고스트
  var objLayer = new PIXI.Container();       // 나무·바위·버섯
  var pawnLayer = new PIXI.Container();
  var selGfx = new PIXI.Graphics();          // 선택 링
  var dragGfx = new PIXI.Graphics();         // 드래그 박스
  camera.addChild(terrainLayer, builtLayer, zoneGfx, itemLayer, bpLayer, objLayer, pawnLayer, selGfx, dragGfx);

  var darkness = new PIXI.Graphics();        // 밤 어둡기 (화면 고정)
  app.stage.addChild(darkness);

  // ── 지형 (정적) ──
  var TERRAIN_SPR = ['grass', 'grassDecor', 'flowerRed', 'dirt', 'dirtDecor', 'water', 'flowerWhite', 'flowerBlue'];

  function isLandAt(x, y) {
    if (!inMap(x, y)) return false; // 맵 밖은 물 취급 (호수는 경계에 안 닿음)
    return world.terrain[idx(x, y)] !== T_WATER;
  }

  // 물 타일: 이웃 육지 방향에 따라 호숫가 전환 타일 선택
  function waterTex(x, y) {
    var n = isLandAt(x, y - 1), s = isLandAt(x, y + 1);
    var w = isLandAt(x - 1, y), e = isLandAt(x + 1, y);
    var key = null;
    if (n && w) key = 'TL';
    else if (n && e) key = 'TR';
    else if (s && w) key = 'BL';
    else if (s && e) key = 'BR';
    else if (n) key = 'T';
    else if (s) key = 'B';
    else if (w) key = 'L';
    else if (e) key = 'R';
    if (!key) return tex('water');
    return texOf(SHORE[key][0], SHORE[key][1]);
  }

  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var code = world.terrain[idx(x, y)];
      var t2 = code === T_WATER ? waterTex(x, y) : tex(TERRAIN_SPR[code]);
      var s = new PIXI.Sprite(t2);
      s.x = x * TILE; s.y = y * TILE;
      terrainLayer.addChild(s);
    }
  }

  // ── 동적 스프라이트 (idx 키) ──
  var objSprites = {};
  var builtSprites = {};
  var bpSprites = {};
  var itemSprites = {};   // idx -> {spr, label}

  var OBJ_SPR = { tree: 'treeGreen', treeO: 'treeOrange', pine: 'pine', rock: 'rock', berry: 'berry' };
  var ITEM_SPR = { wood: 'itemWood', stone: 'itemStone', food: 'itemFood' };
  var DESIG_COLOR = { chop: 0xff8844, mine: 0x66bbff, forage: 0x77dd66 };

  function refreshTile(i) {
    // 자연물
    var o = world.objects[i];
    if (o && !objSprites[i]) {
      var s = new PIXI.Sprite(tex(OBJ_SPR[o.kind]));
      s.x = ix(i) * TILE; s.y = iy(i) * TILE;
      objSprites[i] = s;
      objLayer.addChild(s);
    } else if (!o && objSprites[i]) {
      objLayer.removeChild(objSprites[i]);
      objSprites[i].destroy();
      delete objSprites[i];
    }

    // 건축물
    var b = world.built[i];
    if (b && !builtSprites[i]) {
      var bs = new PIXI.Sprite(tex(b.kind));
      bs.x = ix(i) * TILE; bs.y = iy(i) * TILE;
      builtSprites[i] = bs;
      builtLayer.addChild(bs);
    } else if (!b && builtSprites[i]) {
      builtLayer.removeChild(builtSprites[i]);
      builtSprites[i].destroy();
      delete builtSprites[i];
    }

    // 설계도 고스트
    var bp = world.blueprints[i];
    if (bp && !bpSprites[i]) {
      var gs = new PIXI.Sprite(tex(bp.kind));
      gs.x = ix(i) * TILE; gs.y = iy(i) * TILE;
      gs.alpha = 0.45;
      gs.tint = 0x8ab6ff;
      bpSprites[i] = gs;
      bpLayer.addChild(gs);
    } else if (!bp && bpSprites[i]) {
      bpLayer.removeChild(bpSprites[i]);
      bpSprites[i].destroy();
      delete bpSprites[i];
    }
  }

  function refreshItem(i) {
    var slot = world.items[i];
    var entry = itemSprites[i];
    if (slot) {
      var type = null, total = 0;
      for (var k in slot) { if (slot[k] > 0) { type = type || k; total += slot[k]; } }
      if (!type) { slot = null; }
      if (type) {
        if (!entry) {
          var spr = new PIXI.Sprite(tex(ITEM_SPR[type]));
          var label = new PIXI.Text('', {
            fontFamily: 'monospace', fontSize: 26, fill: 0xffffff,
            stroke: 0x000000, strokeThickness: 6,
          });
          label.scale.set(0.18);
          entry = { spr: spr, label: label, type: type };
          itemSprites[i] = entry;
          itemLayer.addChild(spr);
          itemLayer.addChild(label);
        }
        if (entry.type !== type) {
          entry.spr.texture = tex(ITEM_SPR[type]);
          entry.type = type;
        }
        entry.spr.x = ix(i) * TILE + 2; entry.spr.y = iy(i) * TILE + 2;
        entry.spr.width = TILE - 4; entry.spr.height = TILE - 4;
        entry.label.text = String(total);
        entry.label.x = ix(i) * TILE + 1;
        entry.label.y = iy(i) * TILE + TILE - 6.5;
        return;
      }
    }
    if (entry) {
      itemLayer.removeChild(entry.spr); entry.spr.destroy();
      itemLayer.removeChild(entry.label); entry.label.destroy();
      delete itemSprites[i];
    }
  }

  function refreshZones() {
    zoneGfx.clear();
    var i;
    for (i in world.stockpile) {
      zoneGfx.beginFill(0xffd76e, 0.16);
      zoneGfx.drawRect(ix(+i) * TILE, iy(+i) * TILE, TILE, TILE);
      zoneGfx.endFill();
      zoneGfx.lineStyle(0.6, 0xffd76e, 0.5);
      zoneGfx.drawRect(ix(+i) * TILE + 0.3, iy(+i) * TILE + 0.3, TILE - 0.6, TILE - 0.6);
      zoneGfx.lineStyle(0);
    }
    for (i in world.designations) {
      var c = DESIG_COLOR[world.designations[i]] || 0xffffff;
      zoneGfx.lineStyle(1, c, 0.9);
      zoneGfx.drawRect(ix(+i) * TILE + 1, iy(+i) * TILE + 1, TILE - 2, TILE - 2);
      zoneGfx.lineStyle(0);
    }
  }

  function refreshAll() {
    var i;
    var seen = {};
    for (i in world.objects) seen[i] = 1;
    for (i in world.built) seen[i] = 1;
    for (i in world.blueprints) seen[i] = 1;
    for (i in objSprites) seen[i] = 1;
    for (i in builtSprites) seen[i] = 1;
    for (i in bpSprites) seen[i] = 1;
    for (i in seen) refreshTile(+i);
    var seenItems = {};
    for (i in world.items) seenItems[i] = 1;
    for (i in itemSprites) seenItems[i] = 1;
    for (i in seenItems) refreshItem(+i);
    refreshZones();
  }

  // ── 정착민 (4방향 걷기 애니메이션) ──
  var pawnSprites = {};
  function addPawn(pawn) {
    var ct = charTex(pawn.char);
    var s = new PIXI.Sprite(ct.idle[0]);
    s.anchor.set(0.5, 0.6);
    pawnLayer.addChild(s);
    var zzz = new PIXI.Text('💤', { fontSize: 26 });
    zzz.scale.set(0.22);
    zzz.visible = false;
    pawnLayer.addChild(zzz);
    var carry = new PIXI.Sprite();
    carry.visible = false;
    carry.width = TILE * 0.5; carry.height = TILE * 0.5;
    pawnLayer.addChild(carry);
    pawnSprites[pawn.id] = { spr: s, zzz: zzz, carry: carry };
    updatePawnSprite(pawn);
  }

  function updatePawnSprite(pawn) {
    var e = pawnSprites[pawn.id];
    if (!e) return;
    e.spr.x = (pawn.px + 0.5) * TILE;
    e.spr.y = (pawn.py + 0.5) * TILE;

    var dir = pawn.dir || 0;
    var t;
    if (pawn.state === 'dead') {
      t = charTex(GHOST_CHAR).idle[0];
      e.spr.alpha = 0.7;
    } else if (pawn.state === 'moving') {
      var frame = ((performance.now() / 140) | 0) % 4;
      t = charTex(pawn.char).walk[dir][frame];
    } else if (pawn.state === 'working' || pawn.state === 'eating') {
      // 작업 중엔 두 프레임을 번갈아 살짝 움직이는 느낌
      var f2 = ((performance.now() / 260) | 0) % 2;
      t = charTex(pawn.char).walk[dir][f2 * 2];
    } else {
      t = charTex(pawn.char).idle[dir];
    }
    if (e.spr.texture !== t) e.spr.texture = t;

    e.zzz.visible = pawn.state === 'sleeping';
    e.zzz.x = e.spr.x + 3; e.zzz.y = e.spr.y - TILE * 0.95;
    if (pawn.carry) {
      e.carry.visible = true;
      e.carry.texture = tex(ITEM_SPR[pawn.carry.type]);
      e.carry.x = e.spr.x - TILE * 0.25;
      e.carry.y = e.spr.y - TILE * 0.9;
      e.carry.width = TILE * 0.5; e.carry.height = TILE * 0.5;
    } else {
      e.carry.visible = false;
    }
  }

  function setSelected(pawn) {
    selGfx.clear();
    if (pawn) {
      selGfx.lineStyle(1, 0xffffff, 0.9);
      selGfx.drawCircle(0, 0, TILE * 0.55);
      selGfx.position.set((pawn.px + 0.5) * TILE, (pawn.py + 0.5) * TILE);
      selGfx.visible = true;
      selGfx.pawnRef = pawn;
    } else {
      selGfx.visible = false;
      selGfx.pawnRef = null;
    }
  }

  function tickSelection() {
    if (selGfx.visible && selGfx.pawnRef) {
      selGfx.position.set((selGfx.pawnRef.px + 0.5) * TILE, (selGfx.pawnRef.py + 0.5) * TILE);
    }
  }

  // ── 드래그 박스 ──
  function showDrag(x0, y0, x1, y1, color) {
    dragGfx.clear();
    if (x0 === null) return;
    var minX = Math.min(x0, x1), minY = Math.min(y0, y1);
    var w = Math.abs(x1 - x0) + 1, h = Math.abs(y1 - y0) + 1;
    dragGfx.beginFill(color, 0.15);
    dragGfx.drawRect(minX * TILE, minY * TILE, w * TILE, h * TILE);
    dragGfx.endFill();
    dragGfx.lineStyle(1, color, 0.9);
    dragGfx.drawRect(minX * TILE, minY * TILE, w * TILE, h * TILE);
    dragGfx.lineStyle(0);
  }

  // ── 밤 어둡기 ──
  function setDarkness(alpha) {
    darkness.clear();
    if (alpha <= 0.01) return;
    darkness.beginFill(0x0a1030, alpha);
    darkness.drawRect(0, 0, app.screen.width, app.screen.height);
    darkness.endFill();
  }

  // ── 카메라 ──
  var cam = { x: 0, y: 0, zoom: SCALE };
  function applyCamera() {
    cam.zoom = Math.max(1.2, Math.min(8, cam.zoom));
    var worldPxW = MAP_W * TILE * cam.zoom;
    var worldPxH = MAP_H * TILE * cam.zoom;
    var margin = 200;
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
    var wx = (sx - cam.x) / cam.zoom / TILE;
    var wy = (sy - cam.y) / cam.zoom / TILE;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  refreshAll();
  centerOn(MAP_W / 2, MAP_H / 2);

  return {
    app: app,
    cam: cam,
    applyCamera: applyCamera,
    centerOn: centerOn,
    screenToTile: screenToTile,
    refreshTile: refreshTile,
    refreshItem: refreshItem,
    refreshZones: refreshZones,
    refreshAll: refreshAll,
    addPawn: addPawn,
    updatePawnSprite: updatePawnSprite,
    setSelected: setSelected,
    tickSelection: tickSelection,
    showDrag: showDrag,
    setDarkness: setDarkness,
  };
}

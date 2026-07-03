// v0.3 렌더러 (Tiny Swords): 지형·거품·건물·유닛 애니메이션·조명·색보정
/* global PIXI */
import {
  TILE, MAP_W, MAP_H, TS, BUILDS, HUMANS, OUTPOST_BRANCHES,
  ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX,
} from './config.js';
import {
  idx, ix, iy, inMap, T_WATER, T_GRASS, T_SAND, buildingDef,
} from './world.js';
import { poseOf, toolIconOf } from './pawns.js';
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
    'Pig', 'Cow', 'Chicken',
    'deco03'];
  var base = {};
  SHEETS.forEach(function (n) {
    base[n] = PIXI.BaseTexture.from(TS + n + '.png');
    base[n].scaleMode = PIXI.SCALE_MODES.NEAREST;
  });
  // 건물 전용: Kenney Tiny Town 타일맵(16px, 12x11) — 건물별 고유 스프라이트 크롭용
  base.TinyTown = PIXI.BaseTexture.from('assets/town/Tilemap/tilemap_packed.png');
  base.TinyTown.scaleMode = PIXI.SCALE_MODES.NEAREST;
  // 사람 캐릭터 시트 (Ninja Adventure, 16px 4방향) — 사람별 Idle/Walk
  for (var hk in HUMANS) {
    base['nj_' + hk + '_idle'] = PIXI.BaseTexture.from('assets/ninja/' + HUMANS[hk].dir + '/Idle.png');
    base['nj_' + hk + '_walk'] = PIXI.BaseTexture.from('assets/ninja/' + HUMANS[hk].dir + '/Walk.png');
    base['nj_' + hk + '_idle'].scaleMode = PIXI.SCALE_MODES.NEAREST;
    base['nj_' + hk + '_walk'].scaleMode = PIXI.SCALE_MODES.NEAREST;
  }

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
  // 소형 동물(돼지·소·닭): 16px, 2프레임
  var animalFrames = {
    pig: [tx('Pig', 0, 0, 16, 16), tx('Pig', 16, 0, 16, 16)],
    cow: [tx('Cow', 0, 0, 16, 16), tx('Cow', 16, 0, 16, 16)],
    chicken: [tx('Chicken', 0, 0, 16, 16), tx('Chicken', 16, 0, 16, 16)],
  };
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

  // 사람 스프라이트 크롭. dir: 0정면 1뒤 2좌 3우.
  // idle: 방향=열(64x16). walk: 방향=행, 프레임=열(64x64). 각 16px.
  function pawnTex(look, pose, frame, dir) {
    var hk = (look && look.human && HUMANS[look.human]) ? look.human : 'villager';
    dir = dir || 0;
    if (pose === 'walk') return tx('nj_' + hk + '_walk', (frame % 4) * 16, dir * 16, 16, 16);
    return tx('nj_' + hk + '_idle', dir * 16, 0, 16, 16);
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
  var fxLayer = new PIXI.Graphics(); // 방어건물 공격 이펙트(투사체 궤적·타격 섬광)
  camera.addChild(waterLayer, foamLayer, landLayer, groundDecor, zoneGfx, itemLayer, objLayer, fxLayer, selGfx, dragGfx);

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
  var bBadges = {};       // buildingId -> 기능 배지(이모지) 텍스트
  var treeList = [];      // 흔들림 애니용

  // 건물 기능 명패 — 지붕 위 색 명패 + 아이콘으로 건물 종류를 한눈에 구분(에셋이 비슷해 보강).
  var BUILDING_SIGN = {
    house:     { icon: '🏠', color: 0x6b4a2f },
    smithy:    { icon: '⚒️', color: 0x455066 },
    warehouse: { icon: '📦', color: 0xb5732a },
    clinic:    { icon: '🏥', color: 0xd94a52 },
    ranch:     { icon: '🐑', color: 0x4e8a3a },
    tower:     { icon: '🏹', color: 0x556070 },
    outpost:   { icon: '🛡️', color: 0x8a7444 },
    castle:    { icon: '👑', color: 0x7a5a20 },
  };

  function refreshTile(i) {
    var o = world.objects[i];
    var cur = objSprites[i];
    var OBJ_KINDS = { tree: 1, mushroom: 1, chest: 1, rareplant: 1 };
    var wantKind = o && OBJ_KINDS[o.kind] ? o.kind : null;
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
      } else if (wantKind === 'chest' || wantKind === 'rareplant') {
        s = new PIXI.Sprite(worldObjTex(wantKind));
        s.anchor.set(0.5, 0.85);
        s.scale.set(2.2);
        s.x = ix(i) * TILE + 32; s.y = (iy(i) + 1) * TILE - 8;
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
    if (def.town) { // Tiny Town 고유 건물 스프라이트 (타일맵에서 크롭)
      return tx('TinyTown', def.town.sx, def.town.sy, def.town.sw, def.town.sh);
    }
    if (b.stage === 'bp' && bpMissing(b) === null) {
      return tx(def.imgC, 0, 0, def.pw, def.ph); // 자재 완비 → 공사 중 모습
    }
    return tx(def.img, 0, 0, def.pw, def.ph);
  }

  function updateBuildingBadge(b, def) {
    // 완공된 건물에만 명패 표시 (설계도·모닥불·다리·광산 제외)
    var sign = (b.stage === 'built') ? BUILDING_SIGN[b.kind] : null;
    var icon = sign ? sign.icon : null;
    var color = sign ? sign.color : 0x333a48;
    // 특화된 초소는 분기 아이콘·색으로 교체(가시벽🧱·석궁탑🎯·투석기💣·속사탑⚡)
    if (b.stage === 'built' && b.branch && OUTPOST_BRANCHES[b.branch]) {
      icon = OUTPOST_BRANCHES[b.branch].badge;
      color = OUTPOST_BRANCHES[b.branch].tint;
    }
    var badge = bBadges[b.id];
    if (!icon) {
      if (badge) { objLayer.removeChild(badge); badge.destroy({ children: true }); delete bBadges[b.id]; }
      return;
    }
    if (!badge) {
      badge = new PIXI.Container();
      badge.plate = new PIXI.Graphics();
      badge.txt = new PIXI.Text('', { fontSize: 26 });
      badge.txt.anchor.set(0.5, 0.5);
      badge.addChild(badge.plate); badge.addChild(badge.txt);
      objLayer.addChild(badge);
      bBadges[b.id] = badge;
    }
    if (badge.txt.text !== icon) badge.txt.text = icon;
    if (badge.signColor !== color) {
      badge.signColor = color;
      var W = 40, H = 34, r = 9;
      badge.plate.clear();
      badge.plate.lineStyle(3, 0x15171d, 1);
      badge.plate.beginFill(color, 0.96);
      badge.plate.drawRoundedRect(-W / 2, -H / 2, W, H, r);
      badge.plate.endFill();
      // 지붕에 꽂힌 팻말 느낌의 작은 기둥
      badge.plate.lineStyle(0);
      badge.plate.beginFill(0x15171d, 0.9);
      badge.plate.drawRect(-2.5, H / 2 - 1, 5, 9);
      badge.plate.endFill();
    }
    badge.x = (b.x + def.fw / 2) * TILE;
    badge.y = b.y * TILE - 14; // 지붕 위로 명패를 띄움
    badge.zIndex = 2000000;    // 항상 건물 위
  }

  function refreshBuilding(b) {
    var e = bSprites[b.id];
    if (!b || !world.buildings[b.id]) {
      if (e) { objLayer.removeChild(e); e.destroy(); delete bSprites[b.id]; }
      var bg = bBadges[b.id];
      if (bg) { objLayer.removeChild(bg); bg.destroy({ children: true }); delete bBadges[b.id]; }
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
      // 특화된 초소는 분기별 색조로 구분(가시벽=초록·석궁탑=갈색·투석기=회색·속사탑=파랑)
      var branchTint = (b.branch && OUTPOST_BRANCHES[b.branch]) ? OUTPOST_BRANCHES[b.branch].tint : null;
      e.tint = branchTint || (b.kind === 'ironmine' ? 0xaab4c2 : (def.tint || 0xffffff));
    }
    // Tiny Town 건물: 소스 크롭을 풋프린트 폭(fw*TILE)에 맞춰 확대 (16px→표시 크기)
    if (def.town) {
      var tScale = (def.fw * TILE) / def.town.sw;
      if (b.kind === 'warehouse') tScale *= 1 + ((b.tier || 1) - 1) * 0.08; // 창고 단계 확대 유지
      e.scale.set(tScale);
    } else if (b.kind === 'warehouse') {
      // 창고 업그레이드 단계: 단계가 오를수록 조금씩 커 보이게 (앵커가 바닥이라 자연스럽게 위로 자람)
      var wScale = 1 + ((b.tier || 1) - 1) * 0.08;
      e.scale.set(wScale);
    } else if (e.scale.x !== 1 || e.scale.y !== 1) {
      e.scale.set(1);
    }
    updateBuildingBadge(b, def);
    rebuildLights();
  }

  function removeBuildingSprite(bid) {
    var e = bSprites[bid];
    if (e) { objLayer.removeChild(e); e.destroy(); delete bSprites[bid]; }
    var bg = bBadges[bid];
    if (bg) { objLayer.removeChild(bg); bg.destroy({ children: true }); delete bBadges[bid]; }
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
    for (i in world.fishDesig) {
      zoneGfx.lineStyle(3, 0x4fd6ff, 0.85);
      zoneGfx.drawRect(ix(+i) * TILE + 3, iy(+i) * TILE + 3, TILE - 6, TILE - 6);
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
    var s = new PIXI.Sprite(pawnTex(pawn.look, 'idle', 0, 0));
    s.anchor.set(0.5, 0.85);
    s.scale.set(3.2); // 16px → ~51px (사람 ~0.8타일)
    var name = new PIXI.Text(pawn.name, {
      fontFamily: 'Malgun Gothic', fontSize: 22, fill: 0xffffff, fontWeight: '600',
      stroke: 0x14161c, strokeThickness: 5,
    });
    name.anchor.set(0.5, 1);
    name.scale.set(0.62);
    var carry = new PIXI.Sprite();
    carry.visible = false;
    var tool = new PIXI.Sprite(); // 코드로 그린 픽셀 도구(도끼·곡괭이·낚싯대 등)
    tool.visible = false;
    pawnSprites[pawn.id] = { spr: s, name: name, carry: carry, tool: tool, animOff: pawn.id * 2 };
    objLayer.addChild(s); objLayer.addChild(name); objLayer.addChild(carry); objLayer.addChild(tool);
    updatePawnSprite(pawn);
  }
  // 정착민 스프라이트 완전 제거 (삽으로 시신 매장 시)
  function removePawn(pawnId) {
    var e = pawnSprites[pawnId];
    if (!e) return;
    [e.spr, e.name, e.carry, e.tool].forEach(function (o) {
      if (o) { if (o.parent) o.parent.removeChild(o); o.destroy(); }
    });
    delete pawnSprites[pawnId];
  }

  var animTime = 0;
  var TAU = Math.PI * 2;
  // 작업별 도구 동작: m=모션(swing 휘두르기/cast 낚시/shake 흔들기/bob 굽히기), p=파티클, rate=주기(회/초)
  var WORK_MOTION = {
    mine:        { m: 'swing', p: 'sparks', rate: 2.6 },
    build:       { m: 'swing', p: 'dust',   rate: 3.0 },
    craft:       { m: 'swing', p: 'forge',  rate: 3.0 },
    hunt:        { m: 'swing', p: null,     rate: 3.2 },
    fish:        { m: 'cast',  p: 'splash', rate: 1.1 },
    cook:        { m: 'shake', p: 'steam',  rate: 3.6 },
    plant:       { m: 'bob',   p: null,     rate: 1.6 },
    harvestCrop: { m: 'bob',   p: 'grain',  rate: 2.0 },
  };
  function motionFor(pawn) { // gather 는 대상(나무 vs 버섯)에 따라 도끼질/줍기 구분
    var j = pawn.job;
    if (!j) return null;
    if (j.type === 'gather') {
      var o = world.objects[j.idx];
      if (o && o.kind === 'mushroom') return { m: 'bob', p: null, rate: 1.6 };
      return { m: 'swing', p: 'chips', rate: 2.4 };
    }
    return WORK_MOTION[j.type] || null;
  }

  // ── 코드로 그린 픽셀 도구 (이모지 대체 — 오른손잡이 기준으로 그리고 좌향 시 좌우반전) ──
  var WOOD = 0x7a5230, WOOD_D = 0x553921, STEEL = 0xc2cad6, STEEL_D = 0x8b93a0;
  function drawTool(g, kind) {
    if (kind === 'axe') {
      g.beginFill(WOOD); g.drawRect(6, 5, 2.2, 12); g.endFill();           // 자루
      g.beginFill(STEEL); g.drawPolygon([3, 3, 11, 6, 10, 10, 4, 8]); g.endFill(); // 날
      g.beginFill(STEEL_D); g.drawPolygon([10.5, 7, 11, 6, 10, 10, 9.6, 9]); g.endFill();
    } else if (kind === 'pickaxe') {
      g.beginFill(WOOD); g.drawRect(6, 5, 2.2, 12); g.endFill();
      g.beginFill(STEEL); g.drawPolygon([1, 4, 7, 6.5, 13, 4, 12.5, 5.5, 7, 8, 1.5, 5.5]); g.endFill();
    } else if (kind === 'hammer') {
      g.beginFill(WOOD); g.drawRect(6, 5, 2.2, 12); g.endFill();
      g.beginFill(STEEL); g.drawRect(3, 2, 8, 4.5); g.endFill();
      g.beginFill(STEEL_D); g.drawRect(3, 2, 8, 1.4); g.endFill();
    } else if (kind === 'rod') {
      g.lineStyle(1.8, WOOD); g.moveTo(4, 17); g.lineTo(12, 2); g.lineStyle(0); // 낚싯대
      g.lineStyle(0.8, 0xdfe6ef); g.moveTo(12, 2); g.lineTo(12.2, 11); g.lineStyle(0); // 줄
      g.beginFill(0xff5b5b); g.drawCircle(12.2, 11.5, 1.6); g.endFill(); // 찌(위 빨강)
      g.beginFill(0xffffff); g.drawRect(10.9, 11.5, 2.6, 1.1); g.endFill();
    } else if (kind === 'pan') {
      g.beginFill(WOOD); g.drawRect(8, 8.4, 6, 2); g.endFill();            // 손잡이
      g.beginFill(STEEL_D); g.drawCircle(5, 9.4, 4); g.endFill();
      g.beginFill(0x2b2f37); g.drawCircle(5, 9.4, 2.6); g.endFill();
    } else if (kind === 'bow') {
      g.lineStyle(1.8, WOOD); g.moveTo(9, 3); g.arc(4, 9, 6.3, -0.95, 0.95); g.lineStyle(0);
      g.lineStyle(0.7, 0xe8e2cf); g.moveTo(9, 3); g.lineTo(9, 15); g.lineStyle(0); // 시위
    } else if (kind === 'sickle') {
      g.beginFill(WOOD); g.drawRect(6.5, 10, 2, 7); g.endFill();
      g.lineStyle(2, STEEL); g.moveTo(7.5, 10.5); g.arc(4, 8, 4.2, 0.7, -1.8, true); g.lineStyle(0);
    } else if (kind === 'trowel') {
      g.beginFill(WOOD); g.drawRect(6.2, 9, 2.4, 7); g.endFill();
      g.beginFill(STEEL); g.drawPolygon([4, 2, 9, 2, 7, 10]); g.endFill();
    } else if (kind === 'basket') {
      g.beginFill(0x9a6b3a); g.drawPolygon([3, 8, 11, 8, 9.5, 15, 4.5, 15]); g.endFill();
      g.beginFill(WOOD_D); g.drawRect(2.5, 7.2, 9, 1.6); g.endFill();       // 테두리
    } else if (kind === 'heart') {
      g.beginFill(0xff5b6e); g.drawCircle(4.6, 5.4, 2.7); g.drawCircle(8.4, 5.4, 2.7);
      g.drawPolygon([2, 6.6, 11, 6.6, 6.5, 12]); g.endFill();
    }
  }
  var TOOL_ANCHOR = { // 회전 피벗(손 위치)
    axe: [0.5, 0.92], pickaxe: [0.5, 0.92], hammer: [0.5, 0.92], sickle: [0.5, 0.92],
    trowel: [0.5, 0.92], basket: [0.5, 0.9], rod: [0.32, 0.92], pan: [0.86, 0.55],
    bow: [0.5, 0.5], heart: [0.5, 0.5],
  };
  var toolTexCache = {};
  function toolTex(kind) {
    if (toolTexCache[kind]) return toolTexCache[kind];
    var g = new PIXI.Graphics();
    drawTool(g, kind);
    var tex = app.renderer.generateTexture(g, { scaleMode: PIXI.SCALE_MODES.NEAREST, resolution: 3 });
    g.destroy();
    toolTexCache[kind] = tex;
    return tex;
  }
  function toolKindFor(pawn) { // 작업/상태 → 도구 종류
    if (pawn.state === 'resting') return 'heart';
    if (pawn.state !== 'working' || !pawn.job) return null;
    switch (pawn.job.type) {
      case 'gather': var o = world.objects[pawn.job.idx];
        return (o && (o.kind === 'mushroom' || o.kind === 'chest' || o.kind === 'rareplant')) ? 'basket' : 'axe';
      case 'mine': return 'pickaxe';
      case 'build': case 'craft': return 'hammer';
      case 'hunt': return 'bow';
      case 'fish': return 'rod';
      case 'cook': return 'pan';
      case 'plant': return 'trowel';
      case 'harvestCrop': return 'sickle';
      default: return null;
    }
  }

  // ── 원정 섬 오브젝트(보물상자·희귀식물) — 코드로 그린 픽셀 스프라이트 ──
  var worldObjTexCache = {};
  function worldObjTex(kind) {
    if (worldObjTexCache[kind]) return worldObjTexCache[kind];
    var g = new PIXI.Graphics();
    if (kind === 'chest') {
      g.beginFill(0x5a3d21); g.drawRoundedRect(1, 6, 22, 14, 2); g.endFill();      // 몸체
      g.beginFill(0x7a5230); g.drawRoundedRect(1, 2, 22, 8, 3); g.endFill();       // 뚜껑
      g.beginFill(0xd8a24a); g.drawRect(1, 9, 22, 2); g.endFill();                 // 금속 띠
      g.beginFill(0xffd98a); g.drawRect(10, 9, 4, 5); g.endFill();                 // 자물쇠
      g.lineStyle(1, 0x2b1c0f); g.drawRoundedRect(1, 2, 22, 18, 3); g.lineStyle(0);
    } else if (kind === 'rareplant') {
      g.beginFill(0x3f7a3a); g.drawRect(11, 10, 2, 12); g.endFill();               // 줄기
      g.beginFill(0x59a852);
      g.drawEllipse(7, 12, 4, 2.4); g.drawEllipse(17, 10, 4, 2.4); g.endFill();    // 잎
      g.beginFill(0xd766e0); // 꽃(보라·핑크 — 희귀함 강조)
      for (var k = 0; k < 5; k++) {
        var ang = (Math.PI * 2 / 5) * k - Math.PI / 2;
        g.drawCircle(12 + Math.cos(ang) * 4.2, 4 + Math.sin(ang) * 4.2, 2.6);
      }
      g.endFill();
      g.beginFill(0xffe27a); g.drawCircle(12, 4, 2.2); g.endFill();               // 꽃심
    }
    var tex = app.renderer.generateTexture(g, { scaleMode: PIXI.SCALE_MODES.NEAREST, resolution: 3 });
    g.destroy();
    worldObjTexCache[kind] = tex;
    return tex;
  }

  function updatePawnSprite(pawn) {
    var e = pawnSprites[pawn.id];
    if (!e) return;
    var wx = (pawn.px + 0.5) * TILE, wy = (pawn.py + 0.5) * TILE;
    e.spr.x = wx; e.spr.y = wy + 10;
    e.spr.zIndex = wy + TILE * 0.5;
    e.spr.scale.set(3.2); e.spr.angle = 0; // 매 프레임 기본값(작업 시 아래에서 스쿼시·젖힘으로 override)

    // 이동 방향(0정면 1뒤 2좌 3우) — px/py 델타로 추정
    var dpx = pawn.px - (e.lastPx === undefined ? pawn.px : e.lastPx);
    var dpy = pawn.py - (e.lastPy === undefined ? pawn.py : e.lastPy);
    e.lastPx = pawn.px; e.lastPy = pawn.py;
    if (Math.abs(dpx) + Math.abs(dpy) > 0.002) {
      e.dir = Math.abs(dpx) > Math.abs(dpy) ? (dpx > 0 ? 3 : 2) : (dpy > 0 ? 0 : 1);
    } else if (e.dir === undefined) { e.dir = 0; }

    var pose = poseOf(pawn);
    if (pose === 'dead') {
      e.spr.texture = pawnTex(pawn.look, 'idle', 0, 0);
      e.spr.alpha = 0.5; e.spr.tint = 0x888888; e.spr.angle = 90; // 회색·쓰러짐
    } else {
      e.spr.alpha = 1; e.spr.tint = 0xffffff; e.spr.angle = 0;
      var frame = ((animTime / 0.15) | 0) + e.animOff;
      e.spr.texture = pawnTex(pawn.look, pose === 'walk' ? 'walk' : 'idle', frame, e.dir);
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

    // ── 작업 동작: 본체 물리 애니메이션(스쿼시·젖힘·반동) + 픽셀 도구 ──
    var tk = toolKindFor(pawn);
    if (tk) {
      if (e.toolKind !== tk) { // 도구가 바뀔 때만 텍스처·앵커 갱신
        e.tool.texture = toolTex(tk);
        var an = TOOL_ANCHOR[tk] || [0.5, 0.5];
        e.tool.anchor.set(an[0], an[1]);
        e.toolKind = tk;
      }
      e.tool.visible = true;
      e.tool.zIndex = 1000000;
      var side = pawn.face < 0 ? -1 : 1;
      var TS = 1.3;
      var mo = motionFor(pawn);
      var hx = wx + side * 11, hy = wy - 15, rot = 0;
      if (mo) {
        var ph = (animTime + e.animOff * 0.13) * mo.rate;
        var frac = ph - Math.floor(ph);
        var sx = 1, sy = 1, ang = 0, bdx = 0, bdy = 0;
        if (mo.m === 'swing') {                 // 도끼·곡괭이·망치·활: 들었다 내려치며 몸 눌림
          var sw = Math.sin(frac * Math.PI);    // 0→1→0
          var squash = sw * sw * sw * sw;       // 타격 순간 급격
          ang = side * 8 * sw; bdx = side * 3 * sw; bdy = -2 * sw;
          sy = 1 - 0.15 * squash; sx = 1 + 0.13 * squash;
          rot = -0.65 + 1.4 * sw;               // 오른손 기준(좌향은 좌우반전으로 처리)
          hx = wx + side * (11 + 4 * sw); hy = wy - 15;
        } else if (mo.m === 'cast') {           // 낚시: 잔잔히 대기하다 비트마다 챔질
          var swy = Math.sin(ph * TAU);
          var jerk = Math.max(0, 1 - frac * 3);
          ang = side * (2.5 * swy - 12 * jerk); bdx = -side * 5 * jerk;
          rot = -0.5 + 0.12 * swy - 0.5 * jerk;
          hx = wx + side * 9; hy = wy - 17;
        } else if (mo.m === 'shake') {          // 요리: 팬 흔들기
          var shk = Math.sin(ph * TAU * 2);
          ang = 2 * shk; bdx = side * 2 * shk; sy = 1 - 0.03 * Math.abs(shk);
          rot = 0.18 * shk; hx = wx + side * 13; hy = wy - 13;
        } else if (mo.m === 'bob') {            // 심기·수확·줍기: 굽혔다 폄
          var dn = Math.sin(frac * Math.PI);
          bdy = 6 * dn; sy = 1 - 0.13 * dn; sx = 1 + 0.08 * dn; ang = side * 3 * dn;
          rot = 0.3 * dn; hx = wx + side * 10; hy = wy - 12 + 6 * dn;
        }
        e.spr.scale.set(3.2 * sx, 3.2 * sy);    // 본체 스쿼시·스트레치
        e.spr.angle = ang;                      // 젖힘/기울임
        e.spr.x = wx + bdx; e.spr.y = wy + 10 + bdy; // 반동/굽힘
        if (mo.p) {                             // 타격/작용 순간 파티클
          var fire = (mo.m === 'swing' || mo.m === 'bob')
            ? (e.workPrev !== undefined && e.workPrev < 0.5 && frac >= 0.5)
            : (e.workBeat !== undefined && Math.floor(ph) !== e.workBeat);
          if (fire) {
            var fxx = wx + side * (mo.m === 'cast' ? 22 : 14);
            var fxy = wy + (mo.m === 'cast' ? 4 : (mo.m === 'shake' ? -20 : 2));
            spawnWorkFx(mo.p, fxx, fxy, side);
          }
        }
        e.workPrev = frac; e.workBeat = Math.floor(ph);
      } else {                                  // 정적(치료 하트 등)
        hx = wx + side * 13; hy = wy - 22; rot = 0;
        e.workPrev = undefined; e.workBeat = undefined;
      }
      e.tool.scale.set(TS * side, TS);          // 좌향 시 좌우반전
      e.tool.rotation = rot;
      e.tool.x = hx; e.tool.y = hy;
    } else {
      e.tool.visible = false;
      e.workPrev = undefined; e.workBeat = undefined;
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
      var type = sh.type || 'sheep';
      if (type === 'sheep') {
        sp.texture = sheepFrames[(((animTime / 0.18) | 0) + sh.phase) % 8];
        sp.scale.set(sh.dir < 0 ? -1 : 1, 1);
      } else {
        var af = animalFrames[type === 'raredeer' ? 'cow' : type] || animalFrames.pig; // 희귀 영양은 소 실루엣 재사용(금빛 색조로 구분)
        sp.texture = af[(((animTime / 0.25) | 0) + sh.phase) % 2];
        // 16px 원본 → 약 3배로 표시 (좌우 반전 유지)
        var sc = 3;
        sp.scale.set(sh.dir < 0 ? -sc : sc, sc);
      }
      sp.tint = sh.hunt ? 0xffb0b0 : (sh.rare ? 0xffdb70 : 0xffffff); // 사냥 지정=붉게, 희귀 동물(원정 섬)=금빛
    }
    // 초과 스프라이트 제거 (사냥으로 양이 줄었을 때)
    while (sheepSprites.length > world.sheep.length) {
      var extra = sheepSprites.pop();
      objLayer.removeChild(extra); extra.destroy();
    }
  }

  // ── 적(고블린 + 거인 괴민) ──
  var enemySprites = {};
  var enemyDecor = {}; // 거인 전용: { lbl(이름표), bar(HP바) }
  function syncEnemies() {
    var live = {};
    for (var n = 0; n < world.enemies.length; n++) {
      var en = world.enemies[n];
      live[en.id] = 1;
      var isG = en.kind === 'giant';
      var sp = enemySprites[en.id];
      if (!sp) {
        sp = new PIXI.Sprite(goblinIdle[0]);
        objLayer.addChild(sp);
        enemySprites[en.id] = sp;
      }
      sp.x = (en.px + 0.5) * TILE;
      sp.tint = 0xffffff;
      var GS = 16; // 거인 스케일(정착민의 ~5배 키 — 압도적이지만 전장이 보이는 크기)
      if (isG) {
        // 거대 원시인(caveman) — 나체에 가죽 팬티, 주먹으로 부수는 바보 거인
        sp.anchor.set(0.5, 0.9);
        sp.y = (en.py + 0.5) * TILE + 4;
        sp.scale.set(GS * (en.dir < 0 ? -1 : 1), GS);
        var d4 = en.dir < 0 ? 2 : 3;
        var gf = ((animTime / 0.18) | 0) + en.anim; // 느릿한 걸음
        sp.texture = pawnTex({ human: 'caveman' }, en.moving ? 'walk' : 'idle', gf, d4);
      } else {
        sp.anchor.set(0.5, 0.72);
        sp.y = (en.py + 0.5) * TILE + 14;
        sp.scale.set(en.dir < 0 ? -1 : 1, 1);
        var frames = en.moving ? goblinWalk : goblinIdle;
        sp.texture = frames[(((animTime / 0.12) | 0) + en.anim) % 6];
        if (en.kind === 'cannibal') sp.tint = 0x8a2020; // 어두운 핏빛 색조로 고블린과 구분(원정 섬 상주 식인종)
        if (en.kind === 'warlord') sp.tint = 0x5a1f8a; // 보라색 틴트로 정복자 구분(대침공 미니보스, 고블린 스프라이트 재사용)
      }
      sp.zIndex = sp.y;
      if (isG) { // 이름표 「괴민」 + HP바 (머리 위)
        var dec = enemyDecor[en.id];
        if (!dec) {
          var lbl = new PIXI.Text('괴민', {
            fontFamily: 'Malgun Gothic', fontSize: 30, fill: 0xffd7d0, fontWeight: '700',
            stroke: 0x3a1414, strokeThickness: 6,
          });
          lbl.anchor.set(0.5, 1); lbl.scale.set(0.75);
          var bar = new PIXI.Graphics();
          objLayer.addChild(lbl); objLayer.addChild(bar);
          dec = enemyDecor[en.id] = { lbl: lbl, bar: bar };
        }
        var topY = sp.y - GS * 15; // 머리 위 (16px * S * ~0.9)
        dec.lbl.x = sp.x; dec.lbl.y = topY - 8; dec.lbl.zIndex = 1000001;
        var bw = 70, bh = 7, frac = Math.max(0, (en.hp || 0) / (en.maxHp || 1));
        dec.bar.zIndex = 1000001;
        dec.bar.clear();
        dec.bar.beginFill(0x000000, 0.55); dec.bar.drawRect(sp.x - bw / 2 - 1, topY - 1, bw + 2, bh + 2); dec.bar.endFill();
        dec.bar.beginFill(0xff4d4d); dec.bar.drawRect(sp.x - bw / 2, topY, bw * frac, bh); dec.bar.endFill();
      }
    }
    for (var id in enemySprites) {
      if (!live[id]) { objLayer.removeChild(enemySprites[id]); enemySprites[id].destroy(); delete enemySprites[id]; }
    }
    for (var id2 in enemyDecor) {
      if (!live[id2]) {
        objLayer.removeChild(enemyDecor[id2].lbl); enemyDecor[id2].lbl.destroy();
        objLayer.removeChild(enemyDecor[id2].bar); enemyDecor[id2].bar.destroy();
        delete enemyDecor[id2];
      }
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
    // 원정 섬 위치 표시(테마별 색 링) — 발견 여부와 무관하게 항해 목표로 보이도록.
    // (섬 도입 이전 세이브를 불러온 경우 저장된 옛 지형엔 실제 육지가 없을 수 있어 — 그때는 표시 안 함)
    var ISL_COLOR = { treasure: '#ffd94d', cannibal: '#ff4b4b', rare: '#c084fc' };
    for (var wi = 0; wi < (world.islands || []).length; wi++) {
      var isl = world.islands[wi];
      if (world.terrain[idx(Math.round(isl.cx), Math.round(isl.cy))] === T_WATER) continue;
      miniCtx.strokeStyle = ISL_COLOR[isl.theme] || '#ffffff';
      miniCtx.lineWidth = 1.4;
      miniCtx.beginPath();
      miniCtx.arc(isl.cx * MINI, isl.cy * MINI, Math.max(3, isl.r * MINI * 0.5), 0, Math.PI * 2);
      miniCtx.stroke();
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

  // ── 방어건물 공격 이펙트 ──
  var atkFxList = []; // { x1, y1, x2, y2, life }
  function spawnAttackFx(tx1, ty1, tx2, ty2) {
    atkFxList.push({
      x1: (tx1 + 0.5) * TILE, y1: (ty1 + 0.5) * TILE,
      x2: (tx2 + 0.5) * TILE, y2: (ty2 + 0.5) * TILE,
      life: 0.25,
    });
  }
  function tickAttackFx(dtSec) {
    fxLayer.clear();
    for (var i = atkFxList.length - 1; i >= 0; i--) {
      var fx = atkFxList[i];
      fx.life -= dtSec;
      if (fx.life <= 0) { atkFxList.splice(i, 1); continue; }
      var a = Math.max(0, fx.life / 0.25);
      fxLayer.lineStyle(3, 0xfff27a, a);
      fxLayer.moveTo(fx.x1, fx.y1);
      fxLayer.lineTo(fx.x2, fx.y2);
      fxLayer.lineStyle(0);
      fxLayer.beginFill(0xff8a4a, a);
      fxLayer.drawCircle(fx.x2, fx.y2, 6 + 8 * a);
      fxLayer.endFill();
    }
  }

  // ── 작업 파티클 (벌목 나뭇조각·채굴 불꽃·낚시 물보라·요리 증기 등) ──
  // render 전용이라 Math.random 사용 무방(시뮬 로직 아님, 헤드리스 하네스 제외).
  var workFxList = []; // { kind, x, y, vx, vy, life, max, size, color }
  function pushP(kind, x, y, vx, vy, life, size, color) {
    workFxList.push({ kind: kind, x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, color: color });
  }
  function spawnWorkFx(kind, x, y, side) {
    var i;
    if (kind === 'chips') { // 나뭇조각 (갈색, 튀어 떨어짐)
      for (i = 0; i < 4; i++) pushP('grav', x, y, side * (30 + Math.random() * 60), -70 - Math.random() * 80, 0.45, 3 + Math.random() * 2, 0x8a5a2b);
    } else if (kind === 'grain') { // 곡식 낟알 (금색)
      for (i = 0; i < 4; i++) pushP('grav', x, y, (Math.random() - 0.5) * 90, -60 - Math.random() * 60, 0.5, 2 + Math.random() * 2, 0xe8c060);
    } else if (kind === 'sparks') { // 돌 파편 (회백)
      for (i = 0; i < 5; i++) pushP('grav', x, y, (Math.random() - 0.5) * 150, -80 - Math.random() * 80, 0.3, 2 + Math.random() * 2, 0xe6e6e6);
    } else if (kind === 'forge') { // 대장간 불똥 (주황)
      for (i = 0; i < 5; i++) pushP('grav', x, y, (Math.random() - 0.5) * 130, -70 - Math.random() * 80, 0.32, 2 + Math.random() * 2, 0xffb24a);
    } else if (kind === 'dust') { // 건설 먼지 (링 확산)
      pushP('ring', x, y, 0, 0, 0.4, 6, 0xcbb089);
    } else if (kind === 'splash') { // 낚시 물보라 (파란 링 + 물방울)
      pushP('ring', x, y, 0, 0, 0.5, 5, 0x6db3ff);
      for (i = 0; i < 3; i++) pushP('grav', x, y, (Math.random() - 0.5) * 90, -70 - Math.random() * 50, 0.4, 2 + Math.random() * 2, 0x9fd0ff);
    } else if (kind === 'steam') { // 요리 증기 (흰 김, 위로 상승·확산)
      pushP('rise', x, y, (Math.random() - 0.5) * 14, -24, 0.7, 5, 0xffffff);
    }
  }
  // 대포 착탄 폭발(광역): 확산 충격파 링 + 파편
  function spawnBoomFx(tileX, tileY) {
    var x = (tileX + 0.5) * TILE, y = (tileY + 0.5) * TILE;
    workFxList.push({ kind: 'ring', x: x, y: y, life: 0.5, max: 0.5, size: 6, color: 0xffb24a, grow: TILE * 2.2, lw: 3 });
    workFxList.push({ kind: 'ring', x: x, y: y, life: 0.4, max: 0.4, size: 3, color: 0xffe08a, grow: TILE * 1.2, lw: 2 });
    for (var i = 0; i < 12; i++) {
      pushP('grav', x, y, (Math.random() - 0.5) * 240, -110 - Math.random() * 130, 0.5, 3 + Math.random() * 2, 0xffcf6a);
    }
  }
  function tickWorkFx(dtSec) { // atkFxList 그린 뒤(fxLayer.clear 후) 이어서 그림 — 별도 clear 없음
    for (var i = workFxList.length - 1; i >= 0; i--) {
      var p = workFxList[i];
      p.life -= dtSec;
      if (p.life <= 0) { workFxList.splice(i, 1); continue; }
      var t = p.life / p.max; // 1→0
      if (p.kind === 'grav') {
        p.vy += 380 * dtSec; p.x += p.vx * dtSec; p.y += p.vy * dtSec;
        fxLayer.beginFill(p.color, Math.min(1, t + 0.2));
        fxLayer.drawRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        fxLayer.endFill();
      } else if (p.kind === 'rise') {
        p.x += p.vx * dtSec; p.y += p.vy * dtSec;
        fxLayer.beginFill(p.color, 0.28 * t);
        fxLayer.drawCircle(p.x, p.y, p.size * (1 + (1 - t) * 1.6));
        fxLayer.endFill();
      } else if (p.kind === 'ring') {
        fxLayer.lineStyle(p.lw || 2, p.color, t);
        fxLayer.drawCircle(p.x, p.y, p.size + (1 - t) * (p.grow || 14));
        fxLayer.lineStyle(0);
      }
    }
  }

  // ── 애니메이션 틱 ──
  function tick(dtSec) {
    animTime += dtSec;
    tickAttackFx(dtSec);
    tickWorkFx(dtSec);
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
    removePawn: removePawn,
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
    spawnAttackFx: spawnAttackFx,
    spawnBoomFx: spawnBoomFx,
  };
}

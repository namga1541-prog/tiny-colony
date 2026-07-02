// v0.3 월드: 바다 위의 섬 + 다중타일 건물(풋프린트) + 금광 + 양
import {
  MAP_W, MAP_H, NATURE, STACK_MAX, BUILDS, GOLDMINE,
  T_WATER, T_GRASS, T_SAND,
} from './config.js';

export { T_WATER, T_GRASS, T_SAND };

export function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rng, size) {
  var g = [];
  for (var i = 0; i < size * size; i++) g.push(rng());
  function at(x, y) {
    var xi = ((x % size) + size) % size, yi = ((y % size) + size) % size;
    return g[yi * size + xi];
  }
  return function (fx, fy) {
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var tx = fx - x0, ty = fy - y0;
    var sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    var a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function idx(x, y) { return y * MAP_W + x; }
export function ix(i) { return i % MAP_W; }
export function iy(i) { return (i / MAP_W) | 0; }
export function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H; }

export function createWorld(seed) {
  var rng = mulberry32(seed);
  var world = {
    seed: seed,
    terrain: new Uint8Array(MAP_W * MAP_H), // 0 물 / 1 잔디 / 2 모래
    objects: {},        // idx -> {kind:'tree'|'mushroom'|'stump', phase}
    buildings: {},      // id -> {id, kind, x, y, stage:'bp'|'built', delivered, work, charges?, natural?}
    occupancy: {},      // idx -> buildingId
    nextBid: 1,
    items: {},          // idx -> {wood,gold,food}
    stockpile: {},
    designations: {},   // idx -> 'chop'|'forage'  |  'mine:'+bid 는 mineDesig 에
    mineDesig: {},      // buildingId -> true
    sheep: [],          // {x,y,px,py,dir,cd,phase}
    reserved: {},
    timeMin: 8 * 60,
    day: 1,
  };

  var coast = makeNoise(rng, 8);
  var forest = makeNoise(rng, 16);
  var cx = MAP_W / 2, cy = MAP_H / 2;

  // 섬: 중심 타원 + 해안 노이즈
  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var nx = (x - cx) / (MAP_W * 0.5), ny = (y - cy) / (MAP_H * 0.49);
      var d = Math.sqrt(nx * nx + ny * ny);
      var edge = 0.9 + (coast(x / 10, y / 10) - 0.5) * 0.38;
      world.terrain[idx(x, y)] = d < edge ? T_GRASS : T_WATER;
    }
  }

  // 모래 해변: 해안에 접한 잔디 일부를 모래로
  var sandNoise = makeNoise(rng, 8);
  for (var y2 = 0; y2 < MAP_H; y2++) {
    for (var x2 = 0; x2 < MAP_W; x2++) {
      var i2 = idx(x2, y2);
      if (world.terrain[i2] !== T_GRASS) continue;
      var nearWater = false;
      for (var dy = -2; dy <= 2 && !nearWater; dy++) {
        for (var dx = -2; dx <= 2 && !nearWater; dx++) {
          if (inMap(x2 + dx, y2 + dy) && world.terrain[idx(x2 + dx, y2 + dy)] === T_WATER) nearWater = true;
        }
      }
      if (nearWater && sandNoise(x2 / 7, y2 / 7) > 0.55) world.terrain[i2] = T_SAND;
    }
  }

  // 자연물 배치
  for (var y3 = 0; y3 < MAP_H; y3++) {
    for (var x3 = 0; x3 < MAP_W; x3++) {
      var i3 = idx(x3, y3);
      if (world.terrain[i3] !== T_GRASS) continue;
      if (Math.hypot(x3 - cx, y3 - cy) < 6) continue; // 시작 캠프
      var f = forest(x3 / 6, y3 / 6);
      if (f > 0.60 && rng() < 0.5) {
        world.objects[i3] = { kind: 'tree', phase: (rng() * 4) | 0 };
      } else if (rng() < 0.010) {
        world.objects[i3] = { kind: 'mushroom' };
      }
    }
  }

  // 금광 2~3개 (탁 트인 잔디에)
  var mines = 2 + ((rng() * 2) | 0);
  var tries = 0;
  while (mines > 0 && tries++ < 300) {
    var mx = 4 + ((rng() * (MAP_W - 8)) | 0);
    var my = 4 + ((rng() * (MAP_H - 8)) | 0);
    if (Math.hypot(mx - cx, my - cy) < 10) continue;
    if (!footprintClear(world, mx, my, GOLDMINE.fw, GOLDMINE.fh, true)) continue;
    addBuilding(world, 'goldmine', mx, my, { natural: true, stage: 'built', charges: GOLDMINE.charges });
    mines--;
  }

  // 양 4~6마리
  var sheepN = 4 + ((rng() * 3) | 0);
  tries = 0;
  while (sheepN > 0 && tries++ < 200) {
    var sx = (rng() * MAP_W) | 0, sy = (rng() * MAP_H) | 0;
    if (!isWalkable(world, sx, sy)) continue;
    world.sheep.push({ x: sx, y: sy, px: sx, py: sy, dir: 1, cd: rng() * 30, phase: (rng() * 8) | 0 });
    sheepN--;
  }

  // 시작 물자 + 모닥불
  addItem(world, idx(cx + 2, cy), 'wood', 20);
  addItem(world, idx(cx + 2, cy + 1), 'food', 8);
  addBuilding(world, 'campfire', cx - 1, cy - 1, { stage: 'built' });

  return world;
}

// ── 건물 유틸 ──
export function buildingDef(kind) {
  if (kind === 'goldmine') return { name: '금광', fw: GOLDMINE.fw, fh: GOLDMINE.fh, solid: true };
  return BUILDS[kind];
}

export function footprintClear(world, x, y, fw, fh, needGrass) {
  for (var dy = 0; dy < fh; dy++) {
    for (var dx = 0; dx < fw; dx++) {
      var tx = x + dx, ty = y + dy;
      if (!inMap(tx, ty)) return false;
      var i = idx(tx, ty);
      if (world.terrain[i] === T_WATER) return false;
      if (needGrass && world.terrain[i] !== T_GRASS) return false;
      if (world.objects[i] || world.occupancy[i] !== undefined || world.stockpile[i]) return false;
    }
  }
  return true;
}

export function addBuilding(world, kind, x, y, opts) {
  var def = buildingDef(kind);
  var b = {
    id: world.nextBid++,
    kind: kind, x: x, y: y,
    stage: (opts && opts.stage) || 'bp',
    delivered: {}, work: 0,
  };
  if (opts && opts.natural) b.natural = true;
  if (opts && opts.charges !== undefined) b.charges = opts.charges;
  world.buildings[b.id] = b;
  for (var dy = 0; dy < def.fh; dy++) {
    for (var dx = 0; dx < def.fw; dx++) {
      world.occupancy[idx(x + dx, y + dy)] = b.id;
    }
  }
  return b;
}

export function removeBuilding(world, b) {
  var def = buildingDef(b.kind);
  for (var dy = 0; dy < def.fh; dy++) {
    for (var dx = 0; dx < def.fw; dx++) {
      var i = idx(b.x + dx, b.y + dy);
      if (world.occupancy[i] === b.id) delete world.occupancy[i];
    }
  }
  delete world.buildings[b.id];
  delete world.mineDesig[b.id];
}

// 건물 정문 타일 (아래 중앙) — 수면·작업 접근 지점
export function buildingFront(world, b) {
  var def = buildingDef(b.kind);
  var fx = b.x + ((def.fw / 2) | 0);
  var fy = b.y + def.fh;
  if (isWalkable(world, fx, fy)) return { x: fx, y: fy };
  for (var dx = 0; dx < def.fw; dx++) {
    if (isWalkable(world, b.x + dx, b.y + def.fh)) return { x: b.x + dx, y: b.y + def.fh };
    if (isWalkable(world, b.x + dx, b.y - 1)) return { x: b.x + dx, y: b.y - 1 };
  }
  for (var dy = 0; dy < def.fh; dy++) {
    if (isWalkable(world, b.x - 1, b.y + dy)) return { x: b.x - 1, y: b.y + dy };
    if (isWalkable(world, b.x + def.fw, b.y + dy)) return { x: b.x + def.fw, y: b.y + dy };
  }
  return null;
}

export function natureDef(objKind) {
  return NATURE[objKind];
}

export function isWalkable(world, x, y) {
  if (!inMap(x, y)) return false;
  var i = idx(x, y);
  if (world.terrain[i] === T_WATER) return false;
  var o = world.objects[i];
  if (o && o.kind === 'tree') return false;
  var bid = world.occupancy[i];
  if (bid !== undefined) {
    var b = world.buildings[bid];
    if (b && b.stage === 'built' && buildingDef(b.kind).solid) return false;
  }
  return true;
}

// ── 아이템 ──
export function addItem(world, i, type, n) {
  var slot = world.items[i];
  if (!slot) { slot = {}; world.items[i] = slot; }
  slot[type] = (slot[type] || 0) + n;
}

export function removeItem(world, i, type, n) {
  var slot = world.items[i];
  if (!slot || !slot[type]) return 0;
  var take = Math.min(slot[type], n);
  slot[type] -= take;
  if (slot[type] <= 0) delete slot[type];
  if (Object.keys(slot).length === 0) delete world.items[i];
  return take;
}

export function stackRoom(world, i, type) {
  var slot = world.items[i];
  if (!slot) return STACK_MAX;
  var used = 0, hasOther = false;
  for (var k in slot) {
    used += slot[k];
    if (k !== type && slot[k] > 0) hasOther = true;
  }
  if (hasOther) return 0;
  return Math.max(0, STACK_MAX - used);
}

export function totalRes(world) {
  var sum = { wood: 0, gold: 0, food: 0 };
  for (var i in world.items) {
    var slot = world.items[i];
    for (var k in slot) sum[k] = (sum[k] || 0) + slot[k];
  }
  return sum;
}

// 매일 아침: 버섯 재생
export function dailyRegrowth(world, rng) {
  var count = 0;
  for (var i in world.objects) if (world.objects[i].kind === 'mushroom') count++;
  var spawned = [];
  var tries = 0;
  while (count < 18 && tries < 400) {
    tries++;
    var x = (rng() * MAP_W) | 0, y = (rng() * MAP_H) | 0;
    var i2 = idx(x, y);
    if (world.terrain[i2] !== T_GRASS) continue;
    if (world.objects[i2] || world.occupancy[i2] !== undefined ||
        world.stockpile[i2] || world.items[i2]) continue;
    world.objects[i2] = { kind: 'mushroom' };
    spawned.push(i2);
    count++;
  }
  return spawned;
}

// 양 배회
export function updateSheep(world, dtMin, rng) {
  for (var n = 0; n < world.sheep.length; n++) {
    var s = world.sheep[n];
    // 이동 중이면 목표로 보간
    var dx = s.x - s.px, dy = s.y - s.py;
    var dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 0.01) {
      var step = dtMin / 2.2; // 양은 느긋하게
      if (step >= dist) { s.px = s.x; s.py = s.y; }
      else {
        s.px += (dx / dist) * step;
        s.py += (dy / dist) * step;
      }
      if (dx !== 0) s.dir = dx > 0 ? 1 : -1;
      continue;
    }
    s.cd -= dtMin;
    if (s.cd <= 0) {
      s.cd = 15 + rng() * 45;
      var nx = s.x + ((rng() * 5) | 0) - 2;
      var ny = s.y + ((rng() * 5) | 0) - 2;
      if (isWalkable(world, nx, ny)) { s.x = nx; s.y = ny; }
    }
  }
}

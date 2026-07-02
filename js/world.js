// 월드 상태 + 절차 생성
import { MAP_W, MAP_H, NATURE, STACK_MAX } from './config.js';

export function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 부드러운 2D 값 노이즈 (군집 배치용)
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

// 지형 코드
export var T_GRASS = 0, T_GRASS_DECOR = 1, T_FLOWER_R = 2, T_DIRT = 3,
           T_DIRT_DECOR = 4, T_WATER = 5, T_FLOWER_W = 6, T_FLOWER_B = 7;

export function createWorld(seed) {
  var rng = mulberry32(seed);
  var world = {
    seed: seed,
    terrain: new Uint8Array(MAP_W * MAP_H), // T_* 코드
    objects: {},       // idx -> {kind:'tree'|'treeO'|'pine'|'rock'|'berry'}
    built: {},         // idx -> {kind:'woodWall'|'stoneWall'|'floor'|'bed'}
    blueprints: {},    // idx -> {kind, delivered:{}, work:0}
    items: {},         // idx -> {wood:n, stone:n, food:n}
    stockpile: {},     // idx -> true
    designations: {},  // idx -> 'chop'|'mine'|'forage'
    reserved: {},      // 예약 키 -> pawnId
    timeMin: 8 * 60,   // 1일차 08:00 시작
    day: 1,
    rngState: 0,
  };

  var forest = makeNoise(rng, 16);
  var cx = MAP_W / 2, cy = MAP_H / 2;

  // 호수 1~2개 (타원, 시작 지점에서 떨어진 곳)
  var lakes = [];
  var lakeCount = 1 + ((rng() * 2) | 0);
  var guard = 0;
  while (lakes.length < lakeCount && guard++ < 60) {
    var lx = 8 + rng() * (MAP_W - 16);
    var ly = 8 + rng() * (MAP_H - 16);
    if (Math.hypot(lx - cx, ly - cy) < 16) continue;
    lakes.push({ x: lx, y: ly, rx: 3.5 + rng() * 3.5, ry: 2.5 + rng() * 3 });
  }

  function isLake(x, y) {
    for (var n = 0; n < lakes.length; n++) {
      var L = lakes[n];
      var dx = (x - L.x) / L.rx, dy = (y - L.y) / L.ry;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }

  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var i = idx(x, y);
      if (isLake(x, y)) {
        world.terrain[i] = T_WATER;
        continue;
      }
      var r = rng();
      world.terrain[i] =
        r < 0.05 ? T_GRASS_DECOR :
        r < 0.075 ? T_FLOWER_R :
        r < 0.09 ? T_FLOWER_W :
        r < 0.105 ? T_FLOWER_B : T_GRASS;

      var distC = Math.hypot(x - cx, y - cy);
      if (distC < 7) continue; // 시작 지점 주변은 비워둠

      var f = forest(x / 6, y / 6);
      if (f > 0.62 && rng() < 0.55) {
        var tr = rng();
        world.objects[i] = { kind: tr < 0.55 ? 'tree' : (tr < 0.85 ? 'pine' : 'treeO') };
      } else if (f < 0.30 && rng() < 0.10) {
        world.objects[i] = { kind: 'rock' };
        world.terrain[i] = rng() < 0.5 ? T_DIRT : T_DIRT_DECOR;
      } else if (rng() < 0.012) {
        world.objects[i] = { kind: 'berry' };
      }
    }
  }

  // 시작 자원: 중앙 근처에 목재·식량 배치
  addItem(world, idx(cx + 2, cy), 'wood', 15);
  addItem(world, idx(cx + 2, cy + 1), 'food', 6);

  return world;
}

export function natureKindOf(objKind) {
  if (objKind === 'tree' || objKind === 'treeO' || objKind === 'pine') return 'tree';
  return objKind; // rock, berry
}

export function natureDef(objKind) {
  return NATURE[natureKindOf(objKind)];
}

export function isWalkable(world, x, y) {
  if (!inMap(x, y)) return false;
  var i = idx(x, y);
  if (world.terrain[i] === T_WATER) return false;
  var o = world.objects[i];
  if (o) return o.kind === 'berry'; // 열매 덤불 위는 지나갈 수 있음
  var b = world.built[i];
  if (b && (b.kind === 'woodWall' || b.kind === 'stoneWall')) return false;
  return true;
}

export function isBuildableAt(world, i) {
  if (world.objects[i] || world.built[i] || world.blueprints[i]) return false;
  return true;
}

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
  if (hasOther) return 0; // 타일당 한 종류만
  return Math.max(0, STACK_MAX - used);
}

export function totalRes(world) {
  var sum = { wood: 0, stone: 0, food: 0 };
  for (var i in world.items) {
    var slot = world.items[i];
    for (var k in slot) sum[k] = (sum[k] || 0) + slot[k];
  }
  return sum;
}

// 매일 자정: 열매 덤불이 드물게 새로 자람
export function dailyRegrowth(world, rng) {
  var count = 0;
  for (var i in world.objects) if (world.objects[i].kind === 'berry') count++;
  var spawned = [];
  var tries = 0;
  while (count < 22 && tries < 400) {
    tries++;
    var x = (rng() * MAP_W) | 0, y = (rng() * MAP_H) | 0;
    var i2 = idx(x, y);
    if (world.objects[i2] || world.built[i2] || world.blueprints[i2] ||
        world.stockpile[i2] || world.items[i2] || world.terrain[i2] >= T_DIRT) continue;
    world.objects[i2] = { kind: 'berry' };
    spawned.push(i2);
    count++;
  }
  return spawned;
}

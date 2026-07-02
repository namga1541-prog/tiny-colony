// v0.3 월드: 바다 위의 섬 + 다중타일 건물(풋프린트) + 금광 + 양
import {
  MAP_W, MAP_H, NATURE, STACK_MAX, BUILDS, GOLDMINE, IRONMINE, BRIDGE,
  RESEARCH_RATE_PER_PAWN, ENEMY, RAID, SEASON_DAYS, SEASONS, STORAGE, RANCH, REGROW,
  ANIMAL_TYPES, WAREHOUSE_TIERS, UPGRADES,
  T_WATER, T_GRASS, T_SAND,
} from './config.js';

// ── 콜로니 업그레이드 효과 조회 (구매한 업그레이드들을 집계) ──
export function hasUpgrade(world, id) { return !!(world.upgrades && world.upgrades[id]); }
export function upgradeMult(world, key) {
  var m = 1, U = world.upgrades || {};
  for (var id in U) {
    if (!U[id]) continue;
    var u = UPGRADES[id];
    if (u && u.effect.key === key && u.effect.mult) m *= u.effect.mult;
  }
  return m;
}
export function upgradeAdd(world, key) {
  var a = 0, U = world.upgrades || {};
  for (var id in U) {
    if (!U[id]) continue;
    var u = UPGRADES[id];
    if (u && u.effect.key === key && u.effect.add) a += u.effect.add;
  }
  return a;
}

function pickAnimalType(rng) {
  // 양이 가장 흔함
  var r = rng();
  if (r < 0.45) return 'sheep';
  if (r < 0.68) return 'pig';
  if (r < 0.85) return 'chicken';
  return 'cow';
}

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
    stock: { wood: 0, gold: 0, food: 0, iron: 0, meal: 0 }, // 콜로니 전체 재고 (바닥에 안 쌓임)
    items: {},          // (구) 타일 아이템 — 현재는 미사용, 재고로 통합됨
    stockpile: {},
    designations: {},   // idx -> 'chop'|'forage'  |  'mine:'+bid 는 mineDesig 에
    mineDesig: {},      // buildingId -> true
    sheep: [],          // {id,x,y,px,py,dir,cd,phase,hunt}
    nextSid: 1,
    reserved: {},
    timeMin: 8 * 60,
    day: 1,
    research: { points: 0, unlocked: {} },
    upgrades: {},       // 구매한 콜로니 업그레이드 id -> true
    farmZone: {},       // idx -> true
    crops: {},          // idx -> {stage:'empty'|'growing'|'ready', timer}
    craftQueue: [],      // [{type:'sword'|'bow'}]
    enemies: [],        // {id,x,y,px,py,hp,cd,dir,phase,anim}
    nextEid: 1,
    nextRaidDay: 0,     // main.js 에서 설정
    goals: {},          // goalId -> true (달성)
    rodTier: 0,         // 낚싯대 등급 (0 맨손 ~ 3 황금)
    fishDesig: {},      // idx -> true (낚시 지정된 물 타일)
  };

  var coast = makeNoise(rng, 8);
  var forest = makeNoise(rng, 16);
  var cx = MAP_W / 2, cy = MAP_H / 2; // 본섬(시작 대륙) 중심

  // 2개 대륙: 본섬(좌하) + 바다 건너 두 번째 대륙(우상). 사이에 바다.
  var m1x = MAP_W * 0.36, m1y = MAP_H * 0.55;
  var s2x = MAP_W * 0.86, s2y = MAP_H * 0.24;
  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var mnx = (x - m1x) / (MAP_W * 0.30), mny = (y - m1y) / (MAP_H * 0.32);
      var dMain = Math.sqrt(mnx * mnx + mny * mny);
      var snx = (x - s2x) / (MAP_W * 0.17), sny = (y - s2y) / (MAP_H * 0.18);
      var dSec = Math.sqrt(snx * snx + sny * sny);
      var edge = 0.84 + (coast(x / 11, y / 11) - 0.5) * 0.28;
      var land = dMain < edge || dSec < edge;
      world.terrain[idx(x, y)] = land ? T_GRASS : T_WATER;
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

  // 금광·철광 (넓은 맵에 맞춰 증가)
  var mines = 3 + ((rng() * 3) | 0);
  var ironMines = 2 + ((rng() * 2) | 0);
  var tries = 0;
  while ((mines > 0 || ironMines > 0) && tries++ < 400) {
    var mx = 4 + ((rng() * (MAP_W - 8)) | 0);
    var my = 4 + ((rng() * (MAP_H - 8)) | 0);
    if (Math.hypot(mx - cx, my - cy) < 10) continue;
    if (!footprintClear(world, mx, my, GOLDMINE.fw, GOLDMINE.fh, true)) continue;
    if (mines > 0) {
      addBuilding(world, 'goldmine', mx, my, { natural: true, stage: 'built', charges: GOLDMINE.charges });
      mines--;
    } else {
      addBuilding(world, 'ironmine', mx, my, { natural: true, stage: 'built', charges: IRONMINE.charges });
      ironMines--;
    }
  }

  // 양 (넓은 맵에 맞춰 증가)
  var sheepN = 7 + ((rng() * 4) | 0);
  tries = 0;
  while (sheepN > 0 && tries++ < 200) {
    var sx = (rng() * MAP_W) | 0, sy = (rng() * MAP_H) | 0;
    if (!isWalkable(world, sx, sy)) continue;
    world.sheep.push({ id: world.nextSid++, type: pickAnimalType(rng), x: sx, y: sy, px: sx, py: sy, dir: 1, cd: rng() * 30, phase: (rng() * 8) | 0 });
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
  if (kind === 'ironmine') return { name: '철광', fw: IRONMINE.fw, fh: IRONMINE.fh, solid: true };
  if (kind === 'bridge') return { name: BRIDGE.name, fw: 1, fh: 1, solid: false, onWater: true };
  return BUILDS[kind];
}

export function isMine(kind) { return kind === 'goldmine' || kind === 'ironmine'; }
export function mineResource(kind) { return kind === 'ironmine' ? 'iron' : 'gold'; }
export function mineWork(kind) { return kind === 'ironmine' ? IRONMINE.work : GOLDMINE.work; }
export function mineDrops(kind) { return kind === 'ironmine' ? IRONMINE.dropsPerCycle : GOLDMINE.dropsPerCycle; }

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
  if (opts && opts.charges !== undefined) { b.charges = opts.charges; b.maxCharges = opts.charges; }
  if (kind === 'warehouse') b.tier = 1;
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

export function sheepById(world, id) {
  for (var n = 0; n < world.sheep.length; n++) if (world.sheep[n].id === id) return world.sheep[n];
  return null;
}

export function isWalkable(world, x, y) {
  if (!inMap(x, y)) return false;
  var i = idx(x, y);
  var bid = world.occupancy[i];
  if (world.terrain[i] === T_WATER) {
    // 완성된 다리가 놓인 물만 통행 가능
    if (bid !== undefined) {
      var wb = world.buildings[bid];
      if (wb && wb.kind === 'bridge' && wb.stage === 'built') return true;
    }
    return false;
  }
  var o = world.objects[i];
  if (o && o.kind === 'tree') return false;
  if (bid !== undefined) {
    var b = world.buildings[bid];
    if (b && b.stage === 'built' && buildingDef(b.kind).solid) return false;
  }
  return true;
}

// 다리 설치 가능한 물 타일인가 (인접에 통행 가능 지점이 있어야 접근 가능)
export function canPlaceBridge(world, x, y) {
  if (!inMap(x, y)) return false;
  var i = idx(x, y);
  if (world.terrain[i] !== T_WATER) return false;
  if (world.occupancy[i] !== undefined) return false;
  return isWalkable(world, x + 1, y) || isWalkable(world, x - 1, y) ||
         isWalkable(world, x, y + 1) || isWalkable(world, x, y - 1);
}

// ── 재고 (글로벌) ── addItem/removeItem 는 타일 인자를 무시하고 전체 재고에 반영
export function addItem(world, i, type, n) {
  world.stock[type] = (world.stock[type] || 0) + n;
}

export function removeItem(world, i, type, n) {
  var have = world.stock[type] || 0;
  var take = Math.min(have, n);
  world.stock[type] = have - take;
  return take;
}

export function stackRoom() { return STACK_MAX; }

export function totalRes(world) {
  var s = world.stock || {};
  return {
    wood: s.wood || 0, gold: s.gold || 0, food: s.food || 0,
    iron: s.iron || 0, meal: s.meal || 0,
    sword: s.sword || 0, bow: s.bow || 0, ironSword: s.ironSword || 0, ironBow: s.ironBow || 0,
  };
}

// ── 창고 업그레이드: 옛 저장본 호환용 기본 단계 ──
export function warehouseTier(b) { return b.tier || 1; }

// 창고 1개가 기여하는 저장 용량 (단계별)
export function warehouseCap(b) {
  var t = warehouseTier(b);
  var def = WAREHOUSE_TIERS[t - 1];
  return def ? def.cap : STORAGE.perWarehouse;
}

// ── 저장고 용량 (창고 수 + 단계에 비례) ──
export function storageCap(world) {
  var n = 0;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind === 'warehouse' && b.stage === 'built') n += warehouseCap(b);
  }
  return STORAGE.base + n + upgradeAdd(world, 'storage');
}
export function totalStored(world) {
  var s = world.stock || {};
  return (s.wood || 0) + (s.gold || 0) + (s.food || 0) + (s.iron || 0) + (s.meal || 0);
}
export function storageFull(world) { return totalStored(world) >= storageCap(world); }

// ── 목장: 지어진 목장마다 주기적으로 식량 산출 + 양 번식 ──
export function tickRanches(world, dtMin, rng) {
  var events = [];
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind !== 'ranch' || b.stage !== 'built') continue;
    b.ranchT = (b.ranchT || 0) + dtMin;
    if (b.ranchT >= RANCH.interval) {
      b.ranchT = 0;
      if (!storageFull(world)) {
        var fr = buildingFront(world, b) || { x: b.x, y: b.y + 2 };
        addItem(world, idx(fr.x, fr.y), 'food', RANCH.food);
        events.push({ type: 'food', idx: idx(fr.x, fr.y) });
      }
      // 양 번식
      if (world.sheep.length < RANCH.maxSheep && rng() < RANCH.breedChance) {
        var sx = b.x + ((rng() * 4) | 0) - 1, sy = b.y + 2 + ((rng() * 2) | 0);
        if (isWalkable(world, sx, sy)) {
          world.sheep.push({ id: world.nextSid++, type: pickAnimalType(rng), x: sx, y: sy, px: sx, py: sy, dir: 1, cd: rng() * 30, phase: (rng() * 8) | 0 });
          events.push({ type: 'sheep' });
        }
      }
    }
  }
  return events;
}

// ── 계절 ──
export function seasonIndex(world) {
  return Math.floor((world.day - 1) / SEASON_DAYS) % SEASONS.length;
}
export function seasonDef(world) { return SEASONS[seasonIndex(world)]; }

// 매일 아침: 버섯·나무 재생 (맵 고갈 방지)
export function dailyRegrowth(world, rng) {
  var spawned = [];
  var i, x, y, i2;

  // 빈 잔디 타일에 놓을 수 있는지
  function freeGrass(ii) {
    return world.terrain[ii] === T_GRASS && !world.objects[ii] &&
      world.occupancy[ii] === undefined && !world.stockpile[ii] && !world.items[ii] && !world.farmZone[ii];
  }

  // 버섯 (식량원) 목표치까지 보충
  var mush = 0, trees = 0;
  for (i in world.objects) {
    if (world.objects[i].kind === 'mushroom') mush++;
    else if (world.objects[i].kind === 'tree') trees++;
  }
  var tries = 0;
  while (mush < 18 && tries < 400) {
    tries++;
    x = (rng() * MAP_W) | 0; y = (rng() * MAP_H) | 0; i2 = idx(x, y);
    if (!freeGrass(i2)) continue;
    world.objects[i2] = { kind: 'mushroom' }; spawned.push(i2); mush++;
  }

  // 그루터기 → 나무로 다시 성장
  for (i in world.objects) {
    if (world.objects[i].kind !== 'stump') continue;
    if (trees >= REGROW.treeCap) break;
    if (rng() < REGROW.stumpToTreeChance) {
      world.objects[i] = { kind: 'tree', phase: (rng() * 4) | 0 };
      spawned.push(+i); trees++;
    }
  }

  // 빈 잔디에 새 묘목이 돋음 (숲이 서서히 확장·복구)
  var planted = 0; tries = 0;
  while (planted < REGROW.newSaplingsPerDay && trees < REGROW.treeCap && tries < 300) {
    tries++;
    x = (rng() * MAP_W) | 0; y = (rng() * MAP_H) | 0; i2 = idx(x, y);
    if (!freeGrass(i2)) continue;
    // 기존 나무 근처에 우선적으로 (숲답게)
    var nearTree = false, dx, dy;
    for (dy = -1; dy <= 1 && !nearTree; dy++) for (dx = -1; dx <= 1; dx++) {
      var ni = idx(x + dx, y + dy);
      if (inMap(x + dx, y + dy) && world.objects[ni] && world.objects[ni].kind === 'tree') { nearTree = true; break; }
    }
    if (!nearTree && rng() < 0.7) continue; // 대부분 숲 근처에만
    world.objects[i2] = { kind: 'tree', phase: (rng() * 4) | 0 };
    spawned.push(i2); trees++; planted++;
  }

  return spawned;
}

// 매일 아침: 광산 매장량 회복 (재생 자원화). 변경된 광산 id 배열 반환
export function dailyMineRegen(world) {
  var changed = [];
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (!isMine(b.kind)) continue;
    var max = b.maxCharges || (b.kind === 'ironmine' ? IRONMINE.charges : GOLDMINE.charges);
    var regen = b.kind === 'ironmine' ? IRONMINE.regenPerDay : GOLDMINE.regenPerDay;
    if ((b.charges || 0) >= max) continue;
    b.charges = Math.min(max, (b.charges || 0) + regen);
    if (b.charges > 0 && b.depleted) { b.depleted = false; changed.push(+id); }
  }
  return changed;
}

// 여러 타일에 흩어진 자원을 목표 수량만큼 전역에서 차감 (사전에 totalRes로 충분한지 확인 후 호출)
export function consumeGlobal(world, type, n) {
  return removeItem(world, 0, type, n);
}

export function canAfford(world, cost) {
  var sum = totalRes(world);
  for (var t in cost) if ((sum[t] || 0) < cost[t]) return false;
  return true;
}

// 연구 포인트 자동 누적 (정착민 수 비례)
export function tickResearch(world, aliveCount, dtMin) {
  world.research.points += RESEARCH_RATE_PER_PAWN * aliveCount * dtMin;
}

export function researchProgress(world, key, def) {
  return Math.min(1, world.research.points / def.cost);
}

// 작물 성장 (매 틱) — 성숙하면 stage 'ready' 전환만, 수확은 pawn job. 겨울엔 성장 정지.
export function tickCrops(world, dtMin) {
  if (seasonDef(world).noFarm) return [];
  var readyNow = [];
  for (var i in world.crops) {
    var c = world.crops[i];
    if (c.stage !== 'growing') continue;
    c.timer -= dtMin;
    if (c.timer <= 0) {
      c.stage = 'ready';
      readyNow.push(+i);
    }
  }
  return readyNow;
}

// ── 습격: 해안 물 근처(육지 가장자리)에서 고블린 스폰 ──
export function spawnRaid(world, count, rng) {
  var edges = [];
  for (var y = 1; y < MAP_H - 1; y++) {
    for (var x = 1; x < MAP_W - 1; x++) {
      if (world.terrain[idx(x, y)] === T_WATER) continue;
      // 육지지만 물과 접한 가장자리
      if (world.terrain[idx(x + 1, y)] === T_WATER || world.terrain[idx(x - 1, y)] === T_WATER ||
          world.terrain[idx(x, y + 1)] === T_WATER || world.terrain[idx(x, y - 1)] === T_WATER) {
        if (isWalkable(world, x, y)) edges.push({ x: x, y: y });
      }
    }
  }
  if (edges.length === 0) return 0;
  var spawned = 0;
  // 일수에 따라 고블린 체력 강화
  var ehp = ENEMY.hp + Math.floor((world.day || 1) * (RAID.hpPerDay || 0));
  // 한 지점 근처에 무리로 상륙
  var base = edges[(rng() * edges.length) | 0];
  for (var n = 0; n < count; n++) {
    var sx = base.x + ((rng() * 5) | 0) - 2;
    var sy = base.y + ((rng() * 5) | 0) - 2;
    if (!isWalkable(world, sx, sy)) { sx = base.x; sy = base.y; }
    world.enemies.push({
      id: world.nextEid++, x: sx, y: sy, px: sx, py: sy,
      hp: ehp, maxHp: ehp, cd: 0, dir: 1, anim: (rng() * 6) | 0,
    });
    spawned++;
  }
  return spawned;
}

// 가장 가까운 살아있는 적 (사거리 내). {enemy, dist} 또는 null
export function nearestEnemy(world, x, y, maxDist) {
  var best = null, bestD = Infinity;
  for (var n = 0; n < world.enemies.length; n++) {
    var e = world.enemies[n];
    var d = Math.abs(e.px - x) + Math.abs(e.py - y);
    if (d <= maxDist && d < bestD) { bestD = d; best = e; }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

// 적 이동·공격 (정착민 공격은 pawns.js 에서). cb: {onHit(pawn,dmg), onPawnDeath(pawn), onEnemyGone}
export function updateEnemies(world, pawns, dtMin, cb) {
  var alive = [];
  for (var n = 0; n < world.enemies.length; n++) {
    var e = world.enemies[n];
    if (e.hp <= 0) {
      // 처치 → 금 드랍
      addItem(world, idx(e.x, e.y), 'gold', ENEMY.dropGold);
      if (cb.onEnemyDown) cb.onEnemyDown(e);
      continue;
    }
    // 목표: 가장 가까운 살아있는 정착민
    var tgt = null, tgtD = Infinity;
    for (var p = 0; p < pawns.length; p++) {
      if (pawns[p].state === 'dead') continue;
      var d = Math.abs(pawns[p].px - e.px) + Math.abs(pawns[p].py - e.py);
      if (d < tgtD) { tgtD = d; tgt = pawns[p]; }
    }
    if (tgt) {
      if (tgtD <= 1.05) {
        // 인접 → 공격
        e.cd -= dtMin;
        e.moving = false;
        if (e.cd <= 0) {
          e.cd = ENEMY.attackCd;
          tgt.hp = Math.max(0, tgt.hp - ENEMY.power);
          if (cb.onHit) cb.onHit(tgt, ENEMY.power);
          if (tgt.hp <= 0 && tgt.state !== 'dead') {
            tgt.state = 'dead';
            tgt.job = null;
            if (cb.onPawnDeath) cb.onPawnDeath(tgt);
          }
        }
      } else {
        // 접근 (그리디 1스텝, 물/벽 회피)
        e.moving = true;
        var step = dtMin / ENEMY.moveMinPerTile;
        var vx = Math.sign(tgt.px - e.px), vy = Math.sign(tgt.py - e.py);
        if (vx !== 0) e.dir = vx;
        // 우선 큰 축 이동
        var movedAxis = false;
        if (Math.abs(tgt.px - e.px) >= Math.abs(tgt.py - e.py)) {
          if (vx !== 0 && isWalkable(world, Math.round(e.px + vx), Math.round(e.py))) { e.px += vx * step; movedAxis = true; }
          else if (vy !== 0 && isWalkable(world, Math.round(e.px), Math.round(e.py + vy))) { e.py += vy * step; movedAxis = true; }
        } else {
          if (vy !== 0 && isWalkable(world, Math.round(e.px), Math.round(e.py + vy))) { e.py += vy * step; movedAxis = true; }
          else if (vx !== 0 && isWalkable(world, Math.round(e.px + vx), Math.round(e.py))) { e.px += vx * step; movedAxis = true; }
        }
        if (movedAxis) { e.x = Math.round(e.px); e.y = Math.round(e.py); }
      }
    }
    alive.push(e);
  }
  world.enemies = alive;
}

// 방어 건물(망루·초소·성) 자동 공격: 사거리 내 최근접 적 타격
export function tickTowers(world, dtMin, cb) {
  if (world.enemies.length === 0) return;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'built') continue;
    var def = BUILDS[b.kind];
    if (!def || !def.attack) continue;
    b.atkCd = (b.atkCd || 0) - dtMin;
    if (b.atkCd > 0) continue;
    var cx = b.x + def.fw / 2, cy = b.y + def.fh / 2;
    var near = nearestEnemy(world, cx, cy, def.attack.range + upgradeAdd(world, 'towerrange'));
    if (!near) continue;
    b.atkCd = def.attack.cd;
    near.enemy.hp -= def.attack.power * upgradeMult(world, 'towerpower');
    if (cb && cb.onTowerFire) cb.onTowerFire(b, near.enemy);
  }
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

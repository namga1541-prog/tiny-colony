// v0.3 월드: 바다 위의 섬 + 다중타일 건물(풋프린트) + 금광 + 양
import {
  MAP_W, MAP_H, NATURE, STACK_MAX, BUILDS, BUILDING_HP_DEFAULT, GOLDMINE, IRONMINE, BRIDGE,
  RESEARCH_RATE_PER_PAWN, ENEMY, RAID, GIANT, GIANT_FAST_MULT, GIANT_JUMP, SEASON_DAYS, SEASONS, WINTER, STORAGE, RANCH, REGROW,
  ANIMAL_TYPES, ANIMALS, WILD_ANIMAL_TYPES, BARN, EGG_HATCH, WAREHOUSE_TIERS, UPGRADES, RANKS, HOUSE_POP_BONUS, HOUSE_POP_CAP_COUNT, DEFENSE_TIERS, OUTPOST_BRANCHES, CANNON, RELICS, ISLANDS, CANNIBAL, WARLORD, RAIDER, INVWARRIOR, ZOMBIE, SKELETON, DEMON, MINIDEMON,
  ARMOR, FISH_PLATFORM, LODGE_FARM_RADIUS, RARE_FISH_SPOT, FORTIFY_KINDS, INJURY, LIBRARY,
  T_WATER, T_GRASS, T_SAND,
} from './config.js';
import { findPath } from './path.js';

// ── 콜로니 업그레이드 효과 조회 (구매한 업그레이드들을 집계) ──
export function hasUpgrade(world, id) { return !!(world.upgrades && world.upgrades[id]); }
export function upgradeMult(world, key) {
  var m = 1, U = world.upgrades || {};
  for (var id in U) {
    if (!U[id]) continue;
    var u = UPGRADES[id];
    if (u && u.effect.key === key && u.effect.mult) m *= u.effect.mult;
  }
  var R = world.relics || {}; // 유물도 같은 배율 풀에 합산(스택=거듭제곱) → 업그레이드와 시너지
  for (var rid in R) {
    var rl = RELICS[rid];
    if (R[rid] > 0 && rl && rl.effect.key === key && rl.effect.mult) m *= Math.pow(rl.effect.mult, R[rid]);
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
  var R = world.relics || {};
  for (var rid in R) {
    var rl = RELICS[rid];
    if (R[rid] > 0 && rl && rl.effect.key === key && rl.effect.add) a += rl.effect.add * R[rid];
  }
  return a;
}
// 유물 획득 (rng 로 무작위 1개, 중복 시 스택). 반환: {id, def, count}
export function grantRelic(world, rng) {
  var ids = Object.keys(RELICS);
  var id = ids[(rng() * ids.length) | 0];
  world.relics = world.relics || {};
  world.relics[id] = (world.relics[id] || 0) + 1;
  return { id: id, def: RELICS[id], count: world.relics[id] };
}
// 대침공(INVASION) 승리 전용 전설급 유물 확정 지급. rarity==='legendary' 후보 중 rng 로 선택.
// goddessOnly(여신 강림 전용) 유물은 제외 — 대침공 보상으로 여신 축복이 나오는 건 어색하므로.
export function grantLegendaryRelic(world, rng) {
  var ids = Object.keys(RELICS).filter(function (id) { return RELICS[id].rarity === 'legendary' && !RELICS[id].goddessOnly; });
  if (ids.length === 0) return grantRelic(world, rng); // 안전망(전설급 미정의 시)
  var id = ids[(rng() * ids.length) | 0];
  world.relics = world.relics || {};
  world.relics[id] = (world.relics[id] || 0) + 1;
  return { id: id, def: RELICS[id], count: world.relics[id] };
}
// 대침공 웨이브 waveNo 소속 정복자 중 생존자 수 (조기종료 판정용)
export function warlordsAliveInWave(world, waveNo) {
  var n = 0;
  for (var i = 0; i < world.enemies.length; i++) {
    var e = world.enemies[i];
    if (e.wave === waveNo && e.kind === 'warlord' && e.hp > 0) n++;
  }
  return n;
}

// 탈출선(엔드게임 메가프로젝트) 3부품(선체·엔진·반응로)이 모두 완공됐는지
export function shipComplete(world) {
  var need = { shipHull: false, shipEngine: false, shipReactor: false };
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage === 'built' && need.hasOwnProperty(b.kind)) need[b.kind] = true;
  }
  return need.shipHull && need.shipEngine && need.shipReactor;
}

function pickAnimalType(rng) {
  // 양이 가장 흔함
  var r = rng();
  if (r < 0.45) return 'sheep';
  if (r < 0.68) return 'pig';
  if (r < 0.85) return 'chicken';
  return 'cow';
}

// 본섬에 배회하는 야생동물 종류 선택 — ANIMALS[x].weight 가중치(낚시 catchFish 와 동일한 누적 확률 방식)
function pickWildAnimalType(rng) {
  var total = 0, i, w = [];
  for (i = 0; i < WILD_ANIMAL_TYPES.length; i++) {
    var ww = ANIMALS[WILD_ANIMAL_TYPES[i]].weight;
    w.push(ww); total += ww;
  }
  var r = rng() * total;
  for (i = 0; i < WILD_ANIMAL_TYPES.length; i++) { r -= w[i]; if (r <= 0) return WILD_ANIMAL_TYPES[i]; }
  return WILD_ANIMAL_TYPES[0];
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
    stock: { wood: 0, gold: 0, food: 0, iron: 0, meal: 0, leather: 0, meat: 0, delicacy: 0, mealGood: 0, mealFeast: 0 }, // 콜로니 전체 재고 (바닥에 안 쌓임)
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
    orchardZone: {},    // idx -> true (과일나무 심는 구역 — farmZone 과 별개, 수확해도 나무는 유지되고 재성장)
    crops: {},          // idx -> {stage:'empty'|'growing'|'ready', timer, kind:'wheat'|'fruit'(생략 시 wheat)}
    craftQueue: [],      // [{type:'sword'|'bow'}]
    feastCooldown: 0,    // 여관 축제 재사용 대기(게임분) — main.js onHostFeast, sim.js 에서 매틱 감소
    feastCount: 0,       // 누적 축제 개최 횟수 — goals.js 'tavern' 판정
    enemies: [],        // {id,x,y,px,py,hp,cd,dir,phase,anim}
    nextEid: 1,
    nextRaidDay: 0,     // main.js 에서 설정
    goals: {},          // goalId -> true (달성)
    rodTier: 0,         // 낚싯대 등급 (0 맨손 ~ 3 황금)
    fishDesig: {},      // idx -> true (낚시 지정된 물 타일)
    rank: 0,            // 발전 단계 (0 무리 ~ 4 나라) — RANKS 인덱스
    invasion: null,     // 대침공(INVASION) 상태: null(미시작) | {phase, schedIndex, wave, triggerDay?, gapUntilMin?}
    invasionsCompleted: 0, // 완료한 예정 침공 수(INVASION.schedule 인덱스 진행도)
    relics: {},         // 유물 id -> 보유 개수 (스택). 습격 격퇴·괴민 처치로 획득
    goddessVisited: false, // 섬의 수호신 「아보랑카도」 강림(1회성) 여부
    traderActive: false, // 떠돌이 상인 방문 중 여부
    traderDepartDay: 0,  // 상인이 떠나는 날짜(traderActive 일 때만 의미 있음)
    nextTraderDay: 0,    // 다음 상인 방문 예정일(0 이면 TRADER.firstDay 로 폴백)
    escaped: false,      // 탈출선(선체·엔진·반응로) 완성 후 탈출 성공(1회성) 여부
    autoEquip: false,    // 자동 무장 토글(관리): 유휴 정착민이 창고 무기를 미리 장착
    bossDefeated: false, // 최종 보스 「악마후배」 처치 여부
    ateGloriousFood: false, // 찬란한 음식 섭취 여부 (도전과제용, 1회성)
    caughtSpotOnlyFish: false, // 초특급 희귀어종 포획 여부 (도전과제용, 1회성)
    dug: {},            // idx -> true. 삽으로 파낸 땅 (자원 재생 없음 · 건설 공간)
    islands: [],        // {id,name,icon,theme,cx,cy,r,discovered,cap} — 원정 섬 메타(발견·리스폰용)
    rareFishTile: {},   // idx -> true. 초특급 희귀어종(밍크고래 등)만 낚이는 희귀 낚시 스팟(맵에 몇 곳뿐)
    boats: [],          // { id, x, y, px, py, pilot } — 물 위 이동수단. pilot=탑승한 정착민 id(없으면 null)
    nextBoatId: 1,
  };

  var coast = makeNoise(rng, 8);
  var forest = makeNoise(rng, 16);
  var cx = MAP_W / 2, cy = MAP_H / 2; // 본섬(시작 대륙) 중심

  // 2개 대륙: 본섬(좌하) + 바다 건너 두 번째 대륙(우상). 사이에 바다.
  var m1x = MAP_W * 0.36, m1y = MAP_H * 0.55;
  var s2x = MAP_W * 0.86, s2y = MAP_H * 0.24;
  // 원정 섬(보물·식인종·희귀) — 본토·2번대륙과 멀리 떨어진 좌표에 작은 원형 섬으로 새겨넣음
  var islandDefs = ISLANDS.map(function (isl) {
    return { def: isl, cx: MAP_W * isl.cxf, cy: MAP_H * isl.cyf, r: MAP_W * isl.rf };
  });
  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var mnx = (x - m1x) / (MAP_W * 0.30), mny = (y - m1y) / (MAP_H * 0.32);
      var dMain = Math.sqrt(mnx * mnx + mny * mny);
      var snx = (x - s2x) / (MAP_W * 0.17), sny = (y - s2y) / (MAP_H * 0.18);
      var dSec = Math.sqrt(snx * snx + sny * sny);
      var edge = 0.84 + (coast(x / 11, y / 11) - 0.5) * 0.28;
      var land = dMain < edge || dSec < edge;
      if (!land) {
        for (var isi = 0; isi < islandDefs.length; isi++) {
          var isd = islandDefs[isi];
          var inx = (x - isd.cx) / isd.r, iny = (y - isd.cy) / isd.r;
          if (Math.sqrt(inx * inx + iny * iny) < edge) { land = true; break; }
        }
      }
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

  // 금광·철광 (넓은 맵에 맞춰 증가) — 철광은 강철·탈출선 수요가 커 더 넉넉히 배치
  var mines = 3 + ((rng() * 3) | 0);
  var ironMines = 5 + ((rng() * 3) | 0);
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

  // 야생동물(말·사슴·늑대·곰·사자·호랑이) — 사냥하거나 축사에서 길들일 수 있음 (시작 섬 체감을 위해 증량)
  var wildN = 11 + ((rng() * 6) | 0);
  tries = 0;
  while (wildN > 0 && tries++ < 200) {
    var wx = (rng() * MAP_W) | 0, wy = (rng() * MAP_H) | 0;
    if (!isWalkable(world, wx, wy)) continue;
    world.sheep.push({ id: world.nextSid++, type: pickWildAnimalType(rng), x: wx, y: wy, px: wx, py: wy, dir: 1, cd: rng() * 30, phase: (rng() * 8) | 0 });
    wildN--;
  }

  // 시작 물자 + 모닥불
  addItem(world, idx(cx + 2, cy), 'wood', 20);
  addItem(world, idx(cx + 2, cy + 1), 'food', 8);
  addBuilding(world, 'campfire', cx - 1, cy - 1, { stage: 'built' });

  // ── 원정 섬 콘텐츠 배치 (보물상자·식인종·희귀 동식물) ──
  world.islands = islandDefs.map(function (isd) {
    return { id: isd.def.id, name: isd.def.name, icon: isd.def.icon, theme: isd.def.theme,
      cx: isd.cx, cy: isd.cy, r: isd.r, discovered: false, cap: 0 };
  });
  function islandSpot(isl, needFreeObj) {
    for (var t = 0; t < 60; t++) {
      var ang = rng() * Math.PI * 2, rad = rng() * isl.r * 0.75;
      var sx2 = Math.round(isl.cx + Math.cos(ang) * rad), sy2 = Math.round(isl.cy + Math.sin(ang) * rad);
      if (!inMap(sx2, sy2) || !isWalkable(world, sx2, sy2)) continue;
      if (needFreeObj && world.objects[idx(sx2, sy2)]) continue;
      return { x: sx2, y: sy2 };
    }
    return null;
  }
  for (var wi = 0; wi < world.islands.length; wi++) {
    var isl = world.islands[wi];
    if (isl.theme === 'treasure') {
      var chestN = 3 + ((rng() * 3) | 0);
      for (var c1 = 0; c1 < chestN; c1++) {
        var sp1 = islandSpot(isl, true);
        if (sp1) world.objects[idx(sp1.x, sp1.y)] = { kind: 'chest' };
      }
      // 보물을 지키는 스켈레톤 수호자 무리 — 식인종 섬보다 넉넉하게(섬도 더 커짐)
      var skelN = 6 + ((rng() * 5) | 0);
      isl.cap = skelN;
      for (var c1b = 0; c1b < skelN; c1b++) {
        var sp1b = islandSpot(isl, false);
        if (sp1b) {
          world.enemies.push({
            id: world.nextEid++, x: sp1b.x, y: sp1b.y, px: sp1b.x, py: sp1b.y,
            hp: SKELETON.hp, maxHp: SKELETON.hp, cd: 0, dir: 1, anim: (rng() * 6) | 0, kind: 'skeleton',
          });
        }
      }
    } else if (isl.theme === 'cannibal') {
      var cannN = 4 + ((rng() * 3) | 0);
      isl.cap = cannN;
      for (var c2 = 0; c2 < cannN; c2++) {
        var sp2 = islandSpot(isl, false);
        if (sp2) {
          world.enemies.push({
            id: world.nextEid++, x: sp2.x, y: sp2.y, px: sp2.x, py: sp2.y,
            hp: CANNIBAL.hp, maxHp: CANNIBAL.hp, cd: 0, dir: 1, anim: (rng() * 6) | 0, kind: 'cannibal',
          });
        }
      }
    } else if (isl.theme === 'rare') {
      var plantN = 6 + ((rng() * 5) | 0);
      for (var c3 = 0; c3 < plantN; c3++) {
        var sp3 = islandSpot(isl, true);
        if (sp3) world.objects[idx(sp3.x, sp3.y)] = { kind: 'rareplant' };
      }
      var deerN = 3 + ((rng() * 3) | 0);
      isl.cap = deerN;
      for (var c4 = 0; c4 < deerN; c4++) {
        var sp4 = islandSpot(isl, false);
        if (sp4) {
          world.sheep.push({
            id: world.nextSid++, type: 'raredeer', rare: true, x: sp4.x, y: sp4.y, px: sp4.x, py: sp4.y,
            dir: 1, cd: rng() * 30, phase: (rng() * 8) | 0,
          });
        }
      }
    } else if (isl.theme === 'boss') {
      // 최종 보스 「악마후배」 1체를 섬 중앙에 배치 (1회성 — 처치 시 리스폰 없음)
      var bx = Math.round(isl.cx), by = Math.round(isl.cy);
      if (!isWalkable(world, bx, by)) { var bsp = islandSpot(isl, false); if (bsp) { bx = bsp.x; by = bsp.y; } }
      world.enemies.push({
        id: world.nextEid++, x: bx, y: by, px: bx, py: by,
        hp: DEMON.hp, maxHp: DEMON.hp, cd: 0, dir: -1, anim: 0, kind: 'demon', boss: true,
      });
      isl.boss = true;
    }
  }

  // 초특급 희귀 낚시 스팟(밍크고래 등) — 스폰 지점에서 멀리 떨어진 해안 물 타일 중 몇 곳을 무작위로 표시
  var rareFishN = RARE_FISH_SPOT.countMin + ((rng() * (RARE_FISH_SPOT.countMax - RARE_FISH_SPOT.countMin + 1)) | 0);
  for (var rf = 0; rf < rareFishN; rf++) {
    for (var rft = 0; rft < 80; rft++) {
      var fx = (rng() * MAP_W) | 0, fy = (rng() * MAP_H) | 0;
      if (world.terrain[idx(fx, fy)] !== T_WATER) continue;
      if (Math.hypot(fx - cx, fy - cy) < RARE_FISH_SPOT.minDistFromCenter) continue;
      if (fishSpotTier(world, fx, fy) < 0) continue; // 해안(육지 인접)이어야 실제로 낚시 지정 가능
      world.rareFishTile[idx(fx, fy)] = true;
      break;
    }
  }

  return world;
}

// ── 건물 유틸 ──
export function buildingDef(kind) {
  if (kind === 'goldmine') return { name: '금광', fw: GOLDMINE.fw, fh: GOLDMINE.fh, solid: true };
  if (kind === 'ironmine') return { name: '철광', fw: IRONMINE.fw, fh: IRONMINE.fh, solid: true };
  if (kind === 'bridge') return { name: BRIDGE.name, fw: 1, fh: 1, solid: false, onWater: true };
  if (kind === 'fishPlatform') return { name: FISH_PLATFORM.name, fw: 1, fh: 1, solid: false, onWater: true };
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
  // 내구도: 자연물(광산 등)·다리 제외한 일반 건물만 적에게 파괴될 수 있음
  if (!b.natural && kind !== 'bridge' && kind !== 'fishPlatform') {
    b.maxHp = def.hp || BUILDING_HP_DEFAULT;
    if (FORTIFY_KINDS.indexOf(kind) >= 0 && world.research && world.research.unlocked && world.research.unlocked.fortification) {
      b.maxHp = Math.round(b.maxHp * 1.4);
    }
    b.hp = b.maxHp;
  }
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

// forEnemy: 적 길찾기 전용 판정이면 true — solid 는 기존과 동일하게 막되, enemyBlocked(성문 등 정착민만
// 통과하는 건물)도 추가로 막는다. 정착민·기타 판정(기본값)은 이 인자를 생략해 기존과 동일하게 동작.
export function isWalkable(world, x, y, forEnemy) {
  if (!inMap(x, y)) return false;
  var i = idx(x, y);
  var bid = world.occupancy[i];
  if (world.terrain[i] === T_WATER) {
    // 완성된 다리가 놓인 물만 통행 가능
    if (bid !== undefined) {
      var wb = world.buildings[bid];
      if (wb && (wb.kind === 'bridge' || wb.kind === 'fishPlatform') && wb.stage === 'built') return true;
    }
    return false;
  }
  var o = world.objects[i];
  if (o && o.kind === 'tree') return false;
  if (bid !== undefined) {
    var b = world.buildings[bid];
    if (b && b.stage === 'built') {
      var bd = buildingDef(b.kind);
      if (bd.solid) return false;
      if (forEnemy && bd.enemyBlocked) return false;
    }
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

// ── 배(이동수단) ──
// 배가 들어갈 수 있는 타일: 맵 안 물 타일(다리·좌대 등 비-solid 위도 통과). 육지·솔리드 건물은 불가.
export function boatCanEnter(world, x, y) {
  if (!inMap(x, y)) return false;
  return world.terrain[idx(x, y)] === T_WATER;
}
// 해안 물 타일(canPlaceBridge)에 배를 건조해 정박 상태로 생성.
export function spawnBoat(world, x, y) {
  var boat = { id: world.nextBoatId++, x: x, y: y, px: x, py: y, pilot: null };
  world.boats.push(boat);
  return boat;
}
// (px,py) 근처(1.6칸 내)의 정박된(무인) 배 반환 — 클릭 승선용.
export function boatAt(world, px, py) {
  var best = null, bestD = 1.6;
  for (var n = 0; n < world.boats.length; n++) {
    var b = world.boats[n];
    if (b.pilot != null) continue;
    var d = Math.hypot(b.px - px, b.py - py);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
// 정착민이 인접한(1.6칸) 무인 배에 승선. 성공 시 true — 정착민이 배 타일로 올라타고 조종 상태가 된다.
export function boardBoat(world, pawn, boat) {
  if (!boat || boat.pilot != null || pawn.boating) return false;
  if (Math.hypot(boat.px - pawn.px, boat.py - pawn.py) > 1.6) return false;
  pawn.boating = boat.id;
  boat.pilot = pawn.id;
  pawn.px = boat.px; pawn.py = boat.py; pawn.x = boat.x; pawn.y = boat.y;
  return true;
}
// 탑승 중 정착민이 하선 — 인접한 통행 가능 육지 타일로 내리고 배는 그 자리에 정박. 성공 시 true.
export function disembarkBoat(world, pawn) {
  if (!pawn.boating) return false;
  var bx = Math.round(pawn.px), by = Math.round(pawn.py);
  var nbrs = [[bx + 1, by], [bx - 1, by], [bx, by + 1], [bx, by - 1], [bx + 1, by + 1], [bx - 1, by - 1], [bx + 1, by - 1], [bx - 1, by + 1]];
  var land = null;
  for (var n = 0; n < nbrs.length; n++) {
    if (isWalkable(world, nbrs[n][0], nbrs[n][1])) { land = nbrs[n]; break; }
  }
  if (!land) return false; // 인접에 내릴 육지가 없음
  var boat = null;
  for (var m = 0; m < world.boats.length; m++) if (world.boats[m].id === pawn.boating) boat = world.boats[m];
  if (boat) { boat.pilot = null; boat.x = bx; boat.y = by; boat.px = bx; boat.py = by; } // 배는 하선 지점 물 위에 정박
  pawn.boating = null;
  pawn.px = land[0]; pawn.py = land[1]; pawn.x = land[0]; pawn.y = land[1];
  return true;
}
// 매 틱 정합성: 탑승 중 배는 조종사 위치를 따라가고, 조종사가 죽거나 사라지면 그 자리에 정박(무인).
export function syncBoats(world, pawns) {
  var byId = {};
  for (var p = 0; p < pawns.length; p++) byId[pawns[p].id] = pawns[p];
  for (var n = 0; n < world.boats.length; n++) {
    var b = world.boats[n];
    if (b.pilot == null) continue;
    var pilot = byId[b.pilot];
    if (!pilot || pilot.state === 'dead' || pilot.boating !== b.id) {
      // 조종사 상실 → 그 자리(마지막 배 위치)에 정박
      if (pilot) pilot.boating = null;
      b.pilot = null;
      continue;
    }
    b.px = pilot.px; b.py = pilot.py; b.x = pilot.x; b.y = pilot.y; // 배가 조종사를 따라감
  }
}

// 낚시 지정 가능한 물 타일인지 + 등급(0=해안, 1=좌대 인접, 2=선착장 인접) 판정. -1 이면 지정 불가.
// 인접한 통행 가능 타일들 중 가장 높은 등급을 채택(여러 등급이 겹쳐도 최선을 적용).
export function fishSpotTier(world, x, y) {
  var best = -1;
  var nbrs = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  for (var n = 0; n < nbrs.length; n++) {
    var nx = nbrs[n][0], ny = nbrs[n][1];
    if (!isWalkable(world, nx, ny)) continue;
    var tier = 0;
    var bid = world.occupancy[idx(nx, ny)];
    if (bid !== undefined) {
      var nb = world.buildings[bid];
      if (nb && nb.stage === 'built') {
        if (nb.kind === 'dock') tier = 2;
        else if (nb.kind === 'fishPlatform') tier = 1;
      }
    }
    if (tier > best) best = tier;
  }
  return best;
}

// 건물 풋프린트 테두리(대각선 포함 바깥 한 겹)가 물과 접하는지 — 선착장(dock) 등 해안 전용 건물 배치 게이트.
export function footprintTouchesWater(world, x, y, fw, fh) {
  for (var dy = -1; dy <= fh; dy++) {
    for (var dx = -1; dx <= fw; dx++) {
      if (dx >= 0 && dx < fw && dy >= 0 && dy < fh) continue; // 내부는 제외(테두리만)
      var tx = x + dx, ty = y + dy;
      if (!inMap(tx, ty)) continue;
      if (world.terrain[idx(tx, ty)] === T_WATER) return true;
    }
  }
  return false;
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
    iron: s.iron || 0, meal: s.meal || 0, leather: s.leather || 0,
    meat: s.meat || 0, delicacy: s.delicacy || 0, mealGood: s.mealGood || 0, mealFeast: s.mealFeast || 0,
    sword: s.sword || 0, bow: s.bow || 0, ironSword: s.ironSword || 0, ironBow: s.ironBow || 0,
    leatherArmor: s.leatherArmor || 0, ironArmor: s.ironArmor || 0,
    wool: s.wool || 0, carrot: s.carrot || 0, mealVeg: s.mealVeg || 0,
  };
}

// ── 창고 업그레이드: 옛 저장본 호환용 기본 단계 ──
// ── 발전 단계 (문명 성장) ──
export function countBuilt(world, kind) {
  var n = 0;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind === kind && b.stage === 'built') n++;
  }
  return n;
}
export function maxPop(world) {
  var base = (RANKS[world.rank || 0] || RANKS[0]).popCap;
  var houses = Math.min(countBuilt(world, 'house'), HOUSE_POP_CAP_COUNT);
  return base + houses * HOUSE_POP_BONUS + upgradeAdd(world, 'maxpop');
}
// 다음 단계 승급 요건 상태 (없으면 null = 최고 단계). items: [{label, ok}]
export function rankReqStatus(world, alive) {
  var next = RANKS[(world.rank || 0) + 1];
  if (!next) return null;
  var req = next.req || {}, items = [], all = true, ok;
  if (req.pop) { ok = alive >= req.pop; items.push({ label: '인구 ' + Math.min(alive, req.pop) + '/' + req.pop, ok: ok }); all = all && ok; }
  if (req.builds) for (var k in req.builds) {
    var have = countBuilt(world, k), d = buildingDef(k);
    ok = have >= req.builds[k];
    items.push({ label: (d ? d.name : k) + ' ' + Math.min(have, req.builds[k]) + '/' + req.builds[k], ok: ok });
    all = all && ok;
  }
  if (req.res) { var res = totalRes(world); for (var t in req.res) {
    var nm = { wood: '목재', gold: '금', iron: '철', food: '식량', leather: '가죽' }[t] || t;
    ok = (res[t] || 0) >= req.res[t];
    items.push({ label: nm + ' ' + Math.min(res[t] || 0, req.res[t]) + '/' + req.res[t], ok: ok });
    all = all && ok;
  } }
  return { next: next, items: items, allOk: all };
}
export function canAdvanceRank(world, alive) {
  var s = rankReqStatus(world, alive);
  return !!(s && s.allOk);
}
export function advanceRank(world) {
  if ((world.rank || 0) + 1 < RANKS.length) world.rank = (world.rank || 0) + 1;
  return RANKS[world.rank || 0];
}

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
  return (s.wood || 0) + (s.gold || 0) + (s.food || 0) + (s.iron || 0) + (s.meal || 0) + (s.leather || 0) +
    (s.meat || 0) + (s.delicacy || 0) + (s.mealGood || 0) + (s.mealFeast || 0) + (s.wool || 0) +
    (s.carrot || 0) + (s.mealVeg || 0);
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

// 축사가 최소 1개 완공돼 있는가 — 길들이기 도구·작업의 게이트 조건
export function hasBarn(world) {
  for (var id in world.buildings) {
    if (world.buildings[id].kind === 'barn' && world.buildings[id].stage === 'built') return true;
  }
  return false;
}

// ── 축사: 번식은 안 하고, 길들인 야생동물 수에 비례해 주기적으로 식량 산출 ──
export function tickBarns(world, dtMin, rng) {
  var events = [];
  var tamedCount = 0;
  for (var s = 0; s < world.sheep.length; s++) if (world.sheep[s].tamed) tamedCount++;
  var poultryOn = !!(world.research && world.research.unlocked && world.research.unlocked.poultry);
  if (tamedCount === 0 && !poultryOn) return events;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind !== 'barn' || b.stage !== 'built') continue;
    if (tamedCount > 0) {
      b.barnT = (b.barnT || 0) + dtMin;
      if (b.barnT >= BARN.interval) {
        b.barnT = 0;
        if (!storageFull(world)) {
          var fr = buildingFront(world, b) || { x: b.x, y: b.y + 2 };
          addItem(world, idx(fr.x, fr.y), 'food', BARN.foodPerAnimal * tamedCount);
          events.push({ type: 'food', idx: idx(fr.x, fr.y) });
        }
      }
    }
    // 가금 사육 연구 해금 시 — 알을 품어 주기적으로 병아리(닭) 한 마리 부화(길들인 동물 유무와 무관)
    if (poultryOn) {
      b.eggT = (b.eggT || 0) + dtMin;
      if (b.eggT >= EGG_HATCH.interval) {
        b.eggT = 0;
        if (tamedCount < RANCH.maxSheep) { // 상한은 길들인(가축) 개체 수 기준 — 맵을 배회하는 야생동물은 무관
          var ex = b.x + ((rng() * 4) | 0) - 1, ey = b.y + 2 + ((rng() * 2) | 0);
          if (isWalkable(world, ex, ey)) {
            world.sheep.push({ id: world.nextSid++, type: 'chicken', x: ex, y: ey, px: ex, py: ey, tamed: true, dir: 1, cd: rng() * 30, phase: (rng() * 8) | 0 });
            events.push({ type: 'sheep' });
          }
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

// ── 겨울 난로: 겨울 동안만 장작(전역 재고)을 주기적으로 태워 온기 유지. 장작이 떨어지면 꺼짐(b.lit=false).
// 방금 꺼진(lit→false) 난로는 events 로 알림 → sim.js 가 토스트로 방출.
export function tickHeaters(world, dtMin) {
  var events = [];
  if (!seasonDef(world).cold) return events; // 겨울에만 연료 소비
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind !== 'heater' || b.stage !== 'built') continue;
    b.fuelT = (b.fuelT || 0) + dtMin;
    if (b.fuelT >= WINTER.heaterBurnInterval) {
      b.fuelT = 0;
      var wasLit = b.lit !== false;
      if ((world.stock.wood || 0) >= WINTER.heaterBurnAmount) {
        world.stock.wood -= WINTER.heaterBurnAmount;
        b.lit = true;
      } else {
        b.lit = false;
        if (wasLit) events.push({ type: 'heaterOut', b: b }); // 방금 꺼짐
      }
    }
  }
  return events;
}

// 매일 아침: 버섯·나무 재생 (맵 고갈 방지)
export function dailyRegrowth(world, rng) {
  var spawned = [];
  var i, x, y, i2;

  // 빈 잔디 타일에 놓을 수 있는지
  function freeGrass(ii) {
    return world.terrain[ii] === T_GRASS && !world.objects[ii] && !(world.dug && world.dug[ii]) &&
      world.occupancy[ii] === undefined && !world.stockpile[ii] && !world.items[ii] && !world.farmZone[ii] && !world.orchardZone[ii];
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

  // 당근밭 (채집 전용 신규 재료) 목표치까지 보충
  var carrotPatches = 0;
  for (i in world.objects) if (world.objects[i].kind === 'carrotPatch') carrotPatches++;
  tries = 0;
  while (carrotPatches < 10 && tries < 400) {
    tries++;
    x = (rng() * MAP_W) | 0; y = (rng() * MAP_H) | 0; i2 = idx(x, y);
    if (!freeGrass(i2)) continue;
    world.objects[i2] = { kind: 'carrotPatch' }; spawned.push(i2); carrotPatches++;
  }

  return spawned;
}

// 매일 아침: 식인종 섬의 상주 인구를 상한(cap)까지 서서히 보충 (30% 확률로 1체)
// 상시 서식 원정섬(식인종 섬·보물섬 수호자) 리스폰 — 테마별 종족·스탯 매핑.
var ISLAND_GUARD_KIND = { cannibal: 'cannibal', treasure: 'skeleton' };
var ISLAND_GUARD_STAT = { cannibal: CANNIBAL, treasure: SKELETON };
export function dailyIslandRespawn(world, rng) {
  var spawned = 0;
  for (var wi = 0; wi < (world.islands || []).length; wi++) {
    var isl = world.islands[wi];
    var kind = ISLAND_GUARD_KIND[isl.theme];
    if (!kind || !isl.cap) continue;
    var stat = ISLAND_GUARD_STAT[isl.theme];
    var count = 0;
    for (var ei = 0; ei < world.enemies.length; ei++) {
      var e = world.enemies[ei];
      if (e.kind === kind && Math.hypot(e.x - isl.cx, e.y - isl.cy) <= isl.r * 1.2) count++;
    }
    if (count >= isl.cap || rng() >= 0.3) continue;
    for (var t = 0; t < 40; t++) {
      var ang = rng() * Math.PI * 2, rad = rng() * isl.r * 0.75;
      var sx = Math.round(isl.cx + Math.cos(ang) * rad), sy = Math.round(isl.cy + Math.sin(ang) * rad);
      if (!inMap(sx, sy) || !isWalkable(world, sx, sy)) continue;
      world.enemies.push({
        id: world.nextEid++, x: sx, y: sy, px: sx, py: sy,
        hp: stat.hp, maxHp: stat.hp, cd: 0, dir: 1, anim: (rng() * 6) | 0, kind: kind,
      });
      spawned++;
      break;
    }
  }
  return spawned;
}

// 정착민이 미발견 원정 섬 반경 안에 들어오면 발견 처리. 새로 발견한 섬 배열 반환.
export function checkIslandDiscovery(world, pawns) {
  var found = [];
  for (var wi = 0; wi < (world.islands || []).length; wi++) {
    var isl = world.islands[wi];
    if (isl.discovered) continue;
    for (var p = 0; p < pawns.length; p++) {
      if (pawns[p].state === 'dead') continue;
      if (Math.hypot(pawns[p].px - isl.cx, pawns[p].py - isl.cy) <= isl.r) {
        isl.discovered = true;
        found.push(isl);
        break;
      }
    }
  }
  return found;
}

// 저장 게임 마이그레이션: 악마후배 섬·보스가 없으면(구버전 세이브) 지형을 새기고 보스를 스폰.
// 이미 악마가 있거나(신규 게임) 격파했으면 아무것도 하지 않음. 반환: 무언가 추가했으면 true.
export function ensureBossIsland(world) {
  if (world.bossDefeated) return false;
  for (var i = 0; i < world.enemies.length; i++) if (world.enemies[i].kind === 'demon') return false; // 이미 존재
  var def = null;
  for (var k = 0; k < ISLANDS.length; k++) if (ISLANDS[k].theme === 'boss') def = ISLANDS[k];
  if (!def) return false;
  var cx = MAP_W * def.cxf, cy = MAP_H * def.cyf, r = MAP_W * def.rf;
  // 섬 지형 새김(물 → 잔디). 육지가 이미 있으면 그대로 둠.
  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var nx = (x - cx) / r, ny = (y - cy) / r;
      if (Math.sqrt(nx * nx + ny * ny) < 0.84) {
        var ii = idx(x, y);
        if (world.terrain[ii] === T_WATER) world.terrain[ii] = T_GRASS;
      }
    }
  }
  // 섬 메타 없으면 추가(대개 createWorld 가 이미 넣어둠)
  world.islands = world.islands || [];
  var hasMeta = false;
  for (var m = 0; m < world.islands.length; m++) if (world.islands[m].theme === 'boss') hasMeta = true;
  if (!hasMeta) {
    world.islands.push({ id: def.id, name: def.name, icon: def.icon, theme: def.theme,
      cx: Math.round(cx), cy: Math.round(cy), r: Math.round(r), discovered: false, cap: 0, boss: true });
  }
  // 악마 스폰(섬 중앙, 통행 가능 지점)
  var bx = Math.round(cx), by = Math.round(cy), placed = isWalkable(world, bx, by);
  for (var rr = 1; rr < r + 2 && !placed; rr++) {
    for (var dy = -rr; dy <= rr && !placed; dy++) {
      for (var dx = -rr; dx <= rr && !placed; dx++) {
        if (isWalkable(world, bx + dx, by + dy)) { bx += dx; by += dy; placed = true; }
      }
    }
  }
  world.enemies.push({ id: world.nextEid++, x: bx, y: by, px: bx, py: by,
    hp: DEMON.hp, maxHp: DEMON.hp, cd: 0, dir: -1, anim: 0, kind: 'demon', boss: true });
  return true;
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

// ── 일꾼 오두막: 자원에 붙여 지어 자동 채광·농사 ──
// 건물 풋프린트 바깥 한 겹(대각 포함)에서 광산 건물 하나 반환(없으면 null).
export function adjacentMine(world, b) {
  var def = buildingDef(b.kind);
  for (var dy = -1; dy <= def.fh; dy++) {
    for (var dx = -1; dx <= def.fw; dx++) {
      if (dx >= 0 && dx < def.fw && dy >= 0 && dy < def.fh) continue; // 내부 제외
      var tx = b.x + dx, ty = b.y + dy;
      if (!inMap(tx, ty)) continue;
      var bid = world.occupancy[idx(tx, ty)];
      if (bid !== undefined) {
        var nb = world.buildings[bid];
        if (nb && isMine(nb.kind) && nb.stage === 'built') return nb;
      }
    }
  }
  return null;
}
// (배치 게이트용) x,y 풋프린트 바깥 한 겹에 광산이 있는지
export function footprintAdjacentMine(world, x, y, fw, fh) {
  for (var dy = -1; dy <= fh; dy++) {
    for (var dx = -1; dx <= fw; dx++) {
      if (dx >= 0 && dx < fw && dy >= 0 && dy < fh) continue;
      var tx = x + dx, ty = y + dy;
      if (!inMap(tx, ty)) continue;
      var bid = world.occupancy[idx(tx, ty)];
      if (bid !== undefined) { var nb = world.buildings[bid]; if (nb && isMine(nb.kind)) return true; }
    }
  }
  return false;
}
// 매 진행마다: 광부 오두막은 인접 광산을 자동 채굴 지정, 농부 오두막은 주변 잔디를 자동 농사 구역화.
// 바뀐 게 있으면 true(호출부에서 구역 오버레이 갱신). 정착민 배치·소유 개념 없이 "지정"만 자동화.
export function autoDesignateLodges(world) {
  var changed = false;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'built') continue;
    if (b.kind === 'minerLodge') {
      var mine = adjacentMine(world, b);
      if (mine && !mine.depleted && (mine.charges || 0) > 0 && !world.mineDesig[mine.id]) {
        world.mineDesig[mine.id] = true; changed = true;
      }
    } else if (b.kind === 'farmLodge') {
      if (!world.research || !world.research.unlocked || !world.research.unlocked.farming) continue;
      var def = buildingDef(b.kind);
      var R = LODGE_FARM_RADIUS;
      for (var dy = -R; dy < def.fh + R; dy++) {
        for (var dx = -R; dx < def.fw + R; dx++) {
          if (dx >= 0 && dx < def.fw && dy >= 0 && dy < def.fh) continue; // 오두막 자리 제외
          var tx = b.x + dx, ty = b.y + dy;
          if (!inMap(tx, ty)) continue;
          var i = idx(tx, ty);
          if (world.farmZone[i] || world.orchardZone[i]) continue;
          if (!isWalkable(world, tx, ty)) continue;
          if (world.occupancy[i] !== undefined || world.objects[i] || world.stockpile[i]) continue;
          world.farmZone[i] = true; changed = true;
        }
      }
    }
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

// 연구 포인트 자동 누적 (정착민 수 비례 + 도서관 배율)
export function tickResearch(world, aliveCount, dtMin) {
  var libMult = 1 + countBuilt(world, 'library') * LIBRARY.bonusPerBuilding;
  world.research.points += RESEARCH_RATE_PER_PAWN * aliveCount * dtMin * libMult;
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
// 적 종류별 스탯 (기본 고블린, 거인 '괴민')
export function enemyStats(e) {
  if (e && e.kind === 'giant') return GIANT;
  if (e && e.kind === 'cannibal') return CANNIBAL;
  if (e && e.kind === 'warlord') return WARLORD;
  if (e && e.kind === 'raider') return RAIDER;
  if (e && e.kind === 'warrior') return INVWARRIOR;
  if (e && e.kind === 'zombie') return ZOMBIE;
  if (e && e.kind === 'skeleton') return SKELETON;
  if (e && e.kind === 'demon') return DEMON;
  if (e && e.kind === 'minidemon') return MINIDEMON;
  return ENEMY;
}

// waveNo: 대침공(INVASION) 웨이브 번호 태그(1~3). 일반 습격은 생략 → 0으로 저장.
export function spawnRaid(world, count, rng, kind, waveNo) {
  var isGiant = kind === 'giant';
  var isWarlord = kind === 'warlord';
  var fixedHp = { warlord: WARLORD.hp, raider: RAIDER.hp, warrior: INVWARRIOR.hp, zombie: ZOMBIE.hp, skeleton: SKELETON.hp }[kind]; // 고정 체력 종족
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
  // 체력: 침략 세력(정복자·약탈자·전사)은 고정, 거인은 훨씬 튼튼, 고블린은 일수 비례 강화
  var ehp = fixedHp !== undefined
    ? fixedHp
    : isGiant
      ? GIANT.hp + Math.floor((world.day || 1) * (GIANT.hpPerDay || 0))
      : ENEMY.hp + Math.floor((world.day || 1) * (RAID.hpPerDay || 0));
  // 한 지점 근처에 무리로 상륙
  var base = edges[(rng() * edges.length) | 0];
  for (var n = 0; n < count; n++) {
    var sx = base.x + ((rng() * 5) | 0) - 2;
    var sy = base.y + ((rng() * 5) | 0) - 2;
    if (!isWalkable(world, sx, sy)) { sx = base.x; sy = base.y; }
    world.enemies.push({
      id: world.nextEid++, x: sx, y: sy, px: sx, py: sy,
      hp: ehp, maxHp: ehp, cd: 0, dir: 1, anim: (rng() * 6) | 0,
      kind: kind || 'goblin', wave: waveNo || 0,
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

// 건물 풋프린트에서 (ex,ey) 에 가장 가까운 타일 좌표 (대형 건물의 "가까운 벽" 접근용)
function closestPointOnBuilding(ex, ey, b, def) {
  var cx = Math.max(b.x, Math.min(ex, b.x + def.fw - 1));
  var cy = Math.max(b.y, Math.min(ey, b.y + def.fh - 1));
  return { x: cx, y: cy };
}

// 적의 공격 대상 탐색: 정착민을 우선하되(거리 보정), 정착민이 멀거나 없으면 가장 가까운 건물·작물도 노림
// (담 너머 갇혀도 근처 건물·밭을 부수며 진행) — 반환: {kind:'pawn'|'building'|'crop', ref, x, y, dist}
function nearestAttackable(world, pawns, ex, ey) {
  var best = null, bestScore = Infinity;
  for (var p = 0; p < pawns.length; p++) {
    if (pawns[p].state === 'dead') continue;
    var dp = Math.abs(pawns[p].px - ex) + Math.abs(pawns[p].py - ey);
    var score = Math.max(0, dp - 2); // 정착민은 2칸 더 가까운 것처럼 취급(우선 타겟)
    if (score < bestScore) { bestScore = score; best = { kind: 'pawn', ref: pawns[p], x: pawns[p].px, y: pawns[p].py, dist: dp }; }
  }
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'built' || b.natural || b.kind === 'bridge') continue;
    var def = buildingDef(b.kind);
    var pt = closestPointOnBuilding(ex, ey, b, def);
    var db = Math.abs(pt.x - ex) + Math.abs(pt.y - ey);
    if (db < bestScore) { bestScore = db; best = { kind: 'building', ref: b, x: pt.x, y: pt.y, dist: db }; }
  }
  for (var ci in world.crops) {
    var c = world.crops[ci];
    if (!c || c.stage === 'empty') continue;
    var cx = ix(+ci), cy = iy(+ci);
    var dc = Math.abs(cx - ex) + Math.abs(cy - ey);
    if (dc < bestScore) { bestScore = dc; best = { kind: 'crop', ref: { idx: +ci }, x: cx, y: cy, dist: dc }; }
  }
  return best;
}

// 착용 방어구의 피해 경감치(defense). 미착용 시 0. 최소 1 데미지는 항상 관통(무적 방지)은 호출부에서 처리.
function armorDefense(pawn) {
  return (pawn.armor && ARMOR[pawn.armor]) ? ARMOR[pawn.armor].defense : 0;
}

// 4방향(상하좌우)을 목표 방향(dx,dy)에 가까운 순으로 정렬해 반환. 한 축이 0이어도 항상 4방향 모두 포함.
function dirsTowardTarget(dx, dy) {
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  dirs.sort(function (a, b) { return (b[0] * dx + b[1] * dy) - (a[0] * dx + a[1] * dy); });
  return dirs;
}

// 보스(데몬) 전용: 목표 "앞쪽"(다가가는 방향)으로 인접한 나무·솔리드 건물을 하나 찾음.
// 우회(A*) 대신 앞을 막은 건물을 부수며 직진하게 하려는 용도. 옆·뒤 건물은 무시, 다리·좌대(통행 가능)도 제외.
function adjacentBlocker(world, e, tgt) {
  var ex = Math.round(e.px), ey = Math.round(e.py);
  var dx = tgt.x - e.px, dy = tgt.y - e.py;
  var order = dirsTowardTarget(dx, dy);
  for (var k = 0; k < order.length; k++) {
    var ox = order[k][0], oy = order[k][1];
    if (ox * dx + oy * dy <= 0) break; // 목표에서 멀어지는 방향(옆·뒤)은 검사하지 않음
    var ax = ex + ox, ay = ey + oy;
    if (!inMap(ax, ay)) continue;
    var ai = idx(ax, ay);
    var o = world.objects[ai];
    if (o && o.kind === 'tree') return { kind: 'tree', x: ax, y: ay };
    var abid = world.occupancy[ai];
    if (abid !== undefined) {
      var ab = world.buildings[abid];
      if (ab && ab.stage === 'built' && !ab.natural && ab.kind !== 'bridge' && ab.kind !== 'fishPlatform') {
        return { kind: 'building', ref: ab, x: ax, y: ay };
      }
    }
  }
  return null;
}

// 길이 완전히 막혔을 때(A* 경로 없음) 목표 방향의 인접 장애물을 부수고 돌파.
// 나무→그루터기, 다리·좌대→즉시 제거(얇은 판자), 일반 건물→st.power 만큼 피해. 부쉈으면 true.
// e.cd 로 속도 제어되며(호출부), 부술 게 없으면 false(호출부에서 그리디 셔플로 폴백).
function breakThrough(world, e, tgt, st, cb) {
  var ex = Math.round(e.px), ey = Math.round(e.py);
  var order = dirsTowardTarget(tgt.x - e.px, tgt.y - e.py); // 항상 4방향 검사(목표 방향 우선)
  for (var k = 0; k < order.length; k++) {
    var ox = order[k][0], oy = order[k][1];
    var ax = ex + ox, ay = ey + oy;
    if (!inMap(ax, ay)) continue;
    var ai = idx(ax, ay);
    var o = world.objects[ai];
    if (o && o.kind === 'tree') { world.objects[ai] = { kind: 'stump' }; if (cb.onObstacleBreak) cb.onObstacleBreak(ax, ay); return true; }
    var abid = world.occupancy[ai];
    if (abid !== undefined) {
      var ab = world.buildings[abid];
      if (ab && ab.stage === 'built' && !ab.natural) {
        if (ab.kind === 'bridge' || ab.kind === 'fishPlatform') { // 얇은 판자 — 한 방에 부숨
          if (cb.onBuildingDestroyed) cb.onBuildingDestroyed(ab); removeBuilding(world, ab); return true;
        }
        ab.hp = Math.max(0, (ab.hp != null ? ab.hp : BUILDING_HP_DEFAULT) - st.power);
        if (ab.hp <= 0) { if (cb.onBuildingDestroyed) cb.onBuildingDestroyed(ab); removeBuilding(world, ab); }
        else if (cb.onBuildingHit) cb.onBuildingHit(ab, st.power);
        return true;
      }
    }
  }
  return false;
}

// 목표(tx,ty)를 향해 통행 가능한 방향으로 그리디 1스텝(우회 겸 폴백). 이동했으면 true.
function greedyStepEnemy(world, e, tx, ty, step) {
  var vx = Math.sign(tx - e.px), vy = Math.sign(ty - e.py);
  if (vx !== 0) e.dir = vx;
  var moved = false;
  if (Math.abs(tx - e.px) >= Math.abs(ty - e.py)) {
    if (vx !== 0 && isWalkable(world, Math.round(e.px + vx), Math.round(e.py), true)) { e.px += vx * step; moved = true; }
    else if (vy !== 0 && isWalkable(world, Math.round(e.px), Math.round(e.py + vy), true)) { e.py += vy * step; moved = true; }
  } else {
    if (vy !== 0 && isWalkable(world, Math.round(e.px), Math.round(e.py + vy), true)) { e.py += vy * step; moved = true; }
    else if (vx !== 0 && isWalkable(world, Math.round(e.px + vx), Math.round(e.py), true)) { e.px += vx * step; moved = true; }
  }
  if (moved) { e.x = Math.round(e.px); e.y = Math.round(e.py); }
  return moved;
}

// 적 이동·공격 (정착민 공격은 pawns.js 에서). 이동은 A* 경로 추종(막히면 우회)이며,
// 경로가 아예 없으면 앞을 막은 나무·건물·다리를 부수고 돌파한다. cb: {onHit(pawn,dmg),
// 전투 피격 시 피해량 비례 확률로 부상 부여(다리/팔 중 하나). 이미 부상 중이면 심각도만 재갱신(최악으로).
function maybeInjure(pawn, dmg, rng) {
  var chance = Math.min(0.5, (dmg / (pawn.maxHp || 100)) * INJURY.chanceMult);
  if (rng() >= chance) return;
  if (pawn.injury) { pawn.injury.severity = 1; return; }
  pawn.injury = { type: rng() < 0.5 ? 'leg' : 'arm', severity: 1 };
}

//   onPawnDeath(pawn), onEnemyGone, onBuildingDestroyed(b), onCropDestroyed(idx),
//   onGiantJump(e,x,y), onObstacleBreak(x,y), onDemonLaser(e,tx,ty)}
export function updateEnemies(world, pawns, dtMin, cb, rng) {
  var rngF = rng || Math.random;
  var alive = [];
  for (var n = 0; n < world.enemies.length; n++) {
    var e = world.enemies[n];
    var st = enemyStats(e);
    if (e.hp <= 0) {
      // 처치 → 전리품 드랍 (거인은 철도)
      addItem(world, idx(e.x, e.y), 'gold', st.dropGold);
      if (st.dropIron) addItem(world, idx(e.x, e.y), 'iron', st.dropIron);
      if (e.kind === 'demon') world.bossJustKilled = true; // 최종 보스 처치 — sim.js 가 전설 유물·안내 처리
      if (cb.onEnemyDown) cb.onEnemyDown(e);
      continue;
    }
    if (e.atkT) e.atkT = Math.max(0, e.atkT - dtMin); // 공격 찌르기 모션 타이머(렌더 전용)
    // 최종 보스 「악마후배」: 미니 악마 소환(긴 쿨다운) + 광역 레이저
    if (e.kind === 'demon') {
      // 미니 악마 소환 — 긴 쿨다운마다, 사거리 내 목표가 있을 때만(플레이어가 보스에 접근했을 때 증원).
      // 레이저·이동과 별개(틱을 소모하지 않음). 무한 누적 방지를 위해 동시 상한(maxAlive)을 둔다.
      e.summonCd = (e.summonCd === undefined ? DEMON.summon.cooldown : e.summonCd) - dtMin;
      if (e.summonCd <= 0) {
        var stgt = nearestAttackable(world, pawns, e.px, e.py);
        var aliveMinis = 0;
        for (var mi = 0; mi < world.enemies.length; mi++) if (world.enemies[mi].kind === 'minidemon' && world.enemies[mi].hp > 0) aliveMinis++;
        if (stgt && stgt.dist <= DEMON.summon.range && aliveMinis < DEMON.summon.maxAlive) {
          e.summonCd = DEMON.summon.cooldown;
          var summoned = 0;
          for (var sm = 0; sm < DEMON.summon.count && aliveMinis + summoned < DEMON.summon.maxAlive; sm++) {
            var smx = Math.max(1, Math.min(MAP_W - 2, Math.round(e.px + ((rngF() * 5) | 0) - 2)));
            var smy = Math.max(1, Math.min(MAP_H - 2, Math.round(e.py + ((rngF() * 5) | 0) - 2)));
            if (!isWalkable(world, smx, smy)) { smx = Math.round(e.px); smy = Math.round(e.py); }
            world.enemies.push({
              id: world.nextEid++, x: smx, y: smy, px: smx, py: smy,
              hp: MINIDEMON.hp, maxHp: MINIDEMON.hp, cd: 0, dir: 1, anim: (rngF() * 6) | 0,
              kind: 'minidemon', wave: e.wave || 0,
            });
            summoned++;
          }
          if (summoned > 0 && cb.onDemonSummon) cb.onDemonSummon(e, summoned);
        }
      }
      e.laserCd = (e.laserCd === undefined ? DEMON.laser.cooldown : e.laserCd) - dtMin;
      if (e.laserCd <= 0) {
        var ltgt = nearestAttackable(world, pawns, e.px, e.py);
        if (ltgt && ltgt.dist <= DEMON.laser.range) {
          e.laserCd = DEMON.laser.cooldown;
          var lrad = DEMON.laser.radius, ldmg = DEMON.laser.damage;
          for (var zp = 0; zp < pawns.length; zp++) { // 반경 내 정착민
            var zpw = pawns[zp];
            if (zpw.state === 'dead') continue;
            if (Math.abs(zpw.px - e.px) + Math.abs(zpw.py - e.py) <= lrad) {
              var zdmg = Math.max(1, ldmg - armorDefense(zpw));
              zpw.hp = Math.max(0, zpw.hp - zdmg);
              maybeInjure(zpw, zdmg, rngF);
              if (cb.onHit) cb.onHit(zpw, zdmg);
              if (zpw.hp <= 0 && zpw.state !== 'dead') { zpw.state = 'dead'; zpw.job = null; if (cb.onPawnDeath) cb.onPawnDeath(zpw); }
            }
          }
          for (var zid in world.buildings) { // 반경 내 건물
            var zb = world.buildings[zid];
            if (zb.stage !== 'built' || zb.natural || zb.kind === 'bridge') continue;
            var zdef = buildingDef(zb.kind);
            var zpt = closestPointOnBuilding(e.px, e.py, zb, zdef);
            if (Math.abs(zpt.x - e.px) + Math.abs(zpt.y - e.py) <= lrad) {
              zb.hp = Math.max(0, (zb.hp != null ? zb.hp : BUILDING_HP_DEFAULT) - ldmg);
              if (zb.hp <= 0) { if (cb.onBuildingDestroyed) cb.onBuildingDestroyed(zb); removeBuilding(world, zb); }
              else if (cb.onBuildingHit) cb.onBuildingHit(zb, ldmg);
            }
          }
          if (cb.onDemonLaser) cb.onDemonLaser(e, ltgt.x, ltgt.y);
          alive.push(e);
          continue; // 이번 틱은 레이저로 소모 — 일반 이동/공격 생략
        }
      }
    }
    // 괴민 점프: 쿨다운마다 목표 방향으로 도약(통행 불가 지형 무시) → 벽·숲에 막혀도 뚫고 진행 + 착지 지점 광역 파괴
    if (e.kind === 'giant') {
      e.jumpCd = (e.jumpCd === undefined ? GIANT_JUMP.cooldown : e.jumpCd) - dtMin;
      if (e.jumpCd <= 0) {
        e.jumpCd = GIANT_JUMP.cooldown;
        var jt = nearestAttackable(world, pawns, e.px, e.py);
        var jx = jt ? Math.sign(jt.x - e.px) : (e.dir || 1);
        var jy = jt ? Math.sign(jt.y - e.py) : 0;
        if (jx === 0 && jy === 0) jx = e.dir || 1;
        var lx = Math.max(1, Math.min(MAP_W - 2, Math.round(e.px + jx * GIANT_JUMP.distance)));
        var ly = Math.max(1, Math.min(MAP_H - 2, Math.round(e.py + jy * GIANT_JUMP.distance)));
        e.px = lx; e.py = ly; e.x = lx; e.y = ly;
        if (jx !== 0) e.dir = jx;
        // 착지 반경: 나무 파괴, 정착민·건물 피해
        for (var ddy = -GIANT_JUMP.radius; ddy <= GIANT_JUMP.radius; ddy++) {
          for (var ddx = -GIANT_JUMP.radius; ddx <= GIANT_JUMP.radius; ddx++) {
            var lxx = lx + ddx, lyy = ly + ddy;
            if (Math.abs(ddx) + Math.abs(ddy) > GIANT_JUMP.radius) continue;
            if (!inMap(lxx, lyy)) continue;
            var li = idx(lxx, lyy);
            var lo = world.objects[li];
            if (lo && lo.kind === 'tree') world.objects[li] = { kind: 'stump' };
          }
        }
        for (var lp = 0; lp < pawns.length; lp++) {
          var lpw = pawns[lp];
          if (lpw.state === 'dead') continue;
          if (Math.abs(lpw.px - lx) + Math.abs(lpw.py - ly) <= GIANT_JUMP.radius) {
            var jdmg = Math.max(1, GIANT_JUMP.damage - armorDefense(lpw));
            lpw.hp = Math.max(0, lpw.hp - jdmg);
            maybeInjure(lpw, jdmg, rngF);
            if (cb.onHit) cb.onHit(lpw, jdmg);
            if (lpw.hp <= 0 && lpw.state !== 'dead') { lpw.state = 'dead'; lpw.job = null; if (cb.onPawnDeath) cb.onPawnDeath(lpw); }
          }
        }
        for (var lid in world.buildings) {
          var lb = world.buildings[lid];
          if (lb.stage !== 'built' || lb.natural || lb.kind === 'bridge') continue;
          var ldef = buildingDef(lb.kind);
          var lpt = closestPointOnBuilding(lx, ly, lb, ldef);
          if (Math.abs(lpt.x - lx) + Math.abs(lpt.y - ly) <= GIANT_JUMP.radius) {
            lb.hp = Math.max(0, (lb.hp != null ? lb.hp : BUILDING_HP_DEFAULT) - GIANT_JUMP.damage);
            if (lb.hp <= 0) { if (cb.onBuildingDestroyed) cb.onBuildingDestroyed(lb); removeBuilding(world, lb); }
            else if (cb.onBuildingHit) cb.onBuildingHit(lb, GIANT_JUMP.damage);
          }
        }
        if (cb.onGiantJump) cb.onGiantJump(e, lx, ly);
        alive.push(e);
        continue; // 이번 틱은 점프로 소모 — 일반 이동/공격 생략
      }
    }
    // 목표: 정착민 우선, 없거나 멀면 가까운 건물·작물
    var tgt = nearestAttackable(world, pawns, e.px, e.py);
    if (tgt) {
      // 건물은 풋프린트 가장자리까지의 거리라 직선 접근 시 정수 타일 경계에 걸려
      // adjacentR 를 좁게 잡으면 "건물 바로 앞인데 못 붙는" 채로 영원히 멈추는 경우가 생김(관측된 버그) — 여유를 더 둠.
      var adjacentR = tgt.kind === 'pawn' ? 1.05 : 1.5;
      if (tgt.dist <= adjacentR) {
        // 인접 → 공격
        e.cd -= dtMin;
        e.moving = false;
        if (e.cd <= 0) {
          e.cd = st.attackCd;
          e.atkT = 9; e.atkDX = Math.sign(tgt.x - e.px); e.atkDY = Math.sign(tgt.y - e.py); // 찌르기 모션
          if (e.atkDX !== 0) e.dir = e.atkDX;
          if (tgt.kind === 'pawn') {
            var pw = tgt.ref;
            var pdmg = Math.max(1, st.power - armorDefense(pw));
            pw.hp = Math.max(0, pw.hp - pdmg);
            maybeInjure(pw, pdmg, rngF);
            if (cb.onHit) cb.onHit(pw, pdmg);
            if (e.kind === 'giant' && cb.onGiantSmash) cb.onGiantSmash(e, pw); // 주먹질 충격
            if (pw.hp <= 0 && pw.state !== 'dead') {
              pw.state = 'dead';
              pw.job = null;
              if (cb.onPawnDeath) cb.onPawnDeath(pw);
            }
          } else if (tgt.kind === 'building') {
            var bld = tgt.ref;
            bld.hp = Math.max(0, (bld.hp != null ? bld.hp : BUILDING_HP_DEFAULT) - st.power);
            if (bld.hp <= 0) { if (cb.onBuildingDestroyed) cb.onBuildingDestroyed(bld); removeBuilding(world, bld); }
            else if (cb.onBuildingHit) cb.onBuildingHit(bld, st.power);
          } else if (tgt.kind === 'crop') {
            delete world.crops[tgt.ref.idx];
            if (cb.onCropDestroyed) cb.onCropDestroyed(tgt.ref.idx);
          }
        }
      } else {
        // 보스(데몬)는 앞을 막은 나무·건물을 우회하지 않고 부수며 직진 — 파괴자다운 압박
        if (e.kind === 'demon') {
          var blk = adjacentBlocker(world, e, tgt);
          if (blk) {
            e.moving = false;
            e.cd -= dtMin;
            if (e.cd <= 0) {
              e.cd = st.attackCd;
              e.atkT = 9; e.atkDX = Math.sign(blk.x - Math.round(e.px)); e.atkDY = Math.sign(blk.y - Math.round(e.py));
              if (e.atkDX !== 0) e.dir = e.atkDX;
              if (blk.kind === 'tree') {
                world.objects[idx(blk.x, blk.y)] = { kind: 'stump' };
                if (cb.onObstacleBreak) cb.onObstacleBreak(blk.x, blk.y);
              } else {
                var sb = blk.ref;
                sb.hp = Math.max(0, (sb.hp != null ? sb.hp : BUILDING_HP_DEFAULT) - st.power);
                if (sb.hp <= 0) { if (cb.onBuildingDestroyed) cb.onBuildingDestroyed(sb); removeBuilding(world, sb); }
                else if (cb.onBuildingHit) cb.onBuildingHit(sb, st.power);
              }
            }
            alive.push(e);
            continue; // 부수는 중 — 이번 틱 이동 생략
          }
        }
        // 접근: A* 경로 추종(막히면 우회) → 경로가 아예 없으면 앞을 막은 장애물 파괴. 빠른 괴민은 이동 단축.
        e.moving = true;
        var mmpt = e.fast ? st.moveMinPerTile * GIANT_FAST_MULT : st.moveMinPerTile;
        var step = dtMin / mmpt;
        var ex0 = Math.round(e.px), ey0 = Math.round(e.py);
        var gx = Math.round(tgt.x), gy = Math.round(tgt.y);
        // 경로 재계산: 미보유/쿨다운 만료/목표가 크게 이동 시 (적별 지터로 동시 폭주 방지)
        e.pathCd = (e.pathCd || 0) - dtMin;
        var goalMoved = !e.pathGoal || (Math.abs(e.pathGoal.x - gx) + Math.abs(e.pathGoal.y - gy) > 2);
        if (e.path === undefined || e.pathCd <= 0 || goalMoved) {
          e.path = findPath(world, ex0, ey0, gx, gy, true, true);
          e.pathGoal = { x: gx, y: gy };
          e.pathCd = 30 + (e.id % 20);
        }
        if (e.path === null) {
          // 경로 없음(물·벽으로 완전 차단) → 인접 장애물을 부수고 돌파, 없으면 셔플
          e.cd -= dtMin;
          if (e.cd <= 0) {
            e.cd = st.attackCd;
            if (!breakThrough(world, e, tgt, st, cb)) greedyStepEnemy(world, e, tgt.x, tgt.y, step);
          } else {
            greedyStepEnemy(world, e, tgt.x, tgt.y, step);
          }
        } else if (e.path.length > 0) {
          // 다음 웨이포인트(인접·통행가능)로 이동, 그 타일에 올라서면 팝(반올림 기준 — 스텝이 커도 진동 없이 진행)
          var wp = e.path[0];
          greedyStepEnemy(world, e, wp.x, wp.y, step);
          if (Math.round(e.px) === wp.x && Math.round(e.py) === wp.y) e.path.shift();
        } else {
          // 경로 == [] (격자상 이미 목표 인접) → 목표를 향해 직접 그리디
          greedyStepEnemy(world, e, tgt.x, tgt.y, step);
        }
      }
    }
    alive.push(e);
  }
  world.enemies = alive;
}

// 방어 건물(망루·초소·성) 자동 공격: 사거리 내 최근접 적 타격
// 방어건물의 현재 공격 스탯. 초소 분기(b.branch) 우선 → DEFENSE_TIERS → BUILDS.attack 폴백.
// aoe(맨해튼 반경, 0=단일)로 광역/단일 통일. cannon 은 하위호환 표기(aoe>0 과 동일 의미).
export function defenseStats(b) {
  if (b.branch && OUTPOST_BRANCHES[b.branch]) {
    var br = OUTPOST_BRANCHES[b.branch];
    var bt = br.tiers[(b.tier || 1) - 1] || br.tiers[br.tiers.length - 1];
    return { power: bt.power, range: bt.range, cd: bt.cd, aoe: bt.aoe || 0, cannon: (bt.aoe || 0) > 0, branch: b.branch, role: br.role };
  }
  var tiers = DEFENSE_TIERS[b.kind];
  if (tiers) {
    var t = tiers[(b.tier || 1) - 1] || tiers[tiers.length - 1];
    var aoe = t.aoe || (t.cannon ? CANNON.radius : 0);
    return { power: t.power, range: t.range, cd: t.cd, aoe: aoe, cannon: aoe > 0 };
  }
  var a = (BUILDS[b.kind] || {}).attack || { power: 0, range: 0, cd: 999 };
  return { power: a.power, range: a.range, cd: a.cd, aoe: 0, cannon: false };
}

export function tickTowers(world, dtMin, cb) {
  if (world.enemies.length === 0) return;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'built') continue;
    var def = BUILDS[b.kind];
    if (!def || !def.attack) continue;
    var st = defenseStats(b);
    b.atkCd = (b.atkCd || 0) - dtMin;
    if (b.atkCd > 0) continue;
    var cx = b.x + def.fw / 2, cy = b.y + def.fh / 2;
    var near = nearestEnemy(world, cx, cy, st.range + upgradeAdd(world, 'towerrange'));
    if (!near) continue;
    b.atkCd = st.cd;
    var dmg = st.power * upgradeMult(world, 'towerpower');
    if (st.aoe > 0) { // 광역(대포·투석기·가시벽): 타겟 주변 반경 내 모든 적에게 피해
      var tx = near.enemy.x, ty = near.enemy.y;
      for (var ei = 0; ei < world.enemies.length; ei++) {
        var en = world.enemies[ei];
        if (Math.abs(en.x - tx) + Math.abs(en.y - ty) <= st.aoe) en.hp -= dmg;
      }
      if (cb && cb.onCannonFire) cb.onCannonFire(b, near.enemy);
    } else {
      near.enemy.hp -= dmg;
      if (cb && cb.onTowerFire) cb.onTowerFire(b, near.enemy);
    }
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

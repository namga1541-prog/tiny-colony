// 헤드리스 시뮬레이션 하네스 (L1) — 브라우저·PIXI 없이 Node 에서 게임을 돌린다.
//
// 실제 게임과 "동일한" stepWorld(sim.js) 를 호출하므로 테스트가 진짜 코드를 검증한다.
// 시드를 고정하면 완전히 결정론적이라 재현·회귀 비교가 가능하다.
import { PAWN_DEFS, MAP_W, MAP_H, DAY_MIN, RAID } from '../js/config.js';
import { createWorld, mulberry32, seasonIndex, idx, isWalkable } from '../js/world.js';
import { createPawn } from '../js/pawns.js';
import { stepWorld } from '../js/sim.js';

// 시드 고정 세계를 부팅. main.js 의 새게임 경로와 동일한 초기화(트레잇·허기·계절·습격일).
export function bootSim(seed) {
  var world = createWorld(seed);
  world.nextRaidDay = RAID.firstDay;
  world.prevSeason = seasonIndex(world);
  var cx = MAP_W / 2, cy = MAP_H / 2;
  var pinit = mulberry32(world.seed ^ 0x9a3c);
  var pawns = PAWN_DEFS.map(function (def, n) {
    return createPawn(n, def, cx - 1 + n, cy + 1, pinit);
  });
  var ambient = mulberry32(world.seed ^ 0x5eed);

  var events = [];
  var counters = { toast: 0, sfx: 0, recruit: 0, death: 0, pawnKill: 0, enemyDown: 0, towerFire: 0, pawnStrike: 0 };

  // 효과 콜백 = 기록용 stub (DOM/렌더 없음)
  var ctx = {
    rng: ambient,
    onWorldChange: function () {},
    onItemChange: function () {},
    onCropChange: function () {},
    onBuildingChange: function () {},
    onBuildingBuilt: function () {},
    onEvent: function (m) { events.push(m); },
    onStorageFull: function () {},
    onDeath: function () { counters.death++; },
    onStarving: function () {},
    onSheepChange: function () {},
    onTileChange: function () {},
    onToast: function () { counters.toast++; },
    onSfx: function () { counters.sfx++; },
    onRecruit: function () { headlessRecruit(world, pawns, ambient); counters.recruit++; },
    onSeasonTint: function () {},
    onGoddessDescend: function () {},
    onZonesChanged: function () {},
    onPawnStrike: function () { counters.pawnStrike++; },
  };
  var enemyCbs = {
    onHit: function () {},
    onPawnDeath: function () { counters.pawnKill++; },
    onEnemyDown: function () { counters.enemyDown++; },
    onTowerFire: function () { counters.towerFire++; },
  };

  return { world: world, pawns: pawns, ctx: ctx, enemyCbs: enemyCbs, ambient: ambient, events: events, counters: counters };
}

// 떠돌이 영입(헤드리스판) — main.recruitWanderer 의 상태 부분만. 렌더/UI 제외.
function headlessRecruit(world, pawns, rng) {
  var cx0 = MAP_W / 2 | 0, cy0 = MAP_H / 2 | 0, spot = null;
  for (var r = 0; r < 10 && !spot; r++) {
    for (var dy = -r; dy <= r && !spot; dy++) {
      for (var dx = -r; dx <= r && !spot; dx++) {
        if (isWalkable(world, cx0 + dx, cy0 + dy)) spot = { x: cx0 + dx, y: cy0 + dy };
      }
    }
  }
  if (!spot) return;
  var id = pawns.reduce(function (m, p) { return Math.max(m, p.id); }, -1) + 1;
  pawns.push(createPawn(id, { name: '떠돌이' + id }, spot.x, spot.y, rng));
}

// 시뮬을 gameMin 게임분 전진 (chunk 단위로 잘게 — main 티커 내부와 동일 규칙, 기본 1분).
export function run(sim, gameMin, chunk) {
  chunk = chunk || 1;
  var left = gameMin;
  while (left > 0) {
    var dt = Math.min(chunk, left);
    left -= dt;
    stepWorld(sim.world, sim.pawns, dt, sim.ambient, sim.ctx, sim.enemyCbs);
  }
  return sim;
}

// 하루 = DAY_MIN 게임분
export function runDays(sim, days, chunk) { return run(sim, days * DAY_MIN, chunk); }

// 벌목 지시 — 정착민(중심)에서 가까운 트리 최대 n 그루. (플레이어가 근처 나무를 지정하는 상황 재현)
export function designateChop(sim, n) {
  var world = sim.world;
  var cx = MAP_W / 2, cy = MAP_H / 2;
  var trees = [];
  for (var i in world.objects) {
    if (world.objects[i].kind === 'tree' && !world.designations[i]) {
      var ii = +i, x = ii % MAP_W, y = (ii / MAP_W) | 0;
      trees.push({ i: ii, d: Math.abs(x - cx) + Math.abs(y - cy) });
    }
  }
  trees.sort(function (a, b) { return a.d - b.d; });
  var count = Math.min(n, trees.length);
  for (var k = 0; k < count; k++) world.designations[trees[k].i] = 'chop';
  return count;
}

// 재고 지급
export function give(sim, stock) {
  for (var k in stock) sim.world.stock[k] = (sim.world.stock[k] || 0) + stock[k];
}

// 결정론 비교용 스냅샷 — 재현 시 바이트 일치해야 하는 핵심 상태만.
export function snapshot(sim) {
  var w = sim.world;
  return JSON.stringify({
    timeMin: Math.round(w.timeMin * 1000) / 1000,
    day: w.day,
    stock: w.stock,
    enemies: w.enemies.length,
    pawns: sim.pawns.map(function (p) {
      return {
        id: p.id,
        x: p.x, y: p.y,
        px: Math.round(p.px * 1000) / 1000,
        py: Math.round(p.py * 1000) / 1000,
        hp: Math.round(p.hp * 1000) / 1000,
        hunger: Math.round(p.hunger * 1000) / 1000,
        state: p.state,
        job: p.job ? p.job.type : null,
      };
    }),
  });
}

export { MAP_W, MAP_H, DAY_MIN };

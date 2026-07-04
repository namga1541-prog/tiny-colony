// L1 소크 불변식 테스트 (재발버그 가드) — 여러 시드로 장기 진행하며 매 스텝 불변식 위반 감시.
// 탐색에서 발견된 잠재 버그류: 적 hp 무제한, 좌표 범위/NaN 미가드, 예약락 누수(죽은 정착민 락 미해제).
import { bootSim, run, give, designateChop, MAP_W, MAP_H } from './harness.mjs';
import { addBuilding, footprintClear, idx } from '../js/world.js';

// 소크 도중 주기적으로 설계도(bp) 건물을 배치해 배달(deliver)→건설(build) 파이프라인을 장기 실행시킨다.
// (기존 소크는 벌목·채굴·전투만 돌려 건설 락(bp:) 흐름을 전혀 밟지 않았음 — 락 누수는 불변식 ⑥ 이 감시.)
// 통행을 막지 않는 1칸 장식(decoLog, 목재 1)을 써 30일간 벽으로 정착민을 가두지 않는다.
function pendingBlueprints(world) {
  var n = 0;
  for (var id in world.buildings) if (world.buildings[id].stage === 'bp') n++;
  return n;
}
function tryPlaceBlueprint(world) {
  if (pendingBlueprints(world) >= 2) return; // 대기 중 설계도가 쌓이면(=파이프라인 정체) 더 놓지 않음
  var cx = MAP_W / 2 | 0, cy = MAP_H / 2 | 0;
  for (var r = 3; r <= 14; r++) {
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // 링 둘레만
        var x = cx + dx, y = cy + dy;
        if (footprintClear(world, x, y, 1, 1, false)) { addBuilding(world, 'decoLog', x, y); return; }
      }
    }
  }
}

var SEEDS = [1, 42, 777, 12345, 2024, 999999];
var DAYS = 30;
var CHUNK = 5; // 5 게임분 스텝마다 검사

// 하나의 불변식 위반을 찾으면 그 내용을 반환(없으면 null)
function checkInvariants(sim) {
  var w = sim.world;

  // ① 재고 음수/비유한
  for (var k in w.stock) {
    var v = w.stock[k];
    if (!isFinite(v)) return 'stock.' + k + ' 비유한(' + v + ')';
    if (v < 0) return 'stock.' + k + ' 음수(' + v + ')';
  }

  // ②③④ 정착민 hp/hunger 범위, 좌표 범위·NaN
  for (var p = 0; p < sim.pawns.length; p++) {
    var pw = sim.pawns[p];
    if (!isFinite(pw.hp) || pw.hp < 0 || pw.hp > 100) return '정착민#' + pw.id + ' hp 범위밖(' + pw.hp + ')';
    if (!isFinite(pw.hunger) || pw.hunger < -0.001 || pw.hunger > 100.001) return '정착민#' + pw.id + ' hunger 범위밖(' + pw.hunger + ')';
    if (pw.cold !== undefined && (!isFinite(pw.cold) || pw.cold < -0.001 || pw.cold > 100.001)) return '정착민#' + pw.id + ' cold 범위밖(' + pw.cold + ')';
    if (!isFinite(pw.px) || !isFinite(pw.py)) return '정착민#' + pw.id + ' 좌표 NaN(px=' + pw.px + ',py=' + pw.py + ')';
    if (pw.x < 0 || pw.x >= MAP_W || pw.y < 0 || pw.y >= MAP_H) return '정착민#' + pw.id + ' 맵 밖(x=' + pw.x + ',y=' + pw.y + ')';
  }

  // ⑤ 적 hp ≤ maxHp, 비유한 아님
  for (var e = 0; e < w.enemies.length; e++) {
    var en = w.enemies[e];
    if (!isFinite(en.hp)) return '적#' + en.id + ' hp 비유한';
    if (en.hp > en.maxHp + 0.001) return '적#' + en.id + ' hp>maxHp (' + en.hp + '/' + en.maxHp + ')';
  }

  // ⑥ 예약락 누수: 살아있지 않은(없거나 dead) 정착민이 락을 보유하면 누수
  var byId = {};
  for (var q = 0; q < sim.pawns.length; q++) byId[sim.pawns[q].id] = sim.pawns[q];
  for (var key in w.reserved) {
    var owner = byId[w.reserved[key]];
    if (!owner) return '예약락 누수 — 없는 정착민#' + w.reserved[key] + ' 소유 (' + key + ')';
    if (owner.state === 'dead') return '예약락 누수 — 죽은 정착민#' + owner.id + ' 소유 (' + key + ')';
  }

  return null;
}

var fails = 0;
var totalBuilt = 0; // 전 시드 누적: 배달→건설 파이프라인이 실제로 건물을 완공한 횟수(0이면 파이프라인 사망)
for (var s = 0; s < SEEDS.length; s++) {
  var seed = SEEDS[s];
  var sim = bootSim(seed);
  var seedBuilt = 0;
  sim.ctx.onBuildingBuilt = function (b) { if (b.kind === 'decoLog') { seedBuilt++; totalBuilt++; } }; // 완공 관측
  give(sim, { food: 600, meal: 100, wood: 40 }); // 30일 생존용 + 건설 배달용 초기 목재(이후 벌목으로 보충)
  designateChop(sim, 30);
  var totalMin = DAYS * 1440;
  var violation = null;
  var left = totalMin;
  var lastBpDay = 0;
  tryPlaceBlueprint(sim.world); // 시작 직후 1채 배치
  while (left > 0 && !violation) {
    var dt = Math.min(CHUNK, left); left -= dt;
    run(sim, dt, CHUNK);
    if (sim.world.day !== lastBpDay) { lastBpDay = sim.world.day; tryPlaceBlueprint(sim.world); } // 하루 한 번 설계도 배치
    violation = checkInvariants(sim);
  }
  if (violation) {
    console.log('  ✗ 시드 ' + seed + ' — ' + (DAYS - Math.ceil(left / 1440)) + '일차경 위반: ' + violation);
    fails++;
  } else {
    var alive = sim.pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    console.log('  ✓ 시드 ' + seed + ' — ' + DAYS + '일 소크 통과 (생존 ' + alive + '/' + sim.pawns.length +
      ', 습격 ' + sim.counters.pawnKill + '피격/처치' + sim.counters.enemyDown + ', 영입 ' + sim.counters.recruit + ', 완공 ' + seedBuilt + ')');
  }
}

console.log('');
if (fails) { console.log('❌ invariants 위반 ' + fails + '개 시드'); process.exit(1); }
// 배달→건설 파이프라인이 장기 소크에서 실제로 최소 몇 채는 완공해야 함(0이면 파이프라인이 조용히 죽은 것)
if (totalBuilt === 0) { console.log('❌ 배달→건설 파이프라인이 30일 소크 동안 단 한 채도 완공하지 못함(파이프라인 정체/사망 의심)'); process.exit(1); }
console.log('✅ invariants 전체 시드 통과 (' + SEEDS.length + '개 × ' + DAYS + '일, 건설 완공 누적 ' + totalBuilt + '채)');

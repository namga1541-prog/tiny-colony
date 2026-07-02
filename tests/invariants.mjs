// L1 소크 불변식 테스트 (재발버그 가드) — 여러 시드로 장기 진행하며 매 스텝 불변식 위반 감시.
// 탐색에서 발견된 잠재 버그류: 적 hp 무제한, 좌표 범위/NaN 미가드, 예약락 누수(죽은 정착민 락 미해제).
import { bootSim, run, give, designateChop, MAP_W, MAP_H } from './harness.mjs';

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
for (var s = 0; s < SEEDS.length; s++) {
  var seed = SEEDS[s];
  var sim = bootSim(seed);
  give(sim, { food: 600, meal: 100 }); // 30일 생존용 — 살아있는 정착민으로 후반(습격·전투)까지 커버
  designateChop(sim, 30);
  var totalMin = DAYS * 1440;
  var violation = null;
  var left = totalMin;
  while (left > 0 && !violation) {
    var dt = Math.min(CHUNK, left); left -= dt;
    run(sim, dt, CHUNK);
    violation = checkInvariants(sim);
  }
  if (violation) {
    console.log('  ✗ 시드 ' + seed + ' — ' + (DAYS - Math.ceil(left / 1440)) + '일차경 위반: ' + violation);
    fails++;
  } else {
    var alive = sim.pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    console.log('  ✓ 시드 ' + seed + ' — ' + DAYS + '일 소크 통과 (생존 ' + alive + '/' + sim.pawns.length +
      ', 습격 ' + sim.counters.pawnKill + '피격/처치' + sim.counters.enemyDown + ', 영입 ' + sim.counters.recruit + ')');
  }
}

console.log('');
if (fails) { console.log('❌ invariants 위반 ' + fails + '개 시드'); process.exit(1); }
console.log('✅ invariants 전체 시드 통과 (' + SEEDS.length + '개 × ' + DAYS + '일)');

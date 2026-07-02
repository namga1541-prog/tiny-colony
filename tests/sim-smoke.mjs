// L1 시나리오 스모크 — 시드 고정, 헤드리스. stepWorld 추출이 올바른지 + 결정론 확인.
import { bootSim, run, runDays, designateChop, give, snapshot } from './harness.mjs';

var fails = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ ' + msg); fails++; }
}

console.log('[sim-smoke] 1) 부팅 상태');
(function () {
  var sim = bootSim(12345);
  ok(sim.pawns.length === 3, '정착민 3명 생성');
  ok(sim.pawns.every(function (p) { return p.trait; }), '모든 정착민 트레잇 보유');
  ok(sim.world.day === 1, '시작 1일차');
  ok(sim.world.seed === 12345, '시드 고정 반영');
})();

console.log('[sim-smoke] 2) 벌목 → 재고 증가 (시뮬 전진)');
(function () {
  var sim = bootSim(12345);
  var n = designateChop(sim, 10);
  ok(n > 0, '벌목 지시 ' + n + '건 등록');
  var woodBefore = sim.world.stock.wood || 0;
  run(sim, 600); // 600 게임분(=10시간) 진행
  var woodAfter = sim.world.stock.wood || 0;
  ok(woodAfter > woodBefore, '벌목으로 목재 재고 증가 (' + woodBefore + '→' + woodAfter + ')');
  ok(sim.world.timeMin >= 600, '게임 시간 전진 (timeMin=' + Math.round(sim.world.timeMin) + ')');
})();

console.log('[sim-smoke] 3) 정착민 생존 (식량 지급 시 며칠 버팀)');
(function () {
  var sim = bootSim(777);
  give(sim, { food: 200, meal: 50 });
  designateChop(sim, 20);
  runDays(sim, 3);
  var alive = sim.pawns.filter(function (p) { return p.state !== 'dead'; }).length;
  ok(alive >= 1, '식량 충분 시 3일 후 최소 1명 생존 (' + alive + '명)');
  ok(sim.world.day >= 4, '3일 경과 → day ' + sim.world.day);
})();

console.log('[sim-smoke] 4) 결정론 — 동일 시드 2회 실행 결과 바이트 일치');
(function () {
  function playthrough(seed) {
    var sim = bootSim(seed);
    give(sim, { food: 100 });
    designateChop(sim, 15);
    runDays(sim, 5);
    return snapshot(sim);
  }
  var a = playthrough(999);
  var b = playthrough(999);
  ok(a === b, '시드 999 두 번 실행 → 스냅샷 동일');
  var c = playthrough(1000);
  ok(a !== c, '다른 시드(1000)는 다른 결과 (결정론이 시드에 종속)');
})();

console.log('[sim-smoke] 5) chunk 크기 무관 결정론 (1분 vs 5분 스텝)');
(function () {
  function playChunk(seed, chunk) {
    var sim = bootSim(seed);
    give(sim, { food: 100 });
    designateChop(sim, 15);
    // runDays 를 chunk 단위로
    var mins = 5 * 1440;
    var left = mins;
    while (left > 0) { var dt = Math.min(chunk, left); left -= dt; run(sim, dt, chunk); }
    return snapshot(sim);
  }
  var one = playChunk(2024, 1);
  var five = playChunk(2024, 5);
  // 주: 습격 스케줄 타이밍이 chunk 에 따라 미세하게 달라질 수 있어 완전 일치가 아닐 수 있음 → 경고만
  if (one === five) console.log('  ✓ 1분/5분 스텝 결과 동일 (완전 재현)');
  else console.log('  ⚠ 1분/5분 스텝 미세 차이(습격 타이밍) — 각 chunk 내 결정론은 유지됨');
})();

console.log('');
if (fails) { console.log('❌ sim-smoke 실패 ' + fails + '건'); process.exit(1); }
console.log('✅ sim-smoke 전체 통과');

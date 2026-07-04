// 목표(도전 과제) — 달성 시 world.goals[id]=true, 이벤트 알림
import { totalRes } from './world.js';
import { RESEARCH } from './config.js';

function relicCount(world) {
  var n = 0;
  for (var id in (world.relics || {})) n += world.relics[id];
  return n;
}

function alivePawns(pawns) {
  var n = 0;
  for (var i = 0; i < pawns.length; i++) if (pawns[i].state !== 'dead') n++;
  return n;
}

function countBuilt(world, kind) {
  var n = 0;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind === kind && b.stage === 'built' && !b.natural) n++;
  }
  return n;
}

export var GOALS = [
  { id: 'house', name: '보금자리', desc: '집을 1채 짓는다', test: function (w) { return countBuilt(w, 'house') >= 1; } },
  { id: 'pop5', name: '번성하는 마을', desc: '정착민 5명을 모은다', test: function (w, p) { return alivePawns(p) >= 5; } },
  { id: 'armed', name: '무장', desc: '무기를 든 정착민을 2명 이상 둔다',
    test: function (w, p) { var c = 0; for (var i = 0; i < p.length; i++) if (p[i].equipped) c++; return c >= 2; } },
  { id: 'raid', name: '첫 격퇴', desc: '고블린 습격을 한 번 막아낸다', test: function (w) { return !!w.raidCleared; } },
  { id: 'iron', name: '제철', desc: '철 20을 비축한다', test: function (w) { return totalRes(w).iron >= 20; } },
  { id: 'castle', name: '왕국의 위용', desc: '성을 완공한다', test: function (w) { return countBuilt(w, 'castle') >= 1; } },
  { id: 'invasion', name: '나라의 시련', desc: '대침공을 완전히 격퇴한다', test: function (w) { return !!w.invasionWon; } },
  { id: 'escape', name: '탈출 성공', desc: '탈출선(선체·엔진·반응로)을 완성하고 발사한다', test: function (w) { return !!w.escaped; } },
  { id: 'gate', name: '출입 통제', desc: '성문을 1개 완공한다', test: function (w) { return countBuilt(w, 'fenceGate') >= 1; } },
  { id: 'feast', name: '기적의 만찬', desc: '찬란한 음식을 1회 섭취한다', test: function (w) { return !!w.ateGloriousFood; } },
  { id: 'abyss', name: '심해의 전설', desc: '초특급 희귀어종을 1회 포획한다', test: function (w) { return !!w.caughtSpotOnlyFish; } },
  { id: 'islands', name: '미지의 발견', desc: '원정 섬 4곳을 모두 발견한다',
    test: function (w) { return w.islands && w.islands.length > 0 && w.islands.every(function (isl) { return isl.discovered; }); } },
  { id: 'boss', name: '파괴자를 쓰러뜨리다', desc: '최종 보스 「악마후배」를 처치한다', test: function (w) { return !!w.bossDefeated; } },
  { id: 'research', name: '지혜의 정점', desc: '모든 연구를 완료한다',
    test: function (w) { return Object.keys(RESEARCH).every(function (k) { return w.research.unlocked[k]; }); } },
  { id: 'wool', name: '포근한 양모', desc: '양털 30을 비축한다', test: function (w) { return totalRes(w).wool >= 30; } },
  { id: 'pavilion', name: '화목한 마을', desc: '정자를 1개 완공한다', test: function (w) { return countBuilt(w, 'pavilion') >= 1; } },
  { id: 'richColony', name: '부유한 콜로니', desc: '금 500을 비축한다', test: function (w) { return totalRes(w).gold >= 500; } },
  { id: 'pop10', name: '대번영', desc: '정착민 10명을 모은다', test: function (w, p) { return alivePawns(p) >= 10; } },
  { id: 'goddess', name: '여신의 축복', desc: '아보랑카도의 강림을 목격한다', test: function (w) { return !!w.goddessVisited; } },
  { id: 'relics', name: '유물 수집가', desc: '유물을 5개 이상 모은다', test: function (w) { return relicCount(w) >= 5; } },
  { id: 'steel', name: '강철의 시대', desc: '강철 무기를 1개 이상 만든다',
    test: function (w) { var r = totalRes(w); return (r.ironSword || 0) + (r.ironBow || 0) >= 1; } },
  { id: 'outfitter', name: '금 쓸 곳이 생겼다', desc: '장비 상점을 1개 완공한다', test: function (w) { return countBuilt(w, 'outfitter') >= 1; } },
  { id: 'library', name: '학구열', desc: '도서관을 1개 완공한다', test: function (w) { return countBuilt(w, 'library') >= 1; } },
  { id: 'tavern', name: '흥겨운 잔치', desc: '여관에서 축제를 1회 개최한다', test: function (w) { return (w.feastCount || 0) >= 1; } },
];

// 새로 달성된 목표 배열 반환 (알림용)
export function checkGoals(world, pawns) {
  var newly = [];
  for (var i = 0; i < GOALS.length; i++) {
    var g = GOALS[i];
    if (world.goals[g.id]) continue;
    if (g.test(world, pawns)) {
      world.goals[g.id] = true;
      newly.push(g);
    }
  }
  return newly;
}

// 목표(도전 과제) — 달성 시 world.goals[id]=true, 이벤트 알림
import { totalRes } from './world.js';

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

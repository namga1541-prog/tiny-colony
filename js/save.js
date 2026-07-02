// localStorage 저장/불러오기 (v3)
var KEY = 'tinyColony.save1';

export function saveGame(world, pawns) {
  var data = {
    v: 3,
    seed: world.seed,
    terrain: Array.from(world.terrain),
    objects: world.objects,
    buildings: world.buildings,
    occupancy: world.occupancy,
    nextBid: world.nextBid,
    items: world.items,
    stockpile: world.stockpile,
    designations: world.designations,
    mineDesig: world.mineDesig,
    sheep: world.sheep,
    timeMin: world.timeMin,
    day: world.day,
    pawns: pawns.map(function (p) {
      return {
        id: p.id, name: p.name, color: p.color,
        x: p.x, y: p.y,
        hunger: p.hunger, energy: p.energy, hp: p.hp,
        dead: p.state === 'dead',
        carry: p.carry,
      };
    }),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSaveData() {
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || data.v !== 3) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return localStorage.getItem(KEY) !== null;
}

export function clearSave() {
  localStorage.removeItem(KEY);
}

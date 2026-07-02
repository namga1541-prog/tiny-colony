// localStorage 저장/불러오기 (v6)
var KEY = 'tinyColony.save1';

export function saveGame(world, pawns) {
  var data = {
    v: 6,
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
    nextSid: world.nextSid,
    timeMin: world.timeMin,
    day: world.day,
    research: world.research,
    farmZone: world.farmZone,
    crops: world.crops,
    craftQueue: world.craftQueue,
    enemies: world.enemies,
    nextEid: world.nextEid,
    goals: world.goals,
    nextRaidDay: world.nextRaidDay,
    raidCleared: world.raidCleared,
    pawns: pawns.map(function (p) {
      return {
        id: p.id, name: p.name, look: p.look, trait: p.trait, equipped: p.equipped,
        x: p.x, y: p.y,
        hunger: p.hunger, hp: p.hp, mood: p.mood,
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
    if (!data || data.v !== 6) return null;
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

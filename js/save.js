// localStorage 저장/불러오기 (v12)
var KEY = 'tinyColony.save1';

export function saveGame(world, pawns) {
  var data = {
    v: 15,
    seed: world.seed,
    rank: world.rank,
    relics: world.relics,
    dug: world.dug,
    terrain: Array.from(world.terrain),
    objects: world.objects,
    buildings: world.buildings,
    occupancy: world.occupancy,
    nextBid: world.nextBid,
    stock: world.stock,
    rodTier: world.rodTier,
    fishDesig: world.fishDesig,
    stockpile: world.stockpile,
    designations: world.designations,
    mineDesig: world.mineDesig,
    sheep: world.sheep,
    nextSid: world.nextSid,
    timeMin: world.timeMin,
    day: world.day,
    research: world.research,
    upgrades: world.upgrades,
    farmZone: world.farmZone,
    orchardZone: world.orchardZone,
    crops: world.crops,
    goddessVisited: world.goddessVisited,
    traderActive: world.traderActive,
    traderDepartDay: world.traderDepartDay,
    nextTraderDay: world.nextTraderDay,
    escaped: world.escaped,
    autoEquip: world.autoEquip,
    bossDefeated: world.bossDefeated,
    ateGloriousFood: world.ateGloriousFood,
    caughtSpotOnlyFish: world.caughtSpotOnlyFish,
    craftQueue: world.craftQueue,
    enemies: world.enemies,
    nextEid: world.nextEid,
    goals: world.goals,
    nextRaidDay: world.nextRaidDay,
    raidCleared: world.raidCleared,
    invasion: world.invasion,
    invasionWon: world.invasionWon,
    invasionsCompleted: world.invasionsCompleted,
    pawns: pawns.map(function (p) {
      return {
        id: p.id, name: p.name, look: p.look, trait: p.trait, equipped: p.equipped, armor: p.armor, skills: p.skills, role: p.role,
        x: p.x, y: p.y,
        hunger: p.hunger, hp: p.hp, maxHp: p.maxHp, mood: p.mood,
        dead: p.state === 'dead',
        carry: p.carry,
        injury: p.injury,
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
    if (!data || data.v !== 15) return null;
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

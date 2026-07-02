// 게임 전역 상수 + 타일시트 매핑
// 시트: 12열 x 11행, 타일 16px. 인덱스 = row*12 + col (tiles.html 로 검증)

export const TILE = 16;          // 원본 타일 픽셀
export const MAP_W = 64;
export const MAP_H = 64;

export const SHEET = {
  town: 'assets/town/Tilemap/tilemap_packed.png',
  dungeon: 'assets/dungeon/Tilemap/tilemap_packed.png',
};

// [시트, 인덱스]
export const SPR = {
  // 지형
  grass:       ['town', 0],
  grassDecor:  ['town', 1],
  grassFlower: ['town', 2],
  dirt:        ['town', 40],
  dirtDecor:   ['town', 42],

  // 자연물
  treeGreen:  ['town', 28],
  treeOrange: ['town', 27],
  rock:       ['town', 43],
  mushroom:   ['town', 29],
  sprout:     ['town', 17],

  // 건축물
  woodWall:  ['town', 72],
  stoneWall: ['town', 77],
  floor:     ['dungeon', 48],
  bed:       ['town', 131],

  // 아이템
  itemWood:  ['town', 82],
  itemStone: ['dungeon', 65],
  itemFood:  ['town', 29],

  // 정착민 / 유령
  pawn0: ['dungeon', 85],
  pawn1: ['dungeon', 99],
  pawn2: ['dungeon', 98],
  ghost: ['dungeon', 121],
};

// 건설 정의
export const BUILDS = {
  woodWall:  { name: '나무 벽',  cost: { wood: 2 },  work: 25, solid: true },
  stoneWall: { name: '돌 벽',    cost: { stone: 2 }, work: 35, solid: true },
  floor:     { name: '바닥',     cost: { wood: 1 },  work: 10, solid: false },
  bed:       { name: '침대',     cost: { wood: 8 },  work: 40, solid: false },
};

// 자연물 정의
export const NATURE = {
  tree:     { work: 20, drops: { wood: 3 } },
  rock:     { work: 30, drops: { stone: 3 } },
  mushroom: { work: 8,  drops: { food: 1 } },
};

// 시간: 1초(현실, 1배속) = 6 게임분. 하루 1440분 = 4분(현실).
export const MIN_PER_SEC = 6;
export const DAY_MIN = 1440;
export const SPEED_MULT = [0, 1, 2.5, 5];

// 정착민 욕구 상수 (분당 변화량)
export const NEEDS = {
  hungerDecay: 100 / DAY_MIN,          // 하루에 포만감 100 소모
  energyDecay: 100 / 960,              // 깨어있는 16시간에 기력 100 소모
  sleepRestoreBed: 100 / 420,          // 침대 수면 7시간에 완충
  sleepRestoreGround: 100 / 700,       // 맨바닥 수면은 느림
  starveHpDecay: 100 / 720,            // 굶주림 12시간이면 사망
  hpRegen: 100 / 2880,                 // 배부르면 이틀에 걸쳐 회복
  eatAmount: 55,                       // 식량 1개당 포만감
  hungryAt: 30,
  sleepyAt: 25,
};

export const WALK_MIN_PER_TILE = 1;    // 1타일 이동 = 1 게임분
export const STACK_MAX = 50;           // 타일당 아이템 최대 적재
export const PAWN_DEFS = [
  { name: '단비', spr: 'pawn1' },
  { name: '산',   spr: 'pawn0' },
  { name: '호두', spr: 'pawn2' },
];

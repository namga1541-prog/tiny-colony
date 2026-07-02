// 게임 전역 상수 + 타일시트 매핑
// rpg 시트: 57열 x 31행, 타일 16px + 간격 1px (picker.html 로 검증)
// town/dungeon 시트: 12열 x 11행, 간격 0

export const TILE = 16;          // 원본 타일 픽셀
export const MAP_W = 64;
export const MAP_H = 64;

export const SHEET = {
  town:    { url: 'assets/town/Tilemap/tilemap_packed.png', cols: 12, sp: 0 },
  dungeon: { url: 'assets/dungeon/Tilemap/tilemap_packed.png', cols: 12, sp: 0 },
  rpg:     { url: 'assets/rpg/roguelikeSheet_transparent.png', cols: 57, sp: 1 },
};

// [시트, 인덱스]
export const SPR = {
  // 지형 (Kenney Roguelike/RPG)
  grass:       ['rpg', 5],
  grassDecor:  ['rpg', 855],
  flowerRed:   ['rpg', 342],
  flowerWhite: ['rpg', 513],
  flowerBlue:  ['rpg', 684],
  dirt:        ['rpg', 6],
  dirtDecor:   ['rpg', 63],
  water:       ['rpg', 57],

  // 자연물
  treeGreen:  ['rpg', 583],
  treeOrange: ['rpg', 584],
  pine:       ['rpg', 586],
  rock:       ['rpg', 1251],
  berry:      ['rpg', 537],

  // 건축물
  woodWall:  ['town', 72],
  stoneWall: ['town', 77],
  floor:     ['dungeon', 48],
  bed:       ['rpg', 127],

  // 아이템
  itemWood:  ['town', 82],
  itemStone: ['dungeon', 65],
  itemFood:  ['rpg', 537],
};

// 물 가장자리(호숫가) 전환 타일 — 물 타일 위치에서 이웃 육지 방향에 따라 선택
export const SHORE = {
  TL: ['rpg', 2],  T: ['rpg', 3],   TR: ['rpg', 4],
  L:  ['rpg', 59], C: ['rpg', 60],  R:  ['rpg', 61],
  BL: ['rpg', 116], B: ['rpg', 117], BR: ['rpg', 118],
};

// Ninja Adventure 캐릭터 (assets/ninja/<이름>/Walk.png 4방향x4프레임, Idle.png 4방향x1)
// 방향 열 순서: 0=하, 1=상, 2=좌, 3=우
export const GHOST_CHAR = 'Spirit';

// 건설 정의
export const BUILDS = {
  woodWall:  { name: '나무 벽',  cost: { wood: 2 },  work: 25, solid: true },
  stoneWall: { name: '돌 벽',    cost: { stone: 2 }, work: 35, solid: true },
  floor:     { name: '바닥',     cost: { wood: 1 },  work: 10, solid: false },
  bed:       { name: '침대',     cost: { wood: 8 },  work: 40, solid: false },
};

// 자연물 정의
export const NATURE = {
  tree:  { work: 20, drops: { wood: 3 } },
  rock:  { work: 30, drops: { stone: 3 } },
  berry: { work: 8,  drops: { food: 1 } },
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
  { name: '단비', char: 'Woman' },
  { name: '산',   char: 'Boy' },
  { name: '호두', char: 'Villager' },
];

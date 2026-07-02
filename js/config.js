// v0.3 (Tiny Swords) — 전역 상수·에셋 정의
// 아트 그리드 64px. 유닛·나무 스프라이트는 192px (시각적으로 1타일 점유 + 오버행)

export const TILE = 64;
export const MAP_W = 64;
export const MAP_H = 64;

export const TS = 'assets/ts/';

// 지형 코드
export const T_WATER = 0, T_GRASS = 1, T_SAND = 2;

// 건설 정의 — 완성형 건물 (fw/fh = 점유 타일 풋프린트)
export const BUILDS = {
  house: {
    name: '집', cost: { wood: 10 }, work: 60,
    fw: 2, fh: 2, solid: true, sleeps: 2,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
  },
  tower: {
    name: '망루', cost: { wood: 15, gold: 5 }, work: 80,
    fw: 2, fh: 2, solid: true,
    img: 'Tower', imgC: 'Tower_C', pw: 128, ph: 256,
  },
  castle: {
    name: '성', cost: { wood: 30, gold: 10 }, work: 150,
    fw: 5, fh: 3, solid: true,
    img: 'Castle', imgC: 'Castle_C', pw: 320, ph: 256,
  },
  campfire: {
    name: '모닥불', cost: { wood: 2 }, work: 10,
    fw: 1, fh: 1, solid: false, light: true,
    img: null, pw: 128, ph: 128, // Fire 애니메이션으로 렌더
  },
};

// 자연물 (단일 타일)
export const NATURE = {
  tree:     { work: 20, drops: { wood: 3 } },
  mushroom: { work: 8,  drops: { food: 1 } },
};

// 금광 (3x2 풋프린트 자연 구조물)
export const GOLDMINE = { fw: 3, fh: 2, work: 15, dropsPerCycle: 2, charges: 24 };

// 시간
export const MIN_PER_SEC = 6;
export const DAY_MIN = 1440;
export const SPEED_MULT = [0, 1, 2.5, 5];

// 욕구 (분당)
export const NEEDS = {
  hungerDecay: 100 / DAY_MIN,
  energyDecay: 100 / 960,
  sleepRestoreBed: 100 / 420,      // 집에서 수면
  sleepRestoreGround: 100 / 700,   // 맨바닥
  starveHpDecay: 100 / 720,
  hpRegen: 100 / 2880,
  eatAmount: 55,
  hungryAt: 30,
  sleepyAt: 25,
};

export const WALK_MIN_PER_TILE = 1;
export const STACK_MAX = 50;

// 정착민 (Pawn 색상 시트)
export const PAWN_DEFS = [
  { name: '단비', color: 'Blue' },
  { name: '산',   color: 'Red' },
  { name: '호두', color: 'Yellow' },
];
export const PAWN_SHEET_ROWS = { idle: 0, walk: 1, hammer: 2, axe: 3, carryIdle: 4, carryWalk: 5 };

// 카메라 (넓게 보기)
export const ZOOM_DEFAULT = 0.62;
export const ZOOM_MIN = 0.34;   // 최소 줌이면 맵 전체가 한눈에
export const ZOOM_MAX = 1.7;

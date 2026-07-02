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
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
  },
  warehouse: {
    name: '창고', cost: { wood: 12 }, work: 55,
    fw: 2, fh: 2, solid: true, autoStockRing: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192, tint: 0xe0c088,
  },
  tower: {
    name: '망루', cost: { wood: 15, gold: 5 }, work: 80,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'Tower', imgC: 'Tower_C', pw: 128, ph: 256,
  },
  outpost: {
    name: '초소', cost: { wood: 8 }, work: 40,
    fw: 2, fh: 2, solid: true,
    img: 'Tower', imgC: 'Tower_C', pw: 128, ph: 256, tint: 0x8fdc9e,
  },
  castle: {
    name: '성', cost: { wood: 30, gold: 10 }, work: 150,
    fw: 5, fh: 3, solid: true, light: true,
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

// ── 연구: 정착민 수에 비례해 자동 누적, 포인트로 기술 해금 ──
export const RESEARCH_RATE_PER_PAWN = 100 / (6 * 60); // 정착민 1명당 6시간에 100점
export const RESEARCH = {
  farming:    { name: '농업', cost: 60,  desc: '농사 구역을 지정해 밀을 재배할 수 있습니다' },
  blacksmith: { name: '대장간 기술', cost: 90, desc: '검·활을 제작할 수 있습니다' },
};

// ── 농사 ──
export const CROP = { plantWork: 12, growTime: 380, harvestWork: 10, yield: 3 };

// ── 대장간 (건물 불필요 — 지은 집에서 제작) ──
export const WEAPONS = {
  sword: { name: '검', cost: { wood: 4, gold: 3 }, work: 40, equip: 'warrior' },
  bow:   { name: '활', cost: { wood: 3, gold: 4 }, work: 40, equip: 'archer' },
};

// ── 정착민 특성 (생성 시 1개 무작위 배정) ──
export const TRAITS = [
  { id: 'hardy',    name: '억척',   desc: '작업 속도 +20%',       workMult: 1.2 },
  { id: 'lazy',     name: '게으름', desc: '작업 속도 -20%',       workMult: 0.8 },
  { id: 'glutton',  name: '대식가', desc: '포만감이 30% 빨리 줆', hungerMult: 1.3 },
  { id: 'optimist', name: '낙천적', desc: '기분이 잘 떨어지지 않음', moodMult: 0.55 },
  { id: 'tough',    name: '강골',   desc: '체력 회복 +50%',       hpRegenMult: 1.5 },
  { id: 'none',     name: '평범',   desc: '특이사항 없음' },
];

// 시간
export const MIN_PER_SEC = 6;
export const DAY_MIN = 1440;
export const SPEED_MULT = [0, 1, 2.5, 5];

// 욕구 (분당) — 수면/기력 시스템 폐지 (2026-07-02): 정착민은 밤낮 없이 계속 활동
export const NEEDS = {
  hungerDecay: 100 / DAY_MIN,
  starveHpDecay: 100 / 720,
  hpRegen: 100 / 2880,
  eatAmount: 55,
  hungryAt: 30,
};

export const WALK_MIN_PER_TILE = 1;
export const STACK_MAX = 50;

// 정착민 외형: 직업(실루엣) 3종 x 색상 4종 = 12종
// rows: 포즈 → 시트 행 (전사·궁수는 작업/운반 포즈가 없어 공격/이동 행으로 대체)
export const UNITS = {
  pawn:    { label: '일꾼', sheet: 'Pawn_',    rows: { idle: 0, walk: 1, hammer: 2, axe: 3, carryIdle: 4, carryWalk: 5 } },
  warrior: { label: '전사', sheet: 'Warrior_', rows: { idle: 0, walk: 1, hammer: 2, axe: 2, carryIdle: 0, carryWalk: 1 } },
  archer:  { label: '궁수', sheet: 'Archer_',  rows: { idle: 0, walk: 1, hammer: 3, axe: 3, carryIdle: 0, carryWalk: 1 } },
};
export const COLORS = ['Blue', 'Red', 'Yellow', 'Purple'];

export const PAWN_DEFS = [
  { name: '단비', look: { unit: 'pawn', color: 'Blue' } },
  { name: '산',   look: { unit: 'pawn', color: 'Red' } },
  { name: '호두', look: { unit: 'pawn', color: 'Yellow' } },
];

// 카메라 (넓게 보기)
export const ZOOM_DEFAULT = 0.62;
export const ZOOM_MIN = 0.34;   // 최소 줌이면 맵 전체가 한눈에
export const ZOOM_MAX = 1.7;

// v0.3 (Tiny Swords) — 전역 상수·에셋 정의
// 아트 그리드 64px. 유닛·나무 스프라이트는 192px (시각적으로 1타일 점유 + 오버행)

export const TILE = 64;
export const MAP_W = 96;
export const MAP_H = 96;

export const TS = 'assets/ts/';

// 지형 코드
export const T_WATER = 0, T_GRASS = 1, T_SAND = 2;

// 건설 정의 — 완성형 건물 (fw/fh = 점유 타일 풋프린트)
export const BUILDS = {
  house: {
    name: '집', cost: { wood: 10 }, work: 60,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, // Tiny Town 회색지붕 집
    desc: '정착촌의 기본 건물입니다.',
  },
  smithy: {
    name: '대장간', cost: { wood: 12, gold: 4 }, work: 70,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, tint: 0x8f96a8, // 회색집 + 강철색조(대장간)
    craftHere: true, // 이 건물에서 무기 제작
    desc: '검·활 등 무기를 제작하는 곳입니다. 제작 주문은 대장간에서 처리됩니다.',
  },
  warehouse: {
    name: '창고', cost: { wood: 12 }, work: 55,
    fw: 2, fh: 2, solid: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 64, sy: 64, sw: 64, sh: 64 }, // Tiny Town 빨간지붕 석조집
    desc: '저장 용량을 크게 늘립니다.',
  },
  tower: {
    name: '망루', cost: { wood: 15, gold: 5 }, work: 80,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'Tower', imgC: 'Tower_C', pw: 128, ph: 256,
    town: { sx: 128, sy: 48, sw: 48, sh: 48 }, // 목책 요새(방어)
    attack: { power: 10, range: 6, cd: 14 }, // 적 자동 공격
    desc: '사거리 안의 고블린을 자동으로 공격합니다. 밤을 밝힙니다.',
  },
  outpost: {
    name: '초소', cost: { wood: 8 }, work: 40,
    fw: 2, fh: 2, solid: true,
    img: 'Tower', imgC: 'Tower_C', pw: 128, ph: 256,
    town: { sx: 128, sy: 48, sw: 48, sh: 48 }, tint: 0xcbb088, // 목책 + 밝은 색조(초소)
    attack: { power: 5, range: 4, cd: 20 },
    desc: '저렴한 방어 초소. 가까운 적을 약하게 공격합니다.',
  },
  castle: {
    name: '성', cost: { wood: 30, gold: 10 }, work: 150,
    fw: 5, fh: 3, solid: true, light: true,
    img: 'Castle', imgC: 'Castle_C', pw: 320, ph: 256,
    town: { sx: 0, sy: 128, sw: 80, sh: 48 }, // Tiny Town 석조 성문
    attack: { power: 18, range: 8, cd: 10 },
    desc: '콜로니의 심장. 넓은 사거리로 강력하게 방어합니다.',
  },
  campfire: {
    name: '모닥불', cost: { wood: 2 }, work: 10,
    fw: 1, fh: 1, solid: false, light: true,
    img: null, pw: 128, ph: 128, // Fire 애니메이션으로 렌더
    desc: '밤을 밝힙니다.',
  },
  ranch: {
    name: '목장', cost: { wood: 14 }, work: 60,
    fw: 2, fh: 2, solid: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 64, sy: 64, sw: 64, sh: 64 }, tint: 0xa8e08a, // 빨강집 + 초록조(목장)
    desc: '주기적으로 식량을 생산하고 가축(양·돼지·소·닭)을 번식시킵니다.',
  },
  clinic: {
    name: '치료소', cost: { wood: 10, gold: 3 }, work: 60,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, tint: 0xffb3c2, // 회색집 + 분홍조(치료소)
    desc: '부상당한 정착민이 찾아와 빠르게 회복합니다.',
  },
};

// ── 저장고 용량 (2): 기본 + 창고당 증가. 초과분은 저장 불가(폐기) ──
export const STORAGE = { base: 120, perWarehouse: 180 };

// ── 창고 업그레이드 단계: 인덱스 0 = 1단계(건설 시 기본), cap 은 STORAGE.perWarehouse 대신 사용 ──
export const WAREHOUSE_TIERS = [
  { cap: 180, cost: null },                          // 1단계: 건설 비용에 포함, 추가 비용 없음
  { cap: 320, cost: { wood: 20, gold: 8 } },          // 2단계
  { cap: 500, cost: { wood: 35, gold: 18 } },         // 3단계
];

// ── 목장 (5): 지어두면 주기적으로 식량 산출 + 양 번식 ──
export const RANCH = { interval: 200, food: 4, breedChance: 0.2, maxSheep: 12 };

// ── 치료소 (6): 부상 정착민이 와서 빠르게 회복 ──
export const CLINIC = { hurtAt: 55, healedAt: 92, restRegen: 100 / 200 };

// ── 정착민 심화 (RimWorld): 다운(쓰러짐) + 멘탈 붕괴 ──
// hp 0 = 즉사 아님 → downed. 안전+식량 있으면 회복, 방치 시 사망.
export const DOWNED = {
  reviveHp: 30,               // 이 hp 이상 회복하면 다시 일어남
  regen: 100 / 1200,          // 안전 시 분당 회복
  clinicRegen: 100 / 300,     // 치료소 있으면 더 빠름
  starveGraceMin: 300,        // 굶주린 채 이만큼 다운되면 사망
  combatGraceMin: 180,        // 전투 지속 중 이만큼 방치되면 출혈사
};
// 기분이 임계 미만으로 지속되면 멘탈 붕괴(일 놓고 정지) → 회복
export const BREAK = { moodAt: 18, sustainMin: 120, durationMin: 240, recoverMood: 42 };

// ── 정착민 스킬 (4): 활동으로 숙련도 상승 → 작업 속도↑ ──
export const SKILL_LABEL = {
  woodcutting: '벌목', mining: '채광', construction: '건축', farming: '농사', combat: '전투', fishing: '낚시',
};
export function skillLevel(xp) { return Math.min(10, Math.floor((xp || 0) / 100)); }
export function skillMult(xp) { return 1 + skillLevel(xp) * 0.06; } // 레벨당 +6%, 만렙 +60%

// 자연물 (단일 타일)
export const NATURE = {
  tree:     { work: 20, drops: { wood: 3 } },
  mushroom: { work: 8,  drops: { food: 1 } },
};

// 금광 (3x2 풋프린트 자연 구조물). regenPerDay: 매일 매장량 회복(재생)
export const GOLDMINE = { fw: 3, fh: 2, work: 15, dropsPerCycle: 2, charges: 24, regenPerDay: 6 };

// ── 자원 재생 (맵 고갈 방지) ──
export const REGROW = {
  treeCap: 300,          // 섬 전체 나무 상한 (96x96 맵)
  stumpToTreeChance: 0.35, // 매일 아침 그루터기가 다시 나무로 자랄 확률
  newSaplingsPerDay: 6,  // 매일 빈 잔디에 새로 돋는 나무 수
};

// ── 연구: 정착민 수에 비례해 자동 누적, 포인트로 기술 해금 ──
export const RESEARCH_RATE_PER_PAWN = 100 / (6 * 60); // 정착민 1명당 6시간에 100점
export const RESEARCH = {
  farming:    { name: '농업', cost: 60,  desc: '농사 구역을 지정해 밀을 재배할 수 있습니다' },
  blacksmith: { name: '대장간 기술', cost: 90, desc: '검·활을 제작할 수 있습니다' },
  steel:      { name: '제철 기술', cost: 160, desc: '철광을 채굴하고 강철검·강철활을 제작할 수 있습니다' },
};

// ── 콜로니 업그레이드 트리 (자원 소비형 영구 강화) ──
// RESEARCH(포인트로 기술 해금)와 별개. 잉여 자원 소비처 + 장기 성장 목표.
// effect.key 를 world.upgradeMult/upgradeAdd 가 합산해 게임 로직에 라이브 적용.
// 참고: RimWorld 연구 · Frostpunk 기술트리 · Civilization 트리.
export const UPGRADE_CATS = {
  production: '⚙️ 생산', logistics: '📦 물류', defense: '🛡️ 방어', population: '👥 인구',
};
export const UPGRADES = {
  // 생산 — 작업 속도 (pawns 작업 틱에 곱)
  prod_wood: { name: '날카로운 도끼', cat: 'production', cost: { wood: 80 },
    effect: { key: 'speed_woodcutting', mult: 1.3 }, desc: '벌목 속도 +30%' },
  prod_mine: { name: '강화 곡괭이', cat: 'production', cost: { wood: 60, gold: 30 },
    effect: { key: 'speed_mining', mult: 1.3 }, desc: '채굴 속도 +30%' },
  prod_farm: { name: '개량 농기구', cat: 'production', cost: { wood: 80 },
    effect: { key: 'speed_farming', mult: 1.3 }, desc: '농사·수확 속도 +30%' },
  prod_all: { name: '작업 반장', cat: 'production', cost: { wood: 300, gold: 120 }, requires: ['prod_wood', 'prod_mine'],
    effect: { key: 'speed_all', mult: 1.2 }, desc: '모든 작업 속도 +20% (누적)' },
  // 물류 — 저장 용량 (storageCap 에 합산)
  log_store1: { name: '비축 확장 I', cat: 'logistics', cost: { wood: 120 },
    effect: { key: 'storage', add: 250 }, desc: '저장 용량 +250' },
  log_store2: { name: '비축 확장 II', cat: 'logistics', cost: { wood: 300, gold: 60 }, requires: ['log_store1'],
    effect: { key: 'storage', add: 500 }, desc: '저장 용량 +500' },
  // 방어 — 방어건물 강화 (tickTowers)
  def_power1: { name: '단조 화살촉', cat: 'defense', cost: { wood: 100, gold: 50 },
    effect: { key: 'towerpower', mult: 1.4 }, desc: '방어건물 공격력 +40%' },
  def_range1: { name: '망원 조준경', cat: 'defense', cost: { gold: 120, iron: 20 }, requires: ['def_power1'],
    effect: { key: 'towerrange', add: 2 }, desc: '방어건물 사거리 +2' },
  def_power2: { name: '강철 탄두', cat: 'defense', cost: { gold: 200, iron: 40 }, requires: ['def_power1'],
    effect: { key: 'towerpower', mult: 1.5 }, desc: '방어건물 공격력 +50% (누적)' },
  // 인구 — 상한·치료
  pop_max1: { name: '정착 확대 I', cat: 'population', cost: { food: 150, wood: 100 },
    effect: { key: 'maxpop', add: 4 }, desc: '고용 인구 상한 +4' },
  pop_heal1: { name: '의료 지식', cat: 'population', cost: { gold: 60 },
    effect: { key: 'healspeed', mult: 1.6 }, desc: '치료소 회복 속도 +60%' },
  pop_max2: { name: '정착 확대 II', cat: 'population', cost: { food: 400, gold: 100 }, requires: ['pop_max1'],
    effect: { key: 'maxpop', add: 6 }, desc: '고용 인구 상한 +6 (누적)' },
};

// ── 농사 ──
export const CROP = { plantWork: 12, growTime: 380, harvestWork: 10, yield: 3 };

// ── 대장간 (건물 불필요 — 지은 집에서 제작) ──
// power=공격력, range=사거리(타일). iron 계열은 강철 연구 후 해금
export const WEAPONS = {
  sword:     { name: '검',     cost: { wood: 4, gold: 3 },  work: 40, equip: 'warrior', power: 10, range: 1 },
  bow:       { name: '활',     cost: { wood: 3, gold: 4 },  work: 40, equip: 'archer',  power: 8,  range: 5 },
  ironSword: { name: '강철검', cost: { wood: 3, iron: 4 },  work: 60, equip: 'warrior', power: 20, range: 1, iron: true },
  ironBow:   { name: '강철활', cost: { wood: 3, iron: 4 },  work: 60, equip: 'archer',  power: 16, range: 6, iron: true },
};

// ── 전투 ──
export const COMBAT = {
  unarmedPower: 3,     // 맨손 공격력
  attackCd: 12,        // 공격 쿨다운(게임분)
  pawnHp: 100,
};
// 고블린 습격
export const ENEMY = { hp: 45, power: 8, attackCd: 14, moveMinPerTile: 1.4, dropGold: 2 };
export const RAID = { firstDay: 4, intervalDays: 3, baseCount: 2, perDayExtra: 0.4, spawnHour: 20,
  perPop: 0.4, hpPerDay: 1.5, loot: { gold: 4, iron: 2 } };

// ── 요리 (모닥불에서) ──
export const COOK = { work: 15, foodPerMeal: 2, mealEatAmount: 95 };

// ── 사냥 (동물) ── 종류별 식량 산출
export const HUNT = { work: 14 };
export const ANIMALS = {
  sheep:   { label: '양',   food: 4, sheet: 'Sheep_Idle', big: true },
  pig:     { label: '돼지', food: 6, sheet: 'Pig',        big: false },
  cow:     { label: '소',   food: 9, sheet: 'Cow',        big: false },
  chicken: { label: '닭',   food: 2, sheet: 'Chicken',    big: false },
};
export const ANIMAL_TYPES = ['sheep', 'pig', 'cow', 'chicken'];

// ── 고용: 식량을 지불하고 새 정착민 영입 (인원 늘수록 비용↑) ──
export const HIRE = { base: 25, perPawn: 15, maxPop: 12 };
export function hireCost(alivePop) { return HIRE.base + HIRE.perPawn * alivePop; }

// ── 낚시 ──
// rodTier: 0=맨손, 1=나무, 2=강철, 3=황금. 높을수록 희귀 어종 확률↑·시간↓
export const FISHING = { work: 18 };
export const RODS = [
  { id: 'wood',  name: '나무 낚싯대', tier: 1, cost: { wood: 5 } },
  { id: 'iron',  name: '강철 낚싯대', tier: 2, cost: { wood: 3, iron: 3 } },
  { id: 'gold',  name: '황금 낚싯대', tier: 3, cost: { wood: 3, gold: 6 } },
];
// rare: 0 흔함 → 3 전설. weight 는 기본 확률, 낚싯대 등급이 높을수록 rare 가중
export const FISH = [
  { name: '멸치',       food: 2,  gold: 0,  weight: 42, rare: 0 },
  { name: '붕어',       food: 4,  gold: 0,  weight: 30, rare: 0 },
  { name: '농어',       food: 6,  gold: 1,  weight: 16, rare: 1 },
  { name: '연어',       food: 9,  gold: 2,  weight: 9,  rare: 1 },
  { name: '금붕어',     food: 6,  gold: 7,  weight: 3,  rare: 2 },
  { name: '전설의 잉어', food: 15, gold: 28, weight: 0.7, rare: 3 },
];
export function catchFish(rodTier, rng) {
  var total = 0, i, w = [];
  for (i = 0; i < FISH.length; i++) {
    var ww = FISH[i].weight * (1 + (rodTier || 0) * 0.9 * FISH[i].rare);
    w.push(ww); total += ww;
  }
  var r = rng() * total;
  for (i = 0; i < FISH.length; i++) { r -= w[i]; if (r <= 0) return FISH[i]; }
  return FISH[0];
}

// ── 광물: 금광 일부는 철광 (강철 무기 재료) ──
export const IRONMINE = { fw: 3, fh: 2, work: 18, dropsPerCycle: 2, charges: 20, regenPerDay: 5 };

// ── 뗏목/배 (물 위에 띄워 다른 대륙으로 건너감) ──
export const BRIDGE = { name: '뗏목', cost: { wood: 2 }, work: 8 };

// ── 계절 (6일 = 1계절, 24일 = 1년) ──
export const SEASON_DAYS = 6;
export const SEASONS = [
  { name: '봄', tint: null },
  { name: '여름', tint: null },
  { name: '가을', tint: 0xffcc66, tintA: 0.06 },
  { name: '겨울', tint: 0x88aadd, tintA: 0.14, noFarm: true },
];

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

// 정착민 외형: 사람 캐릭터 8종 (Ninja Adventure, CC0, 16px, 4방향)
// look = { human: '<id>' }. 시트: assets/ninja/<dir>/Idle.png(64x16=4방향) · Walk.png(64x64=4방향×4프레임)
// 방향 순서: 0=정면(down) 1=뒤(up) 2=좌 3=우
export const HUMANS = {
  villager:  { label: '농부', dir: 'Villager' },
  villager2: { label: '주민', dir: 'Villager2' },
  woman:     { label: '여인', dir: 'Woman' },
  boy:       { label: '청년', dir: 'Boy' },
  oldman:    { label: '노인', dir: 'OldMan' },
  princess:  { label: '공주', dir: 'Princess' },
  cavegirl:  { label: '들녀', dir: 'Cavegirl' },
  caveman:   { label: '들남', dir: 'Caveman' },
};
export const HUMAN_IDS = Object.keys(HUMANS);
// 고블린(적) 외형 — Goblin.png 7열 5행
export const ENEMY_UNIT = { sheet: 'Goblin', rows: { idle: 0, walk: 1, attack: 2 } };

export const PAWN_DEFS = [
  { name: '단비', look: { human: 'villager' } },
  { name: '산',   look: { human: 'woman' } },
  { name: '호두', look: { human: 'boy' } },
];

// 카메라 (넓게 보기)
export const ZOOM_DEFAULT = 0.62;
export const ZOOM_MIN = 0.34;   // 최소 줌이면 맵 전체가 한눈에
export const ZOOM_MAX = 1.7;

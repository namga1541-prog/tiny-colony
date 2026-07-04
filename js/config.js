// v0.3 (Tiny Swords) — 전역 상수·에셋 정의
// 아트 그리드 64px. 유닛·나무 스프라이트는 192px (시각적으로 1타일 점유 + 오버행)

export const TILE = 64;
export const MAP_W = 128;
export const MAP_H = 128;

export const TS = 'assets/ts/';
export const FANTASY = 'assets/fantasy/';

// 지형 코드
export const T_WATER = 0, T_GRASS = 1, T_SAND = 2;

// 배경 장식 소품(게임 로직 비연동, 순수 시각 요소) — The Fan-tasy Tileset(Free) by Ventilatore
export const DECOR = [
  'Banner_Stick_1_Purple', 'Barrel_Small_Empty', 'Basket_Empty', 'Bench_1', 'Bench_3',
  'BulletinBoard_1', 'Chopped_Tree_1', 'Crate_Large_Empty', 'Crate_Medium_Closed', 'Crate_Water_1',
  'Fireplace_1', 'HayStack_2', 'LampPost_3', 'Plant_2', 'Sack_3', 'Sign_1', 'Sign_2', 'Table_Medium_1',
];
// 24프레임 스프라이트시트(32x32칸) — 0번 프레임만 정지 이미지로 사용
export const DECOR_ANIM = ['Flowers_Red', 'Flowers_White'];

// 폐허 장식(초가집·우물·성문 — 매우 드물게 산포, 게임 로직 비연동)
export const DECOR_RUIN = ['House_Hay_1', 'House_Hay_2', 'House_Hay_3', 'House_Hay_4_Purple', 'Well_Hay_1', 'CityWall_Gate_1'];

// 잔디 텍스처 변형 패치(장식용 12종, Tileset_Ground.png 내 16px 셀 좌표 — 원작 Tiled wangset 타일ID 96-101·108-113)
export const GRASS_DECAL_CELLS = [
  [0, 128], [16, 128], [32, 128], [48, 128], [64, 128], [80, 128],
  [0, 144], [16, 144], [32, 144], [48, 144], [64, 144], [80, 144],
];

// 건설 정의 — 완성형 건물 (fw/fh = 점유 타일 풋프린트)
export const BUILDS = {
  house: {
    name: '집', cost: { wood: 10 }, work: 60, hp: 80,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, tint: 0xe6d2b0, // 회색지붕 집 + 따뜻한 크림색조(집=거주)
    desc: '정착촌의 기본 건물입니다.',
  },
  smithy: {
    name: '대장간', cost: { wood: 12, gold: 4 }, work: 70, hp: 100,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, tint: 0x7f8aa6, // 회색집 + 강철 청회색(대장간)
    craftHere: true, // 이 건물에서 무기 제작
    desc: '검·활 등 무기를 제작하는 곳입니다. 제작 주문은 대장간에서 처리됩니다.',
  },
  warehouse: {
    name: '창고', cost: { wood: 12 }, work: 55, hp: 90,
    fw: 2, fh: 2, solid: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 64, sy: 64, sw: 64, sh: 64 }, tint: 0xd99a4e, // 빨간지붕집 + 나무·호박색조(창고=물류)
    desc: '저장 용량을 크게 늘립니다.',
  },
  tower: {
    name: '망루', cost: { wood: 15, gold: 5 }, work: 80, hp: 160,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'Tower', imgC: 'Tower_C', pw: 128, ph: 256,
    town: { sx: 128, sy: 48, sw: 48, sh: 48 }, // 목책 요새(방어)
    attack: { power: 10, range: 6, cd: 14 }, // 적 자동 공격
    desc: '사거리 안의 고블린을 자동으로 공격합니다. 밤을 밝힙니다.',
  },
  outpost: {
    name: '초소', cost: { wood: 8 }, work: 40, hp: 110,
    fw: 2, fh: 2, solid: true,
    img: 'Tower', imgC: 'Tower_C', pw: 128, ph: 256,
    town: { sx: 128, sy: 48, sw: 48, sh: 48 }, tint: 0xcbb088, // 목책 + 밝은 색조(초소)
    attack: { power: 5, range: 4, cd: 20 },
    desc: '저렴한 방어 초소. 가까운 적을 약하게 공격합니다.',
  },
  castle: {
    name: '성', cost: { wood: 30, gold: 10 }, work: 150, hp: 260,
    fw: 5, fh: 3, solid: true, light: true,
    img: 'Castle', imgC: 'Castle_C', pw: 320, ph: 256,
    town: { sx: 0, sy: 128, sw: 80, sh: 48 }, // Tiny Town 석조 성문
    attack: { power: 18, range: 8, cd: 10 },
    desc: '콜로니의 심장. 넓은 사거리로 강력하게 방어합니다.',
  },
  // ── 탈출선(엔드게임 메가프로젝트): 나라 단계 + 대침공 완전 격퇴 후에만 건설 가능(main.js 게이트).
  // 3부품(선체·엔진·반응로) 모두 완공되면 탈출 성공(sim.js). 카스텔 스프라이트 재사용 + 다른 색조로 구분.
  shipHull: {
    name: '탈출선 - 선체', cost: { wood: 400, gold: 150, iron: 100 }, work: 900, hp: 300,
    fw: 5, fh: 3, solid: true, light: true,
    img: 'Castle', imgC: 'Castle_C', pw: 320, ph: 256, tint: 0xaab8c4, // 은회색 금속 선체
    escapePart: true,
    desc: '탈출선의 뼈대. 대규모 목재·금·철이 필요합니다.',
  },
  shipEngine: {
    name: '탈출선 - 엔진', cost: { iron: 250, gold: 150 }, work: 700, hp: 300,
    fw: 5, fh: 3, solid: true, light: true,
    img: 'Castle', imgC: 'Castle_C', pw: 320, ph: 256, tint: 0xe0925a, // 주황(추진 열기)
    escapePart: true,
    desc: '탈출선을 추진할 엔진. 철이 대량으로 필요합니다.',
  },
  shipReactor: {
    name: '탈출선 - 반응로', cost: { gold: 250, iron: 200, food: 150 }, work: 700, hp: 300,
    fw: 5, fh: 3, solid: true, light: true,
    img: 'Castle', imgC: 'Castle_C', pw: 320, ph: 256, tint: 0x7fe0a0, // 청록(동력)
    escapePart: true,
    desc: '엔진에 동력을 공급하는 반응로. 금·철·식량이 필요합니다.',
  },
  campfire: {
    name: '모닥불', cost: { wood: 2 }, work: 10, hp: 30,
    fw: 1, fh: 1, solid: false, light: true,
    img: null, pw: 128, ph: 128, // Fire 애니메이션으로 렌더
    desc: '밤을 밝힙니다.',
  },
  fence: {
    // 공격·조명 없이 체력만 있고 통행을 막는 저렴한 1칸 울타리. attack 필드가 없어 방어건물 로직(tickTowers)에서 자동 제외됨.
    name: '울타리', cost: { wood: 3 }, work: 15, hp: 40,
    fw: 1, fh: 1, solid: true,
    desc: '공격 기능은 없지만 통행을 막습니다. 정착지 경계를 두르는 저렴한 울타리.',
  },
  fenceGate: {
    // solid:false(정착민 통과 자유) + enemyBlocked:true(적 길찾기만 차단, world.js isWalkable(forEnemy) 전용).
    // 길이 완전히 막히면 적도 결국 부수고 들어옴(breakThrough 는 solid 여부와 무관하게 모든 건물을 대상으로 함).
    name: '성문', cost: { wood: 5 }, work: 20, hp: 50,
    fw: 1, fh: 1, solid: false, enemyBlocked: true,
    desc: '정착민은 자유롭게 드나들지만 적은 통과하지 못합니다(막다른 길이면 결국 부숩니다). 방어선 안쪽에 마을 출입구를 낼 때 씁니다.',
  },
  dock: {
    name: '선착장', cost: { wood: 20, gold: 8 }, work: 90, hp: 90,
    fw: 2, fh: 2, solid: false, requireCoast: true, // 물과 접한 곳에만 건설 가능(main.js 게이트)
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, tint: 0x5a9ec9, // 파란 물빛 색조(선착장=해안)
    desc: '배를 대는 선착장. 인접한 곳에서 낚시하면 희귀 어종 확률이 크게 오릅니다.',
  },
  ranch: {
    name: '목장', cost: { wood: 14 }, work: 60, hp: 90,
    fw: 2, fh: 2, solid: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 64, sy: 64, sw: 64, sh: 64 }, tint: 0xa8e08a, // 빨강집 + 초록조(목장)
    desc: '주기적으로 식량을 생산하고 가축(양·돼지·소·닭)을 번식시킵니다.',
  },
  clinic: {
    name: '치료소', cost: { wood: 10, gold: 3 }, work: 60, hp: 100,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, tint: 0xdfeaff, // 회색집 + 청백색조(치료소=청결·의료)
    desc: '부상당한 정착민이 찾아와 빠르게 회복합니다.',
  },
  pavilion: {
    name: '정자', cost: { wood: 15 }, work: 50, hp: 70,
    fw: 2, fh: 2, solid: true, light: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 64, sy: 64, sw: 64, sh: 64 }, tint: 0xffd9ec, // 빨강집 + 분홍조(정자=휴식·사기)
    desc: '정착민들이 쉬며 사기를 북돋우는 휴식 공간입니다. 마을에 지으면 전체 사기가 소폭 오릅니다.',
  },
  barn: {
    name: '축사', cost: { wood: 20, gold: 5 }, work: 80, hp: 100,
    fw: 2, fh: 2, solid: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 64, sy: 64, sw: 64, sh: 64 }, tint: 0xb08d5a, // 목재빛 갈색조(축사=사육)
    desc: '이 건물이 있어야 야생동물을 길들일 수 있습니다. 길들인 동물 수에 비례해 주기적으로 식량을 산출합니다.',
  },
  // ── 일꾼 오두막: 자원 옆에 붙여 지어 자동 채광·농사(친구 피드백). 비쌈. ──
  minerLodge: {
    name: '광부 오두막', cost: { wood: 25, gold: 15 }, work: 90, hp: 90,
    fw: 2, fh: 2, solid: true, light: true, requireMineAdjacent: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 0, sy: 64, sw: 64, sh: 64 }, tint: 0xc9a24a, // 광석빛 황금
    desc: '금광·철광에 붙여 지으면 그 광산을 고갈·재생과 무관하게 자동으로 계속 채굴합니다.',
  },
  farmLodge: {
    name: '농부 오두막', cost: { wood: 25, gold: 10 }, work: 90, hp: 90,
    fw: 2, fh: 2, solid: true, light: true, requireFarming: true,
    img: 'House', imgC: 'House_C', pw: 128, ph: 192,
    town: { sx: 64, sy: 64, sw: 64, sh: 64 }, tint: 0x8fca5a, // 초록(농경)
    desc: '완공 시 주변 잔디를 자동으로 농사 구역으로 만들어 계속 재배합니다. (농업 연구 필요)',
  },
  // ── 장식(순수 꾸미기용, 게임 로직 없음 — 통행 차단도 안 함). The Fan-tasy Tileset 소품 재활용.
  decoBarrel: { name: '장식 - 통',     cost: { wood: 2 },              work: 8,  hp: 20, fw: 1, fh: 1, solid: false, desc: '오직 꾸미기용 장식물입니다.' },
  decoBasket: { name: '장식 - 바구니', cost: { wood: 2 },              work: 8,  hp: 20, fw: 1, fh: 1, solid: false, desc: '오직 꾸미기용 장식물입니다.' },
  decoBench:  { name: '장식 - 벤치',   cost: { wood: 3, leather: 1 },  work: 10, hp: 20, fw: 1, fh: 1, solid: false, desc: '오직 꾸미기용 장식물입니다.' },
  decoTable:  { name: '장식 - 탁자',   cost: { wood: 3, leather: 1 },  work: 10, hp: 20, fw: 1, fh: 1, solid: false, desc: '오직 꾸미기용 장식물입니다.' },
  decoLamp:   { name: '장식 - 가로등', cost: { wood: 3, gold: 1 },     work: 10, hp: 20, fw: 1, fh: 1, solid: false, light: true, desc: '꾸미기용 장식물. 밤을 밝힙니다.' },
  decoSign:   { name: '장식 - 표지판', cost: { wood: 2 },              work: 8,  hp: 20, fw: 1, fh: 1, solid: false, desc: '오직 꾸미기용 장식물입니다.' },
  decoFlower: { name: '장식 - 화단',   cost: { wood: 1 },              work: 6,  hp: 15, fw: 1, fh: 1, solid: false, desc: '오직 꾸미기용 장식물입니다.' },
  decoBanner: { name: '장식 - 깃발',   cost: { wood: 2, leather: 2 },  work: 10, hp: 20, fw: 1, fh: 1, solid: false, desc: '오직 꾸미기용 장식물입니다.' },
};
// 농부 오두막이 자동 농사 구역으로 만드는 주변 반경(풋프린트 바깥 타일)
export const LODGE_FARM_RADIUS = 3;
export const BUILDING_HP_DEFAULT = 100; // hp 미지정 건물종류(에셋팩 신규 추가 등) 폴백

// ── 저장고 용량 (2): 기본 + 창고당 증가. 초과분은 저장 불가(폐기) ──
export const STORAGE = { base: 120, perWarehouse: 180 };

// ── 창고 업그레이드 단계: 인덱스 0 = 1단계(건설 시 기본), cap 은 STORAGE.perWarehouse 대신 사용 ──
// 땅이 한정적이라 창고 1채가 담는 양을 단계로 크게 늘림(최대 1300 = 초기의 7배 이상).
export const WAREHOUSE_TIERS = [
  { cap: 180,  cost: null },                                  // 1단계: 건설 비용에 포함
  { cap: 340,  cost: { wood: 20, gold: 8 } },                  // 2단계
  { cap: 560,  cost: { wood: 35, gold: 18 } },                 // 3단계
  { cap: 850,  cost: { wood: 55, gold: 30, iron: 12 } },       // 4단계 (철 필요)
  { cap: 1300, cost: { wood: 85, gold: 50, iron: 28 } },       // 5단계 (대형 물류창고)
];

// ── 방어건물 업그레이드 tier: 공격 스탯(power·range·cd) + 업그레이드 비용 ──
// 1단계는 건설에 포함(cost:null). aoe(맨해튼 반경, 0=단일)로 광역 피해 표현 — 성 최종 tier 는 대포(광역).
export const DEFENSE_TIERS = {
  outpost: [
    { power: 5,  range: 4, cd: 20, cost: null }, // 기본 초소 — 특화 전(OUTPOST_BRANCHES 로 분기)
  ],
  tower: [
    { power: 10, range: 6, cd: 14, cost: null },
    { power: 16, range: 7, cd: 12, cost: { wood: 20, gold: 12 } },
    { power: 24, range: 8, cd: 10, cost: { wood: 30, gold: 20, iron: 10 } },
  ],
  castle: [
    { power: 18, range: 8,  cd: 10, cost: null },
    { power: 28, range: 9,  cd: 9,  cost: { wood: 40, gold: 25, iron: 15 } },
    { power: 42, range: 10, cd: 8,  cost: { wood: 60, gold: 45, iron: 30 }, cannon: true, aoe: 2, minRank: 4 }, // 대포(광역) — 나라 단계 해금
  ],
};
export const CANNON = { radius: 2 }; // 대포 광역 피해 반경(맨해튼 거리, 타일) — 하위호환용 상수

// ── 초소(outpost) 특화 분기: 기본 초소를 근접/원거리 4갈래로 나눠 업그레이드 ──
// 각 분기는 자체 2단계 tier 배열을 가짐. 분기 선택 시 b.branch 설정 + b.tier=1(분기 1단계).
// role: 'melee'(근접·짧은 사거리·인접 광역) | 'ranged'(원거리). ranged 는 사거리/광역/연사로 다시 차별화.
// aoe(맨해튼 반경, 0=단일 대상)·tint(렌더 색조)·icon(배지)로 시각 구분. rng 미사용 → 결정론 유지.
export const OUTPOST_BRANCHES = {
  spike:    { name: '가시벽',  icon: '🧱', role: 'melee',  tint: 0x9adf7a, badge: '🧱',
    desc: '근접 방어. 바로 곁의 적에게 강한 광역 피해를 줍니다 (사거리 짧음).',
    tiers: [
      { power: 22, range: 3, cd: 16, aoe: 1, cost: { wood: 16, gold: 6 } },
      { power: 34, range: 3, cd: 14, aoe: 1, cost: { wood: 24, gold: 12, iron: 8 } },
    ] },
  ballista: { name: '석궁탑',  icon: '🎯', role: 'ranged', tint: 0xc9a26a, badge: '🎯',
    desc: '원거리·저격형. 매우 긴 사거리로 단일 적을 강하게 저격합니다.',
    tiers: [
      { power: 18, range: 8,  cd: 16, aoe: 0, cost: { wood: 18, gold: 12 } },
      { power: 30, range: 10, cd: 14, aoe: 0, cost: { wood: 28, gold: 20, iron: 10 } },
    ] },
  catapult: { name: '투석기',  icon: '💣', role: 'ranged', tint: 0x8a8f9a, badge: '💣',
    desc: '원거리·광역형. 중간 사거리로 넓은 반경에 포격합니다 (느린 연사).',
    tiers: [
      { power: 14, range: 6, cd: 24, aoe: 2, cost: { wood: 22, gold: 16, iron: 6 } },
      { power: 22, range: 7, cd: 22, aoe: 2, cost: { wood: 34, gold: 26, iron: 14 } },
    ] },
  rapid:    { name: '속사탑',  icon: '⚡', role: 'ranged', tint: 0x6db3ff, badge: '⚡',
    desc: '원거리·연사형. 낮은 피해를 매우 빠르게 연사합니다 (단일 대상).',
    tiers: [
      { power: 7,  range: 6, cd: 5, aoe: 0, cost: { wood: 16, gold: 14 } },
      { power: 11, range: 7, cd: 4, aoe: 0, cost: { wood: 26, gold: 22, iron: 8 } },
    ] },
};

// ── 목장 (5): 지어두면 주기적으로 식량 산출 + 양 번식 ──
export const RANCH = { interval: 200, food: 4, breedChance: 0.2, maxSheep: 12 };

// ── 치료소 (6): 부상 정착민이 와서 빠르게 회복 ──
export const CLINIC = { hurtAt: 55, healedAt: 92, restRegen: 100 / 200 };

// ── 정착민 스킬 (4): 활동으로 숙련도 상승 → 작업 속도↑ ──
export const SKILL_LABEL = {
  woodcutting: '벌목', mining: '채광', construction: '건축', farming: '농사', combat: '전투', fishing: '낚시',
};
export function skillLevel(xp) { return Math.min(10, Math.floor((xp || 0) / 100)); }
export function skillMult(xp) { return 1 + skillLevel(xp) * 0.06; } // 레벨당 +6%, 만렙 +60%

// ── 정착민 역할 (특화 직업) ──
// 지정 시 해당 작업(jobs)을 일반 우선순위보다 먼저 수행 + 전문 작업 속도 보너스.
// jobs 는 findWorkJob 의 job.type 토큰. 역할 작업이 없으면 일반 캐스케이드로 폴백(놀지 않음).
export const ROLES = {
  none:       { name: '자유',     icon: '🧑', jobs: [] },
  builder:    { name: '건축가',   icon: '🏗️', jobs: ['build', 'deliver'] },
  woodcutter: { name: '벌목꾼',   icon: '🪓', jobs: ['gather'] },
  miner:      { name: '광부',     icon: '⛏️', jobs: ['mine'] },
  farmer:     { name: '농부',     icon: '🌾', jobs: ['plant', 'harvestCrop', 'cook'] },
  fisher:     { name: '어부',     icon: '🎣', jobs: ['fish'] },
  hunter:     { name: '사냥꾼',   icon: '🏹', jobs: ['hunt', 'fish', 'tame'] },
  smith:      { name: '대장장이', icon: '🔨', jobs: ['craft', 'mine'] },
};
export const ROLE_SPEED_BONUS = 1.15; // 역할 전문 작업 속도 +15%

// 자연물 (단일 타일)
export const NATURE = {
  tree:      { work: 20, drops: { wood: 9 } },
  mushroom:  { work: 8,  drops: { food: 1 } },
  carrotPatch: { work: 10, drops: { carrot: 2 } }, // 채집 전용 신규 재료 — 요리(채소죽) 재료
  chest:     { work: 45, drops: { gold: 60, iron: 20 } },  // 보물상자(원정섬) — 개봉 시 확률로 유물도 획득(pawns.js)
  rareplant: { work: 14, drops: { food: 6, gold: 3 } },    // 희귀 식물(원정섬) — 일반 자연물보다 산출 높음
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
  irrigation:    { name: '관개', cost: 140, desc: '밀·과일 수확량이 30% 늘어납니다' },
  veterinary:    { name: '수의학', cost: 130, desc: '사냥·목축 산출량이 25% 늘어납니다' },
  fortification: { name: '요새화', cost: 200, desc: '방어 계열 건물(초소·성)의 내구도가 40% 늘어납니다' },
};
// fortification 연구로 내구도가 보정되는 방어 계열 건물 kind 목록
export const FORTIFY_KINDS = ['outpost', 'tower', 'castle'];

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
// 과일나무: 밀과 달리 수확해도 베이지 않고 다시 자람(재파종 불필요) — regrowTime 후 재수확 가능.
export const FRUITTREE = { plantWork: 16, growTime: 520, harvestWork: 10, yield: 5, regrowTime: 300 };

// ── 대장간 (건물 불필요 — 지은 집에서 제작) ──
// power=공격력, range=사거리(타일). iron 계열은 강철 연구 후 해금
export const WEAPONS = {
  sword:     { name: '검',     cost: { wood: 4, gold: 3 },  work: 40, equip: 'warrior', power: 10, range: 1 },
  bow:       { name: '활',     cost: { wood: 3, gold: 4 },  work: 40, equip: 'archer',  power: 8,  range: 5 },
  ironSword: { name: '강철검', cost: { wood: 3, iron: 4 },  work: 60, equip: 'warrior', power: 20, range: 1, iron: true },
  ironBow:   { name: '강철활', cost: { wood: 3, iron: 4 },  work: 60, equip: 'archer',  power: 16, range: 6, iron: true },
};
// 방어구 — 착용 시 피격 데미지를 defense 만큼 경감(최소 1 데미지는 항상 관통). iron 계열은 강철 연구 후 해금.
export const ARMOR = {
  leatherArmor: { name: '가죽 갑옷', cost: { leather: 6 }, work: 45, equip: 'armor', defense: 4 },
  ironArmor:    { name: '강철 갑옷', cost: { wood: 3, iron: 5 }, work: 65, equip: 'armor', defense: 9, iron: true },
};
// 대장간 제작 대기열이 무기·방어구를 동일하게 다룰 수 있도록 합친 조회 테이블(SSOT).
export const ITEMS = Object.assign({}, WEAPONS, ARMOR);

// ── 전투 ──
export const COMBAT = {
  unarmedPower: 3,     // 맨손 공격력
  attackCd: 12,        // 공격 쿨다운(게임분)
  pawnHp: 100,
};
// 고블린 습격
export const ENEMY = { hp: 45, power: 8, attackCd: 14, moveMinPerTile: 1.4, dropGold: 2 };

// ── 무지성 거인 「괴민」: 5일밤마다 상륙. 덩치 크고 HP·공격력 높지만 느리고 아둔함(진격의 거인풍) ──
// moveMinPerTile 이 클수록 느림(2.8 = 고블린의 2배 느림). rng 미사용 → 결정론 유지.
export const GIANT = {
  hp: 900, power: 22, attackCd: 24, moveMinPerTile: 2.8, // hp 3배(300→900) — 훨씬 튼튼한 탱커
  dropGold: 30, dropIron: 15, hpPerDay: 8, name: '괴민',
};
export const GIANT_FAST_MULT = 0.55; // 빠른 괴민(대침공 추가 투입): 이동 소요시간 ×0.55 → 약 1.8배 빠름
// 괴민 점프: 벽·숲에 막혀도 목표 방향으로 도약해 뚫고 나감(통행 불가 지형 무시) + 착지 지점 광역 파괴.
// cooldown 180 게임분 = 기본 배속(MIN_PER_SEC=6)에서 실제 약 30초.
export const GIANT_JUMP = { cooldown: 180, distance: 5, radius: 2, damage: 60 };
export const GIANT_RAID = { everyDays: 5, spawnHour: 20, baseCount: 1 }; // 5·10·15…일 밤 8시
export const RAID = { firstDay: 4, intervalDays: 3, baseCount: 2, perDayExtra: 0.4, spawnHour: 20,
  perPop: 0.4, hpPerDay: 1.5, loot: { gold: 4, iron: 2 } };
// 식인종(원정 섬 상주 적) — 고블린보다 강하고 빠름. 습격과 무관하게 섬에 상시 서식.
export const CANNIBAL = { hp: 60, power: 11, attackCd: 12, moveMinPerTile: 1.2, dropGold: 8, dropIron: 4, name: '식인종' };

// ── 침략 세력(대침공 외부 세력) — 배를 타고 상륙하는 다른 종족의 군대 ──
// 약탈자: 빠르고 약하지만 떼로 몰려옴(Pawn 도끼병). 침략 전사: 느리지만 튼튼한 기사(Warrior).
export const RAIDER = { hp: 42, power: 8, attackCd: 13, moveMinPerTile: 1.1, dropGold: 5, dropIron: 1, name: '약탈자' };
export const INVWARRIOR = { hp: 100, power: 15, attackCd: 16, moveMinPerTile: 1.7, dropGold: 10, dropIron: 4, name: '침략 전사' };
// 언데드 몬스터: 좀비(느린 살덩이)·스켈레톤(빠른 뼈다귀). 대침공에 섞여 상륙.
export const ZOMBIE = { hp: 70, power: 9, attackCd: 15, moveMinPerTile: 2.1, dropGold: 3, dropIron: 0, name: '좀비' };
export const SKELETON = { hp: 55, power: 10, attackCd: 13, moveMinPerTile: 1.3, dropGold: 4, dropIron: 2, name: '스켈레톤' };

// ── 정복자 「워로드」: 대침공(INVASION) 전용 미니보스. GIANT × 1.3 배율 ──
export const WARLORD = {
  hp: 390, power: 29, attackCd: 24, moveMinPerTile: 2.8,
  dropGold: 39, dropIron: 20, name: '정복자',
};

// ── 최종 보스 「악마후배」: 가장 먼 섬에 상주. 괴민의 10배 체력 + 압도적 화력. 처치 시 막대한 보상 + 전설 유물 확정 ──
export const DEMON = {
  hp: GIANT.hp * 10, // 9000 (괴민 900의 10배)
  power: 60, attackCd: 18, moveMinPerTile: 2.4,
  dropGold: 2000, dropIron: 800, name: '악마후배',
  // 광역 레이저: 쿨다운마다 사거리 내 목표가 있으면 반경 전체에 강력한 피해(일반 공격과 별개)
  laser: { cooldown: 240, range: 14, radius: 6, damage: 45 },
};

// ── 나라의 시련(대침공): 달력상 고정된 날짜(10일차·20일차)에 파도식 습격. 정복자가 각 웨이브를 이끈다.
// 나라 단계 도달 여부와 무관하게 무조건 발동 — 방어를 못 갖췄어도 시련을 겪는 가혹한 난이도.
// schedule 순서대로 하나씩 진행되며, 뒤로 갈수록(20일차) 웨이브·적 수·보상이 늘어난다.
export const INVASION = {
  // 웨이브마다 여러 종족 혼합 상륙(고블린·약탈자·침략전사·언데드 + 정복자). 10·20일차 모두 빠른 괴민 3체 동반.
  schedule: [
    { day: 10, waves: 3, goblinsPerWave: 3, raidersPerWave: 6, warriorsPerWave: 2, warlordsPerWave: 1, zombiesPerWave: 2, skeletonsPerWave: 2, relicCount: 1, giants: 3 },
    { day: 20, waves: 4, goblinsPerWave: 4, raidersPerWave: 8, warriorsPerWave: 3, warlordsPerWave: 2, zombiesPerWave: 3, skeletonsPerWave: 3, relicCount: 2, giants: 3 },
  ],
  spawnHour: 20,          // GIANT_RAID/RAID 와 동일 시각대(밤 8시)
  waveGapMin: 90,          // 웨이브 클리어 후 다음 웨이브까지 소강 시간(게임분)
  retryGapDays: 3,          // 전멸 위기로 침공군이 물러간 뒤 재도전까지 유예일
};

// ── 요리 (모닥불에서) — 등급별 레시피. 낚시 등급 테이블처럼 높은 등급일수록 재료가 다양·포만감 회복량 큼.
// 정착민은 collectCook 에서 재료가 되는 가장 높은 등급을 자동으로 골라 요리함(등급별 재고 각각 6개 상한).
export const COOK_TIERS = [
  { id: 'meal',      name: '소박한 식사', cost: { food: 2 },                       work: 15, eatAmount: 95 },
  { id: 'mealVeg',   name: '채소죽',     cost: { food: 1, carrot: 2 },            work: 18, eatAmount: 115 },
  { id: 'mealGood',  name: '푸짐한 식사', cost: { food: 2, meat: 2 },              work: 20, eatAmount: 140 },
  { id: 'mealFeast', name: '진수성찬',   cost: { food: 2, meat: 2, delicacy: 1 }, work: 26, eatAmount: 190 },
];
// 요리 완성 시 극히 낮은 확률로 등급과 무관하게 "성공"해 나오는 기적의 음식.
// 먹으면 그 정착민의 최대 체력이 영구히 늘어남(여러 번 먹으면 중첩).
export const GLORIOUS_FOOD = {
  id: 'gloriousMeal', name: '찬란한 음식', icon: '✨', chance: 0.01,
  eatAmount: 200, maxHpBonus: 20,
};

// ── 사냥 (동물) ── 종류별 식량·가죽·고기 산출. 고기는 고급 요리(푸짐한 식사 이상)의 재료.
export const HUNT = { work: 14 };
export const ANIMALS = {
  sheep:    { label: '양',     food: 4,  leather: 2, meat: 1, wool: 3, sheet: 'Sheep_Idle', big: true },
  pig:      { label: '돼지',   food: 6,  leather: 3, meat: 3, sheet: 'Pig',        big: false },
  cow:      { label: '소',     food: 9,  leather: 4, meat: 4, sheet: 'Cow',        big: false },
  chicken:  { label: '닭',     food: 2,  leather: 1, meat: 1, sheet: 'Chicken',    big: false },
  raredeer: { label: '희귀 영양', food: 16, leather: 5, meat: 5, sheet: 'Cow', big: false, rareGold: 12 }, // 비경의 섬 전용. 처치 시 금도 획득
  // ── 야생동물: 본섬에 배회 — 사냥해도 되고, 축사가 있으면 길들여 사육 가능 ──
  // 말·사슴·늑대·곰·사자는 전용 스프라이트(LPC) 보유. 호랑이만 전용 그림이 없어 사자 그림 + 색조로 대체.
  horse: { label: '말',    food: 5,  leather: 3, meat: 2, wild: true, tameChance: 0.55, weight: 30 },
  deer:  { label: '사슴',  food: 6,  leather: 3, meat: 3, wild: true, tameChance: 0.45, weight: 26 },
  wolf:  { label: '늑대',  food: 4,  leather: 4, meat: 3, wild: true, tameChance: 0.30, weight: 20 },
  bear:  { label: '곰',    food: 8,  leather: 5, meat: 5, wild: true, tameChance: 0.20, weight: 12 },
  lion:  { label: '사자',  food: 9,  leather: 6, meat: 6, wild: true, tameChance: 0.14, weight: 8 },
  tiger: { label: '호랑이', food: 10, leather: 6, meat: 6, tint: 0xe0762e, wild: true, tameChance: 0.10, weight: 4 },
};
export const ANIMAL_TYPES = ['sheep', 'pig', 'cow', 'chicken']; // 야생 배회(pickAnimalType) 대상 — raredeer 는 섬 전용, 제외
export const WILD_ANIMAL_TYPES = ['horse', 'deer', 'wolf', 'bear', 'lion', 'tiger']; // 본섬 배회 야생동물(pickWildAnimalType) — weight 로 희귀도 가중

// ── 길들이기: 축사(barn)가 있어야 야생동물에게 시도 가능. 실패해도 동물은 그대로 남아 재시도 가능 ──
export const TAME = { work: 25 };
// ── 축사: 길들인 야생동물 사육 — 목장과 달리 번식은 안 하고, 길들인 개체 수에 비례해 주기적으로 식량 산출 ──
export const BARN = { interval: 200, foodPerAnimal: 3 };

// ── 고용: 식량을 지불하고 새 정착민 영입 (인원 늘수록 비용↑) ──
export const HIRE = { base: 25, perPawn: 15, maxPop: 12 };
export function hireCost(alivePop) { return HIRE.base + HIRE.perPawn * alivePop; }

// ── 콜로니 발전 단계 (문명 성장): 무리 → 집단 → 마을 → 도시 → 나라 ──
// 각 단계가 인구 상한(popCap)을 올리고 건물을 해금(BUILD_MIN_RANK). 요건 충족 시 발전 패널에서 승급.
// req: pop=최소 인구, builds={kind:개수}=완공 건물 수, res={type:수량}=보유 재고.
// popCap 은 단계별 기본 상한(전과 달리 축소됨) — 실제 상한은 집(house) 채수가 더해져 완성됨(아래 HOUSE_POP_*).
export const RANKS = [
  { id: 'band',    name: '무리', icon: '🏕️', popCap: 6,  req: null },
  { id: 'group',   name: '집단', icon: '🛖', popCap: 8,  req: { pop: 5,  builds: { house: 2 } } },
  { id: 'village', name: '마을', icon: '🏘️', popCap: 11, req: { pop: 9,  builds: { warehouse: 1, smithy: 1 } } },
  { id: 'city',    name: '도시', icon: '🏙️', popCap: 15, req: { pop: 15, builds: { tower: 1, clinic: 1 } } },
  { id: 'nation',  name: '나라', icon: '🏛️', popCap: 20, req: { pop: 24, builds: { castle: 1 }, res: { gold: 150 } } },
];
// 완공된 집 1채당 인구 상한 기여분(무한 스팸 방지용으로 반영 채수에 상한을 둠)
export const HOUSE_POP_BONUS = 2;
export const HOUSE_POP_CAP_COUNT = 12;
// 건물별 최소 해금 단계(RANKS 인덱스). 목록에 없는 건물은 0(무리)부터 건설 가능.
export const BUILD_MIN_RANK = {
  smithy: 1, ranch: 1, outpost: 2, tower: 2, clinic: 2, castle: 3,
  minerLodge: 1, farmLodge: 1, // 일꾼 오두막(집단 단계부터)
  shipHull: 4, shipEngine: 4, shipReactor: 4, // 나라 단계 전용(main.js 에서 대침공 완전 격퇴도 추가로 요구)
};

// ── 유물(Relic) — 아이작풍 로그라이트: 습격 격퇴·괴민 처치 시 무작위 획득, 콜로니에 영구 패시브 ──
// effect.key 는 UPGRADES 와 동일 배율 풀을 공유 → 업그레이드·다른 유물과 자동 시너지(누적).
// 중복 획득 시 스택(mult 는 거듭제곱, add 는 합). 새 훅 불필요.
export const RELICS = {
  worm:     { name: '부지런한 일벌레', icon: '🐛', effect: { key: 'speed_all', mult: 1.12 },       desc: '모든 작업 속도 +12%' },
  axe:      { name: '요정 도끼',       icon: '🪓', effect: { key: 'speed_woodcutting', mult: 1.4 }, desc: '벌목 속도 +40%' },
  pick:     { name: '요정 곡괭이',     icon: '⛏️', effect: { key: 'speed_mining', mult: 1.4 },     desc: '채굴 속도 +40%' },
  totem:    { name: '풍요의 토템',     icon: '🌾', effect: { key: 'speed_farming', mult: 1.4 },    desc: '농사·수확 속도 +40%' },
  crate:    { name: '요술 창고',       icon: '📦', effect: { key: 'storage', add: 220 },           desc: '저장 용량 +220' },
  ballista: { name: '고대 발리스타',   icon: '🏹', effect: { key: 'towerpower', mult: 1.3 },       desc: '방어건물 공격력 +30%' },
  scope:    { name: '매의 눈',         icon: '🦅', effect: { key: 'towerrange', add: 2 },          desc: '방어건물 사거리 +2' },
  banner:   { name: '정착 깃발',       icon: '🚩', effect: { key: 'maxpop', add: 3 },              desc: '인구 상한 +3' },
  poultice: { name: '치유의 고약',     icon: '💊', effect: { key: 'healspeed', mult: 1.5 },        desc: '치료소 회복 속도 +50%' },
  // 대침공(INVASION) 승리 전용 확정 보상 — rarity 필드로 구분, grantLegendaryRelic 에서만 선택됨.
  crown:    { name: '정복자의 왕관',   icon: '👑', rarity: 'legendary', effect: { key: 'speed_all', mult: 1.25 }, desc: '모든 작업 속도 +25% (전설)' },
  // 섬의 수호신 「아보랑카도」가 GODDESS.day 일밤에 내리는 축복 — 전투 없이 확정 지급(sim.js).
  avorlancado: { name: '아보랑카도의 축복', icon: '🌺', rarity: 'legendary', goddessOnly: true, effect: { key: 'speed_all', mult: 1.2 }, desc: '섬의 수호신이 내린 축복 — 모든 작업 속도 +20% (전설)' },
};

// ── 섬의 수호신 「아보랑카도」: GODDESS.day 일 밤, 전투 없이 마을에 강림해 축복(RELICS.avorlancado)을 내리고 떠난다 ──
export const GODDESS = { day: 7, spawnHour: 20, name: '아보랑카도', relicId: 'avorlancado' };

// ── 떠돌이 상인: 주기적으로 며칠간 머무르며 잉여 자원(목재·철·식량·요리)을 금으로 사들임 ──
// rates: 자원 1개당 지급하는 금(내림). 잉여 자원 처리 + 탈출선 등 금 소요 프로젝트로 이어지는 순환 고리.
export const TRADER = {
  firstDay: 6, intervalDays: 4, spawnHour: 10, stayDays: 2,
  rates: { wood: 0.15, iron: 0.5, food: 0.2, meal: 0.6, leather: 0.25, meat: 0.3, delicacy: 1.2, mealGood: 0.9, mealFeast: 1.5, wool: 0.35, carrot: 0.2, mealVeg: 0.7 },
};

// ── 낚시 ──
// rodTier: 0=맨손, 1=나무, 2=강철, 3=황금. 높을수록 희귀 어종 확률↑·시간↓
export const FISHING = { work: 18 };
export const RODS = [
  { id: 'wood',  name: '나무 낚싯대', tier: 1, cost: { wood: 5 } },
  { id: 'iron',  name: '강철 낚싯대', tier: 2, cost: { wood: 3, iron: 3 } },
  { id: 'gold',  name: '황금 낚싯대', tier: 3, cost: { wood: 3, gold: 6 } },
];
// rare: 0 흔함 → 3 전설. weight 는 기본 확률, 낚싯대 등급이 높을수록 rare 가중.
// 금은 초희귀 '황금 잉어'(weight 1.0 ≈ 약 1%)에서만 나옴 — 나머지 어종은 고기(식량) 전용.
// food 는 밸런싱을 위해 기존값의 절반으로 하향(낚시가 식량을 과다 공급하던 문제). 금 산출은 유지.
// delicacy(진미): rare 2 이상 희귀 어종에서만 나오는 최고급 요리 재료(진수성찬 전용).
export const FISH = [
  { name: '멸치',       food: 1,  gold: 0,  weight: 42, rare: 0 },
  { name: '붕어',       food: 2,  gold: 0,  weight: 30, rare: 0 },
  { name: '농어',       food: 4,  gold: 0,  weight: 16, rare: 1 },
  { name: '연어',       food: 6,  gold: 0,  weight: 9,  rare: 1 },
  { name: '금붕어',     food: 5,  gold: 0,  weight: 3,  rare: 2, delicacy: 1 },
  { name: '전설의 잉어', food: 9,  gold: 0,  weight: 0.7, rare: 3, delicacy: 1 },
  { name: '황금 잉어',   food: 4,  gold: 30, weight: 1.0, rare: 3, delicacy: 1 }, // 유일한 금 산출 어종(초희귀, ≈1%)
  { name: '심해 아귀왕', food: 10, gold: 0,  weight: 0.6, rare: 3, delicacy: 1 },
  { name: '오색 산천어', food: 7,  gold: 0,  weight: 0.8, rare: 3, delicacy: 1 },
  { name: '인어의 눈물고기', food: 6, gold: 0, weight: 0.5, rare: 3, delicacy: 1 },
  // spotOnly: 일반 낚시터에서는 절대 나오지 않고, world.rareFishTile 로 지정된 초특급 스팟에서만 낚임(catchRareFish 전용).
  // 금은 위의 황금 잉어가 유일 산출원이라는 기존 밸런스를 지키기 위해 gold 는 주지 않음(대신 식량·진미를 후하게).
  { name: '밍크고래',   food: 40, gold: 0, weight: 1, rare: 4, delicacy: 3, spotOnly: true },
  { name: '대왕오징어', food: 25, gold: 0, weight: 1, rare: 4, delicacy: 2, spotOnly: true },
];
// 낚시터 등급별 희귀 보정 — 낚싯대(rodTier)와 같은 방식으로 합산(둘 다 있으면 시너지).
// 0=해안(기본), 1=좌대(FISH_PLATFORM) 인접, 2=선착장(DOCK) 인접. world.js 의 fishSpotTier() 가 판정.
export const FISH_SPOT_BONUS = { plain: 0, platform: 1, dock: 2 };

export function catchFish(rodTier, rng, spotBonus) {
  var total = 0, i, w = [];
  var bonus = (rodTier || 0) + (spotBonus || 0);
  for (i = 0; i < FISH.length; i++) {
    if (FISH[i].spotOnly) { w.push(0); continue; } // 일반 낚시에서는 절대 뽑히지 않음
    var ww = FISH[i].weight * (1 + bonus * 0.9 * FISH[i].rare);
    w.push(ww); total += ww;
  }
  var r = rng() * total;
  for (i = 0; i < FISH.length; i++) { r -= w[i]; if (r <= 0) return FISH[i]; }
  return FISH[0];
}

// 초특급 희귀어종(밍크고래 등) 전용 스팟에서의 낚시 — spotOnly 어종끼리만 가중 추첨.
var RARE_FISH_POOL = FISH.filter(function (f) { return f.spotOnly; });
export function catchRareFish(rng) {
  var total = 0, i, w = [];
  for (i = 0; i < RARE_FISH_POOL.length; i++) { w.push(RARE_FISH_POOL[i].weight); total += RARE_FISH_POOL[i].weight; }
  var r = rng() * total;
  for (i = 0; i < RARE_FISH_POOL.length; i++) { r -= w[i]; if (r <= 0) return RARE_FISH_POOL[i]; }
  return RARE_FISH_POOL[0];
}

// ── 초특급 희귀 낚시 스팟: 바다에 아주 드물게(맵당 2~4곳) 무작위로 생기는 지점.
// world.js 의 createWorld 가 해안 물 타일 중 일부를 world.rareFishTile 로 표시(스폰 지점과는 멀리).
export const RARE_FISH_SPOT = { countMin: 2, countMax: 4, minDistFromCenter: 24 };

// ── 좌대: 물 위에 설치하는 저렴한 낚시 발판. 다리처럼 즉시 완공되고 밟고 설 수 있음(main.js 전용 도구).
export const FISH_PLATFORM = { name: '좌대', cost: { wood: 6 } };

// ── 광물: 금광 일부는 철광 (강철 무기 재료) ──
export const IRONMINE = { fw: 3, fh: 2, work: 18, dropsPerCycle: 2, charges: 20, regenPerDay: 5 };

// ── 뗏목/배 (물 위에 띄워 다른 대륙으로 건너감) ──
export const BRIDGE = { name: '뗏목', cost: { wood: 2 }, work: 8 };

// ── 원정 섬: 본토·2번대륙과 멀리 떨어진 바다에 절차생성되는 테마 섬 ──
// cxf/cyf/rf 는 맵 크기(MAP_W/MAP_H) 대비 비율. world.js 가 좌표로 환산해 지형에 새겨넣음.
// theme: 'treasure'(보물상자) · 'cannibal'(식인종 상시 서식) · 'rare'(희귀 식물·동물)
export const ISLANDS = [
  { id: 'treasure', theme: 'treasure', name: '보물섬',    icon: '💰', cxf: 0.125, cyf: 0.125, rf: 0.11 }, // 스켈레톤 수호자가 지키는 만큼 다른 섬보다 크게
  { id: 'cannibal', theme: 'cannibal', name: '식인종의 섬', icon: '💀', cxf: 0.885, cyf: 0.885, rf: 0.075 },
  { id: 'rareland', theme: 'rare',     name: '비경의 섬',   icon: '🦄', cxf: 0.575, cyf: 0.935, rf: 0.075 },
  // 최종 보스 「악마후배」의 섬 — 시작 지점(맵 중앙)에서 멀리 떨어진 좌하단 외딴 구석, 조금 더 크게
  { id: 'demon',    theme: 'boss',     name: '악마의 섬',   icon: '👹', cxf: 0.09,  cyf: 0.92,  rf: 0.09 },
];

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

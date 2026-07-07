# DESIGN-RUINS.md — 2번대륙 「잊힌 문명의 폐허」 설계서

> ROADMAP 티어 3 「2번대륙 테마 콘텐츠」의 구현 지시서. 2026-07-07 작성(설계: Fable 5).
> 구현 전 필독: RECIPES 레시피 1(건물)·2(적)·4-A(스톡 자원)·5(테스트) + 메모리
> 「신규 스톡 자원 숨은 지점」(main.js/ui.js 이름 매핑 4곳) + 「createWorld rng 소비 순서」.

---

## 1. 콘셉트와 차별화

2번대륙(우상단, `world.js:196` `s2x=0.86W, s2y=0.24H`)은 현재 지형·광산뿐인 빈 확장지.
여기에 **고대 폐허 3곳**을 놓는다. 원정 섬(1회성 보상 후 소진)과 달리:

- **반복 채굴형 중반 목적지** — 폐허는 발굴 charges 가 서서히 재생(광산 `dailyMineRegen` 패턴).
- **상주 수호자** — 골렘이 폐허 곁을 지키고, 처치해도 다음날 리스폰(식인종 섬 패턴).
- 산출은 **유물 조각(신규 스톡 자원)** + 골드. 조각은 도서관에서 유물로 **복원**(신규 골드 싱크 겸용).

**스코프 컷(v1 제외, 근거 포함)**: ROADMAP 원안의 「설계도」 보상은 제외한다 — 설계도가 해금할
건물/기능이 현재 없어 보상이 공중에 뜬다. 조각→유물 복원만으로 보상 루프가 닫히며,
설계도는 뉴게임+(티어 3)와 묶어 재평가. 폐허 개수도 3~5 → **3 고정**(2번대륙 타원이 좁아
5개는 footprint 충돌 위험, 소크로 여유 확인 후 증설).

## 2. 핵심 설계 결정 — 「폐허 = 육지 위의 테마 지점」 (기존 파이프라인 3개 재사용)

원정 섬 인프라가 이미 테마 확장형이라는 점을 이용한다(실측 근거):
- `world.islands` 메타 배열(`world.js:184` — `{id,name,icon,theme,cx,cy,r,discovered,cap}`).
- 발견 판정 `checkIslandDiscovery`(정착민이 반경 진입 시 토스트 — sim.js:126 호출부).
- 수호자 리스폰 `dailyIslandRespawn`(`world.js:889`)의 테마→적 매핑
  `ISLAND_GUARD_KIND`/`ISLAND_GUARD_STAT`(`world.js:887~888`).

**폐허 3곳을 `world.islands` 에 `theme:'ruin'` 엔트리로 등록**한다(지형은 새기지 않음 — 이미 육지).
→ 발견 안내·골렘 리스폰이 코드 신설 없이 매핑 추가만으로 동작. 신규 메타 배열·세이브 필드 0개.
- 주의: `dailyIslandRespawn`/`checkIslandDiscovery` 내부가 theme 별 분기·물 타일 가정을 하는지
  구현 시 함수 전문을 Read 하고, 'ruin' 테마가 안전히 지나가도록 가드 추가.

## 3. createWorld — rng 소비 순서 보호 (이 설계의 최우선 계약)

폐허 배치는 **createWorld 본문 rng 를 1회도 소비하지 않는다**. 방법:
- createWorld 마지막(모든 기존 생성 완료 후)에 **별도 패스** `placeRuins(world, mulberry32(seed ^ 0x9e77))`.
  파생 시드라 기존 지형·광산·섬 콘텐츠의 절대좌표가 전부 불변 → 기존 sim-smoke 절대좌표
  단언이 깨지지 않는다(ROADMAP 진행 원칙 4 + 메모리 규칙 준수).
- 배치 알고리즘: 2번대륙 타원(중심 `0.86W, 0.24H`, 반경 `0.17W×0.18H` — 지형 생성식과 동일 상수)
  안에서 파생 rng 로 후보 좌표 → ①육지+`footprintClear`(광산 배치부 `world.js:255~259` 모방)
  ②기존 폐허와 최소 거리 12타일 ③최대 200회 시도. 3곳 확보 실패 시 있는 만큼만(크래시 금지).
- 각 폐허: `addBuilding(world, 'ruin', x, y, { natural: true, stage: 'built', charges: RUIN.charges })`
  + `world.islands.push({ id:'ruin'+n, theme:'ruin', name:'잊힌 폐허', icon:'🏛️', cx,cy, r:5, discovered:false, cap:2 })`.

## 4. config 신규 정의 (전부 config.js — SSOT)

```js
// 고대 폐허: 2번대륙 반복 발굴지. 광산(charges+일일재생)과 동일 수명 모델, 산출만 확률 테이블.
export const RUIN = {
  name: '고대 폐허', icon: '🏛️', fw: 2, fh: 2, hp: 300,
  charges: 6, regenPerDay: 0.5,        // 이틀에 1회분 재생 — 광산보다 느리게(원정 왕복 리듬)
  work: 30,                             // 발굴 1회 작업량(채굴보다 김)
  loot: { gold: [6, 14], fragmentChance: 0.6 }, // 회당: 골드 6~14 + 60% 확률 조각 1
  count: 3, minGap: 12,
};
// 수호 골렘: 폐허 상주 적. 괴민(hp900)보다 약하고 침략전사(hp100)보다 강한 중반 벽.
// 느리지만 단단 — 원거리 없음. 2번대륙 상주라 본토 콜로니 위협 없음(§7 안전 근거).
export const GOLEM = { hp: 220, power: 17, attackCd: 20, moveMinPerTile: 3.0,
  dropGold: 18, dropIron: 8, name: '수호 골렘' };
// 유물 복원(도서관 액션): 조각+골드 → 일반 유물 무작위 1개. 골드 싱크 겸 조각의 유일한 소비처.
export const RESTORE = { fragments: 5, gold: 25 };
```
- 신규 스톡 자원 `fragment`(유물 조각 🧩) — **RECIPES 4-A 전 항목 + 메모리의 main.js/ui.js
  이름 매핑 4곳**(누락 시 조용히 영어 표기되는 함정) 필수. 상인 매입(`TRADER.rates`)에는
  **넣지 않는다** — 조각은 복원 전용 화폐(팔리면 싱크 루프가 샌다).

## 5. 발굴 작업·복원 — 기존 파이프라인 최대 재사용

- **발굴 job**: 신규 job 종류를 만들지 않고 **채굴(mine) job 파이프라인에 'ruin' 건물을 편입**
  (goldmine/ironmine 이 이미 natural+charges 건물을 작업 대상으로 삼는 구조).
  분기점은 "채굴 완료 시 산출 지급부" 1곳 — 건물 종류가 ruin 이면 `RUIN.loot` 테이블로 지급
  (골드 범위·조각 확률 모두 **pawn 틱의 ambient rng** 경유 — 결정론 규칙).
  위치는 FUNCTIONS.md 에서 채굴 완료 처리 검색(예약락·job 탐색은 기존 그대로 상속 — 레시피 3
  전체를 새로 밟지 않아도 됨. 단 job 대상 건물 나열이 하드코딩이면 그 지점에 ruin 추가).
- **재생**: `dailyMineRegen`(sim.js:162 호출) 에 ruin 포함 — regenPerDay 0.5 는 "짝수 일마다 +1"
  로 구현(부동소수 누적 금지 — 결정론·세이브 왕복 안전).
- **복원 액션**: 도서관 UI(기존 골드 싱크 건물)에 「유물 복원」 버튼. 처리는 world.js 신규 함수
  `restoreRelic(world, rng)` — 조각·골드 차감 + 미보유 일반 유물 중 무작위 1개(RELICS 스택 설계
  재사용, 전부 보유 시 골드만 환급 안내). **rng 는 main.js 가 stepWorld 에 쓰는 ambient rng 를
  전달**(UI 액션이지만 Math.random 금지 — check:style 게이트).

## 6. 수호 골렘 — 상주 적 (식인종 패턴)

- 초기 배치: `placeRuins` 에서 폐허당 2체를 폐허 인접 타일에 스폰(식인종 초기 배치
  `world.js:329~338` 의 enemy 객체 필드 구성을 그대로 모방, `kind:'golem'`).
- 리스폰: `ISLAND_GUARD_KIND` 에 `ruin:'golem'`, `ISLAND_GUARD_STAT` 에 `ruin: GOLEM` 추가 →
  `dailyIslandRespawn` 이 cap(2)까지 자동 보충. **폐허 charges 소진 중에도 리스폰 유지**(반복
  목적지의 긴장 유지 — 골렘 없는 폐허는 무료 ATM 이 된다).
- 스탯 참조: `enemyStatFor`(world.js:1156 부근) kind 분기에 golem 추가.
- 행동: 식인종과 동일 AI 경로 사용(신규 행동 코드 금지). 구현 시 식인종의 어그로·귀환 로직
  위치를 grep 으로 확인하고 golem 이 같은 분기를 타는지 검증.

## 7. 안전·밸런스 근거 (소크 불변식 보호)

- 골렘은 2번대륙 상주 + 물을 못 건넘 → 본토 콜로니 도달 불가. 이는 습격 상륙 제한과 같은
  대륙 라벨링 사실(`world.js:1167~1225` — 본섬 외 대륙의 적은 콜로니에 못 옴)에 근거.
  → **무개입 소크(정착민이 안 감)에서 골렘 접촉 자체가 없어 전멸 위험 0** — 불변식 통과 보장.
- 능동 원정 리스크는 플레이어 선택(배 건조 + 전투 준비) — 괴민(900)·워로드(390)보다 낮은
  hp 220 은 중반 장비 2~3인 파티 기준. 수치는 플레이 테스트로 조정 가능(config 만 수정).
- 경제: 폐허 3곳 × 재생 0.5/일 = 골드 유입 상한 ~15/일 + 조각 ~0.9/일 → 복원 1회(조각 5)에
  약 5~6일. 여관·상점 싱크와 병행해 인플레 억제(복원 자체가 골드 25 싱크).

## 8. 세이브·호환

- `world.buildings`(ruin 포함)·`world.enemies`(golem)·`world.stock.fragment`·`world.islands` 는
  기존 통째/목록 직렬화 경로에 자동 편승 — **구현 시 save.js 에서 islands·stock 이 실제로
  통째 직렬화인지 확인**(필드 화이트리스트라 islands 가 빠져 있으면 추가).
- **구세이브**: 폐허는 worldgen 산물이라 기존 세이브 맵에는 소급 생성되지 않음 — 크래시 없이
  "콘텐츠 부재"로 동작해야 함(fragment `|| 0` 폴백, ruin 없는 맵에서 job 탐색이 자연히 스킵).
  마이그레이션 없음 정책 유지, **v(현 15) 올리지 않는다**.

## 9. 검증 계획 (수용 기준)

1. `npm run check:style` + **기존 sim-smoke 전체 무수정 통과** — 파생 시드 패스가 절대좌표를
   안 밀었다는 직접 증명(이 설계의 1급 수용 기준. 하나라도 깨지면 §3 위반 — 원인 수정, 기대값 갱신 금지).
2. sim-smoke 신규: ①폐허 3곳이 2번대륙 라벨 위에 생성 ②발굴 완료 시 골드+조각 지급·charges 감소
   ③짝수일 재생 ④골렘 처치 다음날 cap 까지 리스폰 ⑤restoreRelic 차감·유물 지급·전부 보유 시 환급
   ⑥세이브 왕복 후 fragment·ruin charges·golem 보존.
3. `npm run test:invariants` — 6시드×30일(골렘 무접촉으로 통과해야 정상).
4. GOALS 신규 1개: 「고고학자」(누적 발굴 N회 또는 복원 1회) — 레시피 5 + goals.js 판정 추가.
5. 브라우저: 폐허·골렘 스프라이트 실물 확인 — **에셋 선정 프로토콜(메모리) 준수**, 코드로 그리지
   말 것. 후보: Tiny Swords 기존 팩 내 구조물/골렘 유사 스프라이트 우선 탐색, 없으면 Kenney/Sunnyside.

## 10. 구현 웨이브 (Sonnet 세션용 — config·main 웨이브 격리)

1. **W1 config.js 단독**: RUIN·GOLEM·RESTORE + BUILDINGS 에 ruin 정의(레시피 1) + fragment 자원 등재(레시피 4-A).
2. **W2 world.js**: placeRuins(파생 시드)·islands 등록·골렘 초기 스폰·GUARD 맵 2곳·enemyStatFor·restoreRelic·dailyMineRegen 편입.
3. **W3 jobs.js/pawns.js**: 채굴 파이프라인에 ruin 편입 + 산출 분기(하드코딩 나열 지점 grep 전수 — RECIPES 마감검사).
4. **W4 main.js/ui.js**: 도서관 복원 버튼 + fragment 이름 매핑 4곳 + goals 1개. **W5**: 테스트(§9) + 에셋.
- 예상 3세션(W1~W2 / W3~W4 / W5). 각 웨이브 후 check:style, W3 후 test:sim.
- 구현 시 확정 필요(설계 미결): ①채굴 완료 산출 지급부·job 대상 나열의 정확한 위치 ②식인종 AI 의
  어그로·귀환 분기 위치 ③save.js 의 islands 직렬화 여부 ④도서관 UI 액션의 기존 패턴(onHostFeast 류) 모방.

# DESIGN-STORYTELLER.md — 사건 시스템 본격화(스토리텔러 라이트) 설계서

> ROADMAP 티어 2 「사건 시스템 본격화」의 구현 지시서. 2026-07-07 작성(설계: Fable 5).
> 구현 세션(Sonnet)은 이 문서 + RECIPES.md 레시피만 보고 작업할 수 있어야 한다.
> 파일럿(ceb4721)의 골격을 **확장**하는 설계다 — 갈아엎지 않는다.

---

## 1. 목표와 비목표

**목표**
1. 균등 추첨(`rollDailyEvent` 의 `ids[(rng()*len)|0]`)을 **긴장도 기반 가중 추첨**으로 교체.
2. 파일럿 잔여 관찰 문제(같은 사건 연속 편중)를 **쿨다운 + 직전 사건 감쇠**로 해결.
3. 사건 풀 3종 → **9종**(부정 3·긍정 3 신규). 모든 부정 사건에 config 명시 피해 상한.

**비목표(이번에 안 함)**
- 발생 빈도 변경 — `chancePerDay 0.3`·`minDay 3`·동시 활성 1개는 파일럿 그대로.
  긴장도는 "무엇이 오는가"를 정하지 "얼마나 자주"를 정하지 않는다(빈도 실측 5~9회/30일 유지).
- 스토리텔러 성격 3종(온화/표준/잔혹) — 티어 3. 단, 이 설계의 가중 함수에 프로파일 계수를
  곱하기만 하면 되도록 구조를 잡아 둔다(§4 kindMult 참고).
- 연쇄 사건·사건 그래프 — 제외.

---

## 2. 긴장도 모델 — 두 축: 체급 S 와 통증 P

림월드의 wealth-adaptation 모델의 축소판. 매일 아침(일 넘김) 계산.

### 체급 S (콜로니가 강할수록 1에 접근 → 강한 부정 사건 허용)
```
wealthGold = world.stock.gold + Σ world.stock[type] × TRADER.rates[type]   // 기존 매입가 테이블을 가치 프록시로 재사용
wealthNorm = min(1, wealthGold / ST.wealthCap)
popNorm    = min(1, aliveCnt / ST.popCap)
S = ST.wWealth × wealthNorm + ST.wPop × popNorm        // 기본 0.6 / 0.4
```
- `TRADER.rates` 에 없는 재고 타입은 0 가치로 무시(정확한 자산 평가가 목적이 아님).
- 신규 함수 `computeStrength(world, aliveCnt)` — world.js, 순수 함수(rng 무접촉).

### 통증 P (최근 피해 — 아픈 콜로니에는 부정 사건을 완충)
```
매일 아침:  world.pain = world.pain × ST.painDecay                 // 기본 0.65
사망 감지:  deaths = max(0, world.prevAliveCnt - aliveCnt)          // 훅 불필요 — 전일 대비 생존자 감소로 감지
            world.pain += deaths × ST.painPerDeath                  // 기본 0.35
습격 중:    if (world.raidActive) world.pain += ST.painPerRaidDay   // 기본 0.15
            world.pain = min(1, world.pain);  world.prevAliveCnt = aliveCnt
```
- **사망 훅을 새로 뚫지 않는다**(굶주림·동사·전투 사망 경로가 3곳이라 훅 방식은 누락 위험).
  일 넘김 시점의 생존자 수 차분만 쓴다 — 계약(ctx·enemyCbs) 무접촉.
- 신규 함수 `updatePain(world, aliveCnt)` — world.js. sim.js 일 넘김에서 `rollDailyEvent` **직전** 호출.

### 상수 (config.js 신규 `STORYTELLER` — SSOT)
```js
export const STORYTELLER = {
  wealthCap: 350, popCap: 10, wWealth: 0.6, wPop: 0.4, // 체급 S
  painDecay: 0.65, painPerDeath: 0.35, painPerRaidDay: 0.15, // 통증 P
  badBase: 0.35, badPerStrength: 0.65, badPainDamp: 0.8, // 부정 가중 = (badBase+badPerStrength*S)*(1-badPainDamp*P)
  goodPerPain: 0.9,       // 긍정 가중 = 1 + goodPerPain*P
  repeatPenalty: 0.25,    // 직전 사건과 같은 id 의 가중 배율(연속 편중 방지)
  cooldownDefault: 4,     // def.cooldown 미지정 시 재발 금지 일수
};
```
튜닝 근거: S=0(초반 빈곤) 시 부정 가중 0.35 → 긍정 위주 / S=1·P=0(풍족·무피해) 시 부정 1.0 으로
긍정과 동률 / P=1(대참사 직후) 시 부정 ×0.2·긍정 ×1.9 → 자비 모드. 수치는 소크로 재조정 가능.

---

## 3. 추첨 개편 — `rollDailyEvent` (world.js:1104 부근)

시그니처·반환 `{expired, started}`·호출 위치(sim.js 일 넘김, 현재 193행 부근)는 유지. 내부만 교체:

```
1. 만료 처리(기존 그대로) → 활성 사건 있으면 return
2. day < EVENTS.minDay → return (기존)
3. rng() >= EVENTS.chancePerDay → return (기존 — 빈도 불변. rng 소비 순서: 이 주사위가 항상 1번째)
4. 후보 필터: world.eventLastDay[id] 가 있고 day - lastDay < (def.cooldown ?? cooldownDefault) 면 제외
5. 가중치: w = def.weight × kindMult(def.kind, S, P) × (id === world.lastEventId ? repeatPenalty : 1)
   kindMult: 'bad' → (badBase + badPerStrength*S) * (1 - badPainDamp*P) / 'good' → 1 + goodPerPain*P
6. 가중 랜덤 픽(rng 1회 — catchFish 의 감산 루프 패턴 모방, config.js:669~675)
7. world.activeEvent = { id, endDay: day + def.days } (+ 사건별 부속 필드, §5)
   world.eventLastDay[id] = day;  world.lastEventId = id
```
- 후보가 전부 쿨다운이면 시작 없이 return(그날은 조용히 넘어감 — 빈도 하한을 억지로 지키지 않는다).
- **결정론**: rng 소비는 「주사위 1회 + 픽 1회(+사건별 초기화 소비)」. 후보 순서는
  `Object.keys(EVENTS.defs)` — config 선언 순서 고정이므로 결정적. createWorld 무접촉(파일럿 원칙 유지).
- S·P 는 이 함수가 파라미터로 받는다: `rollDailyEvent(world, rng, aliveCnt)` 로 확장하고
  내부에서 computeStrength/저장된 world.pain 사용(sim.js 호출부 1곳만 갱신).

---

## 4. 사건 정의 — EVENTS.defs 스키마 확장

기존 def 에 공통 필드 추가: `kind`('good'|'bad'), `weight`(기본 가중), `cooldown`(일, 생략 시 기본 4).
기존 3종은 필드만 얹는다(효과 무변경): peddler(good·w3·cd3) · wolfseason(bad·w3·cd4) · tailwind(good·w3·cd3).

### 신규 부정 3종 — 「판을 흔들되 즉사시키지 않는다」: 상한을 def 에 명시
| id | 이름 | 지속 | 효과 | 피해 상한(config 필드) |
|----|------|:---:|------|------|
| `plague` | 🤒 전염병 | 3일 | 무작위 정착민 병듦 → 작업속도 ×`workMult:0.5` | `sickRatio:0.4`(최대 40%, 최소 1명). **사망 없음 — 감속만** |
| `blight` | 🐛 곡물 병충해 | 1일(즉발) | 자라는 작물 일부 시듦(제거) | `cropRatio:0.3`(최대 30%). **ready(수확 대기) 작물은 면제** — 수확 직전 전멸 방지 |
| `thief` | 🥷 도적 잠입 | 1일(즉발) | 재고 소량 도난 | 자원별 `min(재고×stealRatio:0.1, stealMax:8)`, 금은 `min(재고×0.1, goldMax:15)` |

### 신규 긍정 3종
| id | 이름 | 지속 | 효과 | 적용 지점(실측 확인 완료) |
|----|------|:---:|------|------|
| `caravan` | 🚚 유랑단 지원 | 2일 | 고용비 반값(`hireMult:0.5`) | `hireCost()` config.js:541 — 호출부에서 사건 배율 적용(§5) |
| `ironvein` | ⛏️ 철 노두 발견 | 2일 | 철 채굴 산출 ×`ironMult:2` | 철 채굴 산출 지급부(FUNCTIONS.md 에서 채굴 job 완료 처리 검색) |
| `bounty` | 🐟 풍어기 | 2일 | 낚시 작업시간 ×`workMult:0.5` + 희귀 보정 `rareBonus:+1` | `FISHING.work` 소비부 pawns.js:304 · `catchFish(bonus)` config.js:669 |

- 즉발형(blight·thief)은 `days:1` + 시작 시점 1회 효과. 지속형과 동일한 수명 관리(다음날 아침 만료)라
  특수 케이스가 없다.
- msg 는 파일럿 톤(존댓말 안내 + 행동 지침 한 줄) 유지. 부정 사건은 `onToast(…, true)` 경고색.

---

## 5. 효과 적용 방식 — 파일럿 패턴 준수 (지점별 activeEvent 검사)

`tradeRate`(world.js:1126)·`tickCrops`(world.js:1135) 가 확립한 패턴: **효과는 소비 지점에서
`world.activeEvent` 를 검사**한다. 이벤트 시스템이 게임 코드를 호출하지 않는다(결합 최소).

- **지속형 배율**(caravan·ironvein·bounty·plague): 각 소비 지점에 2~3줄 검사 추가.
  - plague: pawns.js:964 의 작업량 감산식에 배율 항 1개 추가 — 병든 pawn 판정은
    `world.activeEvent.sickIds`(pawn.id 배열) 포함 여부.
  - caravan: `hireCost` 는 순수 함수로 유지(world 를 모름) — **호출부**(main.js/ui.js 에서
    `hireCost` 검색)에서 배율을 곱한다. UI 표시 가격도 같은 경로라 자동 반영되는지 확인할 것.
- **즉발형**(blight·thief) + plague 대상 선정: 신규 함수 `applyEventStart(world, pawns, def, rng)`
  (world.js) 에 모은다. `rollDailyEvent` 가 started 를 반환하면 sim.js 가 이어서 호출:
  ```
  var dev = rollDailyEvent(world, rng, aliveCnt);
  if (dev.started) { var detail = applyEventStart(world, pawns, dev.started, rng); /* 토스트에 detail 병합 */ }
  ```
  - 반환값 detail(예: "목재 6·철 3을 도둑맞았습니다")을 기존 토스트 msg 뒤에 붙인다.
  - **rng 주의**: applyEventStart 의 rng 소비량은 사건 종류에 따라 다르다 — 상관없음(ambient 는
    소비 순서만 결정적이면 됨). 단 crops/재고 순회는 배열·고정 키 순서로(Object.keys(stock) 대신
    config 의 자원 목록 순서 사용 — 직렬화 왕복 후에도 순서 보장).
  - blight 는 시든 타일마다 `ctx.onCropChange`(또는 기존 작물 제거 경로의 콜백)를 방출해야
    렌더가 갱신된다 — tickCrops 만료 처리의 기존 콜백 경로를 모방.

---

## 6. 상태·세이브 (save.js — 필드 화이트리스트 방식 확인 완료)

신규 world 필드 4개. `createWorld` 초기화 + save.js 직렬화 목록(37행 activeEvent 옆) + 로드 폴백:
| 필드 | 타입 | 초기값 | 로드 폴백 |
|------|------|------|------|
| `pain` | number | 0 | `|| 0` |
| `prevAliveCnt` | number | 시작 인구 | `|| 0`(다음 아침 자연 보정) |
| `eventLastDay` | {id:day} | `{}` | `|| {}` |
| `lastEventId` | string\|null | null | `|| null` |
- `activeEvent` 는 통째 직렬화라 `sickIds` 부속 필드 자동 보존 — 추가 작업 없음.
- **v 버전(현 v15) 올리지 않는다** — 전부 폴백 안전한 필드 추가(ARCHITECTURE 세이브 규칙 부합).
- 긴장도 S 는 저장하지 않는다(매일 재계산 — 파생값).

---

## 7. 검증 계획 (수용 기준)

1. `npm run check:style` — world.js 신규 함수 var+function·Math.random 금지 준수.
2. **sim-smoke 신규 시나리오** (파일럿 58번 스타일, 사건 강제 상태 주입):
   - 가중 추첨: `pain=1` 강제 후 N일 굴려 부정 사건 0~희소 확인 / `stock.gold=400` 부유 상태에서 부정 비중 상승 확인(시드 고정 단언).
   - 쿨다운: 같은 사건이 cooldown 내 재발하지 않음 + 직전 사건 연속 발생률 감소(파일럿 잔여 관찰 해소 증명).
   - 사건별 효과 6종: 상한 준수(blight ≤30%·ready 면제, thief 상한, plague 사망 0) + 만료 시 원상복귀.
   - 세이브 왕복: 사건 활성 중 저장→로드 후 sickIds·eventLastDay 보존.
3. `npm run test:invariants` — 6시드×30일 전멸 없음(사건이 전멸 원인이 되면 상한 재조정).
4. 빈도 실측: 30일 발생 횟수 5~9회 유지(파일럿 실측과 동일 방법).

## 8. 구현 웨이브 (Sonnet 세션용 — config·main 은 웨이브 격리 규칙 준수)

1. **W1 config.js 단독**: STORYTELLER 신설 + EVENTS.defs 확장(9종·공통 필드). 다른 파일 무접촉.
2. **W2 world.js**: computeStrength·updatePain·rollDailyEvent 개편·applyEventStart + ironvein/bounty/tradeRate 류 소비 지점.
3. **W3 pawns.js**: 964행 감산식 plague 항 + FISHING.work(304행) bounty 항.
4. **W4 sim.js + save.js**: 일 넘김 훅(updatePain→rollDailyEvent→applyEventStart) + 직렬화 4필드.
5. **W5 main.js/ui.js**: hireCost 호출부 배율 + (선택) HUD 활성 사건 배지. **W6 tests**: §7.
- 예상 규모 2세션(W1~W4 / W5~W6). 각 웨이브 후 check:style, W4 후 test:sim 필수.
- 구현 시 확정 필요(설계 미결): ①철 채굴 산출 지급부 위치(FUNCTIONS.md 검색) ②blight 의 작물 제거
  콜백 경로 ③hireCost 호출부가 몇 곳인지(grep 으로 전수 확인 — 이름 매핑 누락 패턴 주의).

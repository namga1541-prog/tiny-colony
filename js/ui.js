// DOM HUD: 도구·시계·자원·정착민 패널·토스트·커스터마이징 모달·연구/제작 모달
import { taskLabel } from './pawns.js';
import { HUMANS, RESEARCH, WEAPONS, ARMOR, SKILL_LABEL, skillLevel, BUILDS, STORAGE, RODS, WAREHOUSE_TIERS, ROLES, RANKS, BUILD_MIN_RANK, DEFENSE_TIERS, OUTPOST_BRANCHES, RELICS, INVASION, TRADER, DAY_MIN, GLORIOUS_FOOD } from './config.js';
import { totalRes, warehouseTier, warehouseCap, maxPop, rankReqStatus, defenseStats, seasonDef } from './world.js';

export function createUI(handlers) {
  var tool = 'select';
  var world = handlers.world;

  // 도구 버튼
  var toolBtns = document.querySelectorAll('.tool');
  function setTool(name) {
    tool = name;
    toolBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.tool === name); });
    if (handlers.onToolChange) handlers.onToolChange(tool);
  }
  toolBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      // 이미 활성인 도구를 다시 누르면 선택 도구로 되돌림(취소)
      if (btn.dataset.tool === tool && tool !== 'select') setTool('select');
      else setTool(btn.dataset.tool);
    });
  });

  // 대제목 탭(도구·건설·관리) → 해당 소제목 그룹만 표시
  var toolCats = document.querySelectorAll('.tool-cat');
  var toolGroups = document.querySelectorAll('.tool-group');
  toolCats.forEach(function (cat) {
    cat.addEventListener('click', function () {
      var c = cat.dataset.cat;
      toolCats.forEach(function (x) { x.classList.toggle('active', x === cat); });
      toolGroups.forEach(function (g) { g.classList.toggle('hidden', g.dataset.cat !== c); });
    });
  });

  // 속도 버튼
  var spdBtns = document.querySelectorAll('.spd');
  spdBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      handlers.onSpeed(+btn.dataset.speed);
    });
  });
  function setSpeedUI(speed) {
    spdBtns.forEach(function (b) {
      b.classList.toggle('active', +b.dataset.speed === speed);
    });
  }

  document.getElementById('btnSave').addEventListener('click', handlers.onSave);
  document.getElementById('btnLoad').addEventListener('click', handlers.onLoad);
  document.getElementById('btnNew').addEventListener('click', handlers.onNew);
  document.getElementById('btnEditPawn').addEventListener('click', function () {
    if (handlers.onEditPawn) handlers.onEditPawn();
  });
  var btnAutoAttackTop = document.getElementById('btnAutoAttack');
  if (btnAutoAttackTop) btnAutoAttackTop.addEventListener('click', function () {
    if (handlers.onToggleAutoAttack) handlers.onToggleAutoAttack();
  });
  document.getElementById('btnResearch').addEventListener('click', showResearch);
  document.getElementById('btnCraft').addEventListener('click', showCraft);
  var btnShop = document.getElementById('btnShop');
  if (btnShop) btnShop.addEventListener('click', showShop);
  var btnFeast = document.getElementById('btnFeast');
  if (btnFeast) btnFeast.addEventListener('click', function () {
    if (handlers.onHostFeast) handlers.onHostFeast();
  });
  document.getElementById('btnGoals').addEventListener('click', function () {
    if (handlers.onShowGoals) handlers.onShowGoals();
  });
  var btnUpg = document.getElementById('btnUpgrades');
  if (btnUpg) btnUpg.addEventListener('click', function () {
    if (handlers.onShowUpgrades) handlers.onShowUpgrades();
  });
  var btnDev = document.getElementById('btnDev');
  if (btnDev) btnDev.addEventListener('click', showDevelopment);
  var btnRelics = document.getElementById('btnRelics');
  if (btnRelics) btnRelics.addEventListener('click', showRelics);
  var btnDiscard = document.getElementById('btnDiscard');
  if (btnDiscard) btnDiscard.addEventListener('click', showDiscard);
  var btnTrader = document.getElementById('btnTrader');
  if (btnTrader) btnTrader.addEventListener('click', showTrader);
  var btnAutoEquip = document.getElementById('btnAutoEquip');
  if (btnAutoEquip) btnAutoEquip.addEventListener('click', function () {
    if (handlers.onToggleAutoEquip) handlers.onToggleAutoEquip();
  });
  function updateAutoEquipBtn() {
    if (!btnAutoEquip) return;
    btnAutoEquip.textContent = world.autoEquip ? '🗡️ 자동무장: 켜짐' : '🗡️ 자동무장: 꺼짐';
    btnAutoEquip.classList.toggle('eq-active', !!world.autoEquip);
  }
  updateAutoEquipBtn();
  var btnCancelAll = document.getElementById('btnCancelAll');
  if (btnCancelAll) btnCancelAll.addEventListener('click', function () {
    if (handlers.onCancelAll) handlers.onCancelAll();
  });
  refreshLocks(); // 초기 건물 잠금 표시

  // 발전 단계 미달 건물 버튼 흐리게 표시
  function refreshLocks() {
    var rank = world.rank || 0;
    var btns = document.querySelectorAll('#toolbar .tool[data-tool]');
    for (var i = 0; i < btns.length; i++) {
      var k = btns[i].dataset.tool;
      var def = BUILDS[k];
      var locked = (BUILD_MIN_RANK[k] || 0) > rank || (def && def.escapePart && !world.invasionWon);
      btns[i].classList.toggle('locked', locked);
    }
    var btnTrader = document.getElementById('btnTrader');
    if (btnTrader) btnTrader.classList.toggle('locked', !world.traderActive);
  }
  var btnHire = document.getElementById('btnHire');
  btnHire.addEventListener('click', function () {
    if (handlers.onHire) handlers.onHire();
  });
  function setHireInfo(label, disabled) {
    btnHire.textContent = label;
    btnHire.style.opacity = disabled ? '0.5' : '1';
  }

  // 시계·자원
  var dayLabel = document.getElementById('dayLabel');
  var timeLabel = document.getElementById('timeLabel');
  var resWood = document.getElementById('resWood');
  var resGold = document.getElementById('resGold');
  var resIron = document.getElementById('resIron');
  var resFood = document.getElementById('resFood');
  var resMeal = document.getElementById('resMeal');
  var resLeather = document.getElementById('resLeather');
  var resMeat = document.getElementById('resMeat');
  var resWool = document.getElementById('resWool');
  var resDelicacy = document.getElementById('resDelicacy');
  var resPop = document.getElementById('resPop');

  function updateClock(day, timeMin) {
    var m = Math.floor(timeMin % 1440);
    var hh = String((m / 60) | 0).padStart(2, '0');
    var mm = String(m % 60).padStart(2, '0');
    dayLabel.textContent = day + '일차';
    timeLabel.textContent = hh + ':' + mm;
  }

  // ── 대침공 예고 카운트다운 — 발동 8시간 전부터 상단에 지속 표시(습격처럼 매번 뜨는 1회성 토스트와 별개) ──
  var invasionWarn = document.getElementById('invasionWarn');
  var INVASION_WARN_LEAD_MIN = 480;
  function updateInvasionWarning(world) {
    if (!invasionWarn) return;
    if (!world.invasion || world.invasion.phase !== 'countdown') { invasionWarn.classList.add('hidden'); return; }
    var triggerAt = (world.invasion.triggerDay - 1) * DAY_MIN + INVASION.spawnHour * 60;
    var remain = triggerAt - world.timeMin;
    if (remain <= 0 || remain > INVASION_WARN_LEAD_MIN) { invasionWarn.classList.add('hidden'); return; }
    var hh = (remain / 60) | 0, mm = (remain % 60) | 0;
    invasionWarn.textContent = '⚠️ 대침공 임박 — ' + hh + '시간 ' + String(mm).padStart(2, '0') + '분 후';
    invasionWarn.classList.remove('hidden');
  }

  var resStorage = document.getElementById('resStorage');
  function updateRes(sum, alivePawns) {
    resWood.textContent = sum.wood || 0;
    resGold.textContent = sum.gold || 0;
    if (resIron) resIron.textContent = sum.iron || 0;
    resFood.textContent = sum.food || 0;
    if (resMeal) resMeal.textContent = (sum.meal || 0) + (sum.mealVeg || 0) + (sum.mealGood || 0) + (sum.mealFeast || 0) + (sum[GLORIOUS_FOOD.id] || 0);
    if (resLeather) resLeather.textContent = sum.leather || 0;
    if (resMeat) resMeat.textContent = sum.meat || 0;
    if (resWool) resWool.textContent = sum.wool || 0;
    if (resDelicacy) resDelicacy.textContent = sum.delicacy || 0;
    resPop.textContent = alivePawns;
  }
  function updateStorage(used, cap) {
    if (!resStorage) return;
    resStorage.textContent = Math.round(used) + '/' + cap;
    // 가득 참=주황, 90%↑=노랑(미리 경고), 그 외 기본색
    var ratio = cap > 0 ? used / cap : 0;
    resStorage.style.color = ratio >= 1 ? '#ff9a5c' : (ratio >= 0.9 ? '#ffd76e' : '#e8eaf0');
  }

  // ── 정착민 명단 (7) ──
  var rosterHost = document.getElementById('roster');
  function updateRoster(pawns, controlled) {
    if (!rosterHost) return;
    // 행 수가 바뀌면 재생성
    if (rosterHost.childElementCount !== pawns.length) {
      rosterHost.innerHTML = '';
      pawns.forEach(function (p, n) {
        var row = document.createElement('div');
        row.className = 'roster-row';
        row.innerHTML = '<span class="rn"></span><span class="roster-hp"><div></div></span>';
        row.addEventListener('click', function () {
          window.dispatchEvent(new CustomEvent('roster-select', { detail: n }));
        });
        rosterHost.appendChild(row);
      });
    }
    for (var n = 0; n < pawns.length; n++) {
      var p = pawns[n];
      var row = rosterHost.children[n];
      if (!row) continue;
      var selected = controlled && controlled.indexOf(p) >= 0;
      row.className = 'roster-row' + (p.state === 'dead' ? ' dead' : '') + (selected ? ' sel' : '');
      row.querySelector('.rn').textContent = p.name;
      row.querySelector('.roster-hp > div').style.width = Math.max(0, Math.round(p.hp / (p.maxHp || 100) * 100)) + '%';
    }
  }

  // 우하단 이벤트 피드
  var feedHost = document.getElementById('eventFeed');
  function addEvent(msg) {
    var el = document.createElement('div');
    el.className = 'feed-line';
    el.textContent = msg;
    feedHost.appendChild(el);
    while (feedHost.children.length > 4) feedHost.removeChild(feedHost.firstChild);
    setTimeout(function () {
      el.style.opacity = '0.35';
    }, 12000);
  }

  // 정착민 패널
  var panel = document.getElementById('pawnPanel');
  var pawnName = document.getElementById('pawnName');
  var pawnTask = document.getElementById('pawnTask');
  var barHunger = document.getElementById('barHunger');
  var barHp = document.getElementById('barHp');
  var barMood = document.getElementById('barMood');
  var barCold = document.getElementById('barCold');
  var needCold = document.getElementById('needCold');
  var pawnTrait = document.getElementById('pawnTrait');
  var pawnSkills = document.getElementById('pawnSkills');
  var pawnRole = document.getElementById('pawnRole');
  var pawnEquip = document.getElementById('pawnEquip');
  var btnAutoAttack = document.getElementById('btnAutoAttack');

  function showPawn(pawn) {
    panel.classList.remove('hidden');
    updatePawnPanel(pawn);
  }
  function hidePawn() {
    panel.classList.add('hidden');
  }
  function updatePawnPanel(pawn) {
    var rdef = ROLES[pawn.role] || ROLES.none;
    pawnName.textContent = (pawn.role && pawn.role !== 'none' ? rdef.icon + ' ' : '') + pawn.name;
    pawnTask.textContent = taskLabel(pawn);
    barHunger.style.width = pawn.hunger + '%';
    barHp.style.width = (pawn.hp / (pawn.maxHp || 100) * 100) + '%';
    barMood.style.width = Math.round(pawn.mood) + '%';
    // 체온 바: 겨울이거나 아직 냉기가 남아있으면 표시. 표시값 = 따뜻함(100-cold) → 다른 바처럼 가득참=양호.
    if (needCold && barCold) {
      var showCold = seasonDef(world).cold || (pawn.cold || 0) > 0;
      needCold.classList.toggle('hidden', !showCold);
      if (showCold) barCold.style.width = (100 - (pawn.cold || 0)) + '%';
    }
    pawnTrait.textContent = pawn.trait && pawn.trait.id !== 'none'
      ? '✦ ' + pawn.trait.name + ' — ' + pawn.trait.desc : '';
    // 스킬: 레벨 1 이상인 것만 표시
    if (pawnSkills) {
      var sk = pawn.skills || {};
      var parts = [];
      for (var key in SKILL_LABEL) {
        var lv = skillLevel(sk[key]);
        if (lv > 0) parts.push(SKILL_LABEL[key] + ' Lv' + lv);
      }
      pawnSkills.textContent = parts.length ? '🛠️ ' + parts.join(' · ') : '';
    }
    // 역할 선택 버튼 (사망 시 숨김)
    if (pawnRole) {
      pawnRole.innerHTML = '';
      if (pawn.state !== 'dead') {
        Object.keys(ROLES).forEach(function (key) {
          var rd = ROLES[key];
          var btn = document.createElement('button');
          btn.textContent = rd.icon + (key === 'none' ? '' : ' ' + rd.name);
          btn.title = rd.name;
          if ((pawn.role || 'none') === key) btn.classList.add('role-active');
          btn.addEventListener('click', function () {
            if (handlers.onSetRole) handlers.onSetRole(pawn, key);
          });
          pawnRole.appendChild(btn);
        });
      }
    }
    pawnEquip.innerHTML = '';
    if (pawn.state !== 'dead') {
      var res = totalRes(world);
      var wlabels = { sword: '🗡️검', bow: '🏹활', ironSword: '⚔️강철검', ironBow: '🎯강철활' };
      var list = ['sword', 'bow'];
      if (world.research.unlocked.steel) list.push('ironSword', 'ironBow');
      list.forEach(function (wt) {
        if ((res[wt] || 0) <= 0 && pawn.equipped !== wt) return; // 보유/장착한 것만 표시
        var btn = document.createElement('button');
        btn.textContent = wlabels[wt] + ' (' + (res[wt] || 0) + ')';
        if (pawn.equipped === wt) btn.classList.add('eq-active');
        btn.addEventListener('click', function () {
          if (handlers.onEquip) handlers.onEquip(pawn, wt);
        });
        pawnEquip.appendChild(btn);
      });
      if (!pawnEquip.children.length) {
        pawnEquip.innerHTML = '<span style="font-size:11px;color:#8d94a8">무기 없음 (⚒️ 제작에서 검·활 제작)</span>';
      }
      var alabels = { leatherArmor: '🥼가죽갑옷', ironArmor: '🛡️강철갑옷' };
      var alist = ['leatherArmor'];
      if (world.research.unlocked.steel) alist.push('ironArmor');
      alist.forEach(function (at) {
        if ((res[at] || 0) <= 0 && pawn.armor !== at) return;
        var btn = document.createElement('button');
        btn.textContent = alabels[at] + ' (' + (res[at] || 0) + ')';
        if (pawn.armor === at) btn.classList.add('eq-active');
        btn.addEventListener('click', function () {
          if (handlers.onEquipArmor) handlers.onEquipArmor(pawn, at);
        });
        pawnEquip.appendChild(btn);
      });
    }
    if (btnAutoAttack) {
      if (pawn.state === 'dead') {
        btnAutoAttack.style.display = 'none';
      } else {
        btnAutoAttack.style.display = '';
        btnAutoAttack.textContent = pawn.autoAttack ? '⚔️ 자동공격: 켜짐' : '⚔️ 자동공격: 꺼짐';
        btnAutoAttack.classList.toggle('eq-active', !!pawn.autoAttack);
      }
    }
  }

  // ── 건물 정보 패널 ──
  var buildPanel = document.getElementById('buildPanel');
  var bpName = document.getElementById('bpName');
  var bpDesc = document.getElementById('bpDesc');
  var bpStats = document.getElementById('bpStats');
  function showBuilding(b) {
    var def = BUILDS[b.kind];
    var isMineB = b.kind === 'goldmine' || b.kind === 'ironmine';
    bpName.textContent = (def ? def.name : (b.kind === 'goldmine' ? '금광' : b.kind === 'ironmine' ? '철광' : b.kind))
      + (b.stage === 'bp' ? ' (공사 중)' : '');
    bpDesc.textContent = def && def.desc ? def.desc
      : isMineB ? '채굴하면 ' + (b.kind === 'ironmine' ? '철' : '금') + '을 얻습니다. 매일 매장량이 조금씩 회복됩니다.'
      : (b.kind === 'bridge' ? '물 위를 건널 수 있습니다.' : '');
    var lines = [];
    if (def && def.attack) {
      var ds = defenseStats(b);
      if (b.branch && OUTPOST_BRANCHES[b.branch]) {
        var brInfo = OUTPOST_BRANCHES[b.branch];
        lines.push(brInfo.icon + ' <b>' + brInfo.name + '</b> · ' + (b.tier || 1) + '단계 · ' + (brInfo.role === 'melee' ? '근접' : '원거리'));
      } else if (b.kind === 'outpost') {
        lines.push('🛡️ <b>기본 초소</b> · 특화 전');
      }
      lines.push('⚔️ 공격력 <b>' + ds.power + '</b>' + (ds.aoe > 0 ? ' 💥광역(반경 ' + ds.aoe + ')' : ''));
      var tierN = (DEFENSE_TIERS[b.kind] && !b.branch && b.kind !== 'outpost') ? (b.tier || 1) : null;
      lines.push('🎯 사거리 <b>' + ds.range + '</b> · ⏱️ 쿨 <b>' + ds.cd + '</b>' + (tierN ? ' · ' + tierN + '단계' : ''));
    }
    if (b.kind === 'warehouse' && b.stage === 'built') {
      lines.push('📦 저장 용량 <b>+' + warehouseCap(b) + '</b> (' + warehouseTier(b) + '단계)');
    }
    if (isMineB) {
      var max = b.maxCharges || 0;
      lines.push(b.depleted ? '⛏️ <b>고갈</b> (회복 중)' : '⛏️ 남은 매장량 <b>' + Math.round(b.charges || 0) + (max ? '/' + max : '') + '</b>');
    }
    if (b.kind === 'ranch') lines.push('🌾 식량·양 자동 생산');
    if (b.kind === 'clinic') lines.push('🏥 부상자 회복소');
    if (def && def.cost) {
      var cs = Object.keys(def.cost).map(function (t) {
        return ({ wood: '목재', gold: '금', iron: '철' }[t] || t) + ' ' + def.cost[t];
      }).join(', ');
      lines.push('🔨 건설 비용: ' + cs);
    }
    bpStats.innerHTML = lines.join('<br>');

    // 창고 업그레이드 버튼 (완공된 창고만)
    var oldUp = bpStats.parentNode.querySelector('.bp-upgrade');
    if (oldUp) oldUp.remove();
    if (b.kind === 'warehouse' && b.stage === 'built') {
      var curTier = warehouseTier(b);
      var next = WAREHOUSE_TIERS[curTier]; // 0-based: 다음 단계
      var upWrap = document.createElement('div');
      upWrap.className = 'bp-upgrade';
      upWrap.style.marginTop = '8px';
      if (!next) {
        upWrap.innerHTML = '<span style="font-size:12px;color:#8d94a8">최대 단계</span>';
      } else {
        var costStr2 = Object.keys(next.cost).map(function (t) {
          return ({ wood: '목재', gold: '금', iron: '철' }[t] || t) + ' ' + next.cost[t];
        }).join(', ');
        var btn = document.createElement('button');
        btn.textContent = '🔼 업그레이드 (' + costStr2 + ')  ⌨F';
        btn.addEventListener('click', function () {
          if (handlers.onUpgradeWarehouse) handlers.onUpgradeWarehouse(b);
        });
        upWrap.appendChild(btn);
      }
      bpStats.parentNode.appendChild(upWrap);
    } else if (b.kind === 'outpost' && !b.branch && b.stage === 'built') {
      // 초소 미분기 → 근접/원거리 4갈래 특화 선택 버튼
      var upWrapS = document.createElement('div');
      upWrapS.className = 'bp-upgrade bp-branch';
      upWrapS.style.marginTop = '8px';
      upWrapS.innerHTML = '<div style="font-size:11px;color:#8d94a8;margin-bottom:4px">🔀 특화 선택 (근접/원거리)</div>';
      Object.keys(OUTPOST_BRANCHES).forEach(function (bid) {
        var brx = OUTPOST_BRANCHES[bid];
        var t1x = brx.tiers[0];
        var cstx = Object.keys(t1x.cost).map(function (t) {
          return ({ wood: '목재', gold: '금', iron: '철' }[t] || t) + ' ' + t1x.cost[t];
        }).join(', ');
        var bbtn = document.createElement('button');
        bbtn.textContent = brx.icon + ' ' + brx.name + ' (' + cstx + ')';
        bbtn.title = brx.desc;
        bbtn.addEventListener('click', function () {
          if (handlers.onUpgradeBuilding) handlers.onUpgradeBuilding(b, bid);
        });
        upWrapS.appendChild(bbtn);
      });
      bpStats.parentNode.appendChild(upWrapS);
    } else if (b.branch && OUTPOST_BRANCHES[b.branch] && b.stage === 'built') {
      // 특화된 초소 → 분기 자체 tier 강화
      var brc = OUTPOST_BRANCHES[b.branch];
      var nextC = brc.tiers[b.tier || 1]; // 0-based: 다음 단계
      var upWrapC = document.createElement('div');
      upWrapC.className = 'bp-upgrade';
      upWrapC.style.marginTop = '8px';
      if (!nextC) {
        upWrapC.innerHTML = '<span style="font-size:12px;color:#8d94a8">최대 단계</span>';
      } else {
        var cstc = Object.keys(nextC.cost).map(function (t) {
          return ({ wood: '목재', gold: '금', iron: '철' }[t] || t) + ' ' + nextC.cost[t];
        }).join(', ');
        var bcbtn = document.createElement('button');
        bcbtn.textContent = '🔼 강화 (' + cstc + ')  ⌨F';
        bcbtn.addEventListener('click', function () {
          if (handlers.onUpgradeBuilding) handlers.onUpgradeBuilding(b);
        });
        upWrapC.appendChild(bcbtn);
      }
      bpStats.parentNode.appendChild(upWrapC);
    } else if (DEFENSE_TIERS[b.kind] && b.stage === 'built') {
      var tiers = DEFENSE_TIERS[b.kind];
      var curTierD = b.tier || 1;
      var nextD = tiers[curTierD]; // 0-based: 다음 단계
      var upWrapD = document.createElement('div');
      upWrapD.className = 'bp-upgrade';
      upWrapD.style.marginTop = '8px';
      if (!nextD) {
        upWrapD.innerHTML = '<span style="font-size:12px;color:#8d94a8">최대 단계</span>';
      } else {
        var lockedD = nextD.minRank !== undefined && (world.rank || 0) < nextD.minRank;
        var cstD = Object.keys(nextD.cost).map(function (t) {
          return ({ wood: '목재', gold: '금', iron: '철' }[t] || t) + ' ' + nextD.cost[t];
        }).join(', ');
        var btnD = document.createElement('button');
        if (lockedD) {
          btnD.textContent = '🔒 ' + RANKS[nextD.minRank].name + ' 단계 필요' + (nextD.cannon ? ' (대포)' : '');
          btnD.disabled = true;
        } else {
          btnD.textContent = (nextD.cannon ? '💥 대포 장착 (' : '🔼 강화 (') + cstD + ')  ⌨F';
          btnD.addEventListener('click', function () {
            if (handlers.onUpgradeBuilding) handlers.onUpgradeBuilding(b);
          });
        }
        upWrapD.appendChild(btnD);
      }
      bpStats.parentNode.appendChild(upWrapD);
    }
    buildPanel.classList.remove('hidden');
  }
  function hideBuilding() { buildPanel.classList.add('hidden'); }

  // 토스트
  var toastHost = document.getElementById('toastHost');
  function toast(msg, warn) {
    var el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.4s';
      setTimeout(function () { el.remove(); }, 450);
    }, 2600);
  }

  // ── 커스터마이징 모달 (새 게임: 여러 명 / 편집: 한 명) ──
  function showCustomize(pawnList, title, onDone) {
    var old = document.getElementById('customModal');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'customModal';
    overlay.innerHTML = '<div class="cm-box"><h2>' + title + '</h2><div class="cm-rows"></div>' +
      '<div class="cm-actions"><button class="cm-ok">✅ 확정하고 시작</button></div></div>';
    var rowsHost = overlay.querySelector('.cm-rows');
    var picks = [];

    pawnList.forEach(function (pawn, n) {
      var pick = { name: pawn.name, human: (pawn.look && pawn.look.human) || 'villager' };
      picks.push(pick);
      var row = document.createElement('div');
      row.className = 'cm-row';
      var nameWrap = document.createElement('div');
      nameWrap.className = 'cm-name';
      var input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 8;
      input.value = pawn.name;
      input.placeholder = '이름';
      input.addEventListener('input', function () { pick.name = input.value; });
      nameWrap.appendChild(input);
      row.appendChild(nameWrap);

      var grid = document.createElement('div');
      grid.className = 'cm-grid';
      Object.keys(HUMANS).forEach(function (hid) {
        var btn = document.createElement('button');
        btn.className = 'cm-look';
        btn.title = HUMANS[hid].label;
        // Idle.png(64x16, 4방향) 의 정면(0열)만 보이게 확대 표시
        var scale = 58 / 16;
        btn.style.backgroundImage = 'url(assets/ninja/' + HUMANS[hid].dir + '/Idle.png)';
        btn.style.backgroundSize = (64 * scale) + 'px auto';
        btn.style.backgroundPosition = '0 0';
        btn.style.imageRendering = 'pixelated';
        if (hid === pick.human) btn.classList.add('sel');
        btn.addEventListener('click', function () {
          pick.human = hid;
          grid.querySelectorAll('.cm-look').forEach(function (b) { b.classList.remove('sel'); });
          btn.classList.add('sel');
        });
        grid.appendChild(btn);
      });
      row.appendChild(grid);
      rowsHost.appendChild(row);
      if (n === 0) setTimeout(function () { input.select(); }, 50);
    });

    overlay.querySelector('.cm-ok').addEventListener('click', function () {
      pawnList.forEach(function (pawn, n) {
        var pk = picks[n];
        var nm = (pk.name || '').trim();
        if (nm) pawn.name = nm;
        pawn.look = { human: pk.human };
      });
      overlay.remove();
      if (onDone) onDone();
    });

    document.body.appendChild(overlay);
  }

  function openModal(innerHtml) {
    var old = document.getElementById('customModal');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'customModal';
    overlay.innerHTML = '<div class="cm-box">' + innerHtml + '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  // ── 연구 모달 ──
  function showResearch() {
    var overlay = openModal('<h2>📚 연구</h2><div class="rs-rows"></div>' +
      '<div class="cm-actions"><button class="cm-ok rs-close">닫기</button></div>');
    var rows = overlay.querySelector('.rs-rows');

    function render() {
      rows.innerHTML = '';
      var pts = Math.floor(world.research.points);
      var head = document.createElement('p');
      head.style.marginBottom = '10px';
      head.textContent = '보유 연구 포인트: ' + pts + ' (정착민이 시간이 지나면 자동으로 모읍니다)';
      rows.appendChild(head);
      Object.keys(RESEARCH).forEach(function (key) {
        var def = RESEARCH[key];
        var done = !!world.research.unlocked[key];
        var item = document.createElement('div');
        item.className = 'rs-item';
        var pct = Math.min(100, Math.round((world.research.points / def.cost) * 100));
        item.innerHTML = '<h3>' + def.name + '</h3><p>' + def.desc + '</p>' +
          (done ? '<div class="rs-done">✅ 연구 완료</div>' :
            '<div class="rs-bar"><div class="rs-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<button class="rs-unlock" ' + (world.research.points < def.cost ? 'disabled' : '') + '>' +
            '해금 (' + def.cost + '점 필요, 현재 ' + pts + ')</button>');
        rows.appendChild(item);
        if (!done) {
          item.querySelector('.rs-unlock').addEventListener('click', function () {
            if (handlers.onUnlockResearch) handlers.onUnlockResearch(key);
            render();
          });
        }
      });
    }
    render();
    overlay.querySelector('.rs-close').addEventListener('click', function () { overlay.remove(); });
  }

  // ── 발전 단계 모달 (무리→집단→마을→도시→나라) ──
  function showDevelopment() {
    var overlay = openModal('<h2>🏛️ 콜로니 발전</h2><div class="dev-body"></div>' +
      '<div class="cm-actions"><button class="cm-ok dev-close">닫기</button></div>');
    var body = overlay.querySelector('.dev-body');
    function render() {
      var rank = world.rank || 0;
      var alive = handlers.getAlive ? handlers.getAlive() : 0;
      var cur = RANKS[rank];
      var ladder = RANKS.map(function (r, i) {
        var cls = i < rank ? 'done' : (i === rank ? 'cur' : 'future');
        return '<div class="dev-rung ' + cls + '"><span class="dev-ic">' + r.icon + '</span>' + r.name + '</div>';
      }).join('<span class="dev-arrow">›</span>');
      var html = '<div class="dev-ladder">' + ladder + '</div>';
      html += '<p class="dev-cur">현재 단계: <b>' + cur.icon + ' ' + cur.name + '</b> · 인구 상한 ' + maxPop(world) + '명</p>';
      if (world.invasion) {
        var inv = world.invasion;
        var sched = INVASION.schedule[inv.schedIndex];
        if (inv.phase === 'countdown') {
          var dleft = Math.max(0, inv.triggerDay - world.day);
          html += '<p class="dev-invasion warn">⚔️ ' + inv.triggerDay + '일차 대침공까지 <b>' + dleft + '일</b> 남았습니다. 방어를 준비하세요!</p>';
        } else if (inv.phase === 'active') {
          html += '<p class="dev-invasion active">🏴 대침공 진행 중 — ' + inv.wave + '/' + sched.waves + '웨이브</p>';
        } else if (inv.phase === 'gap') {
          html += '<p class="dev-invasion active">⏸️ 소강 중 — 곧 ' + inv.wave + '/' + sched.waves + '웨이브가 몰려옵니다</p>';
        } else if (inv.phase === 'won') {
          html += '<p class="dev-invasion won">🏆 예정된 대침공을 전부 격퇴했습니다! 나라는 안전합니다.</p>';
        }
      }
      var st = rankReqStatus(world, alive);
      if (!st) {
        html += '<p class="dev-max">🏆 최고 단계에 도달했습니다!</p>';
        body.innerHTML = html;
        return;
      }
      html += '<h3 class="dev-next">다음 단계 · ' + st.next.icon + ' ' + st.next.name + '</h3>';
      html += '<ul class="dev-reqs">' + st.items.map(function (it) {
        return '<li class="' + (it.ok ? 'ok' : 'no') + '">' + (it.ok ? '✅' : '⬜') + ' ' + it.label + '</li>';
      }).join('') + '</ul>';
      html += '<button class="dev-advance"' + (st.allOk ? '' : ' disabled') + '>⬆️ 「' + st.next.name + '」(으)로 승급</button>';
      body.innerHTML = html;
      var adv = body.querySelector('.dev-advance');
      if (adv) adv.addEventListener('click', function () {
        if (handlers.onAdvanceRank && handlers.onAdvanceRank()) render();
      });
    }
    render();
    overlay.querySelector('.dev-close').addEventListener('click', function () { overlay.remove(); });
  }

  // ── 유물 모달 ──
  function showRelics() {
    var relics = world.relics || {};
    var ids = Object.keys(relics).filter(function (k) { return relics[k] > 0 && RELICS[k]; });
    var body;
    if (!ids.length) {
      body = '<p class="rl-empty">아직 유물이 없습니다. 습격을 격퇴하거나 괴민(거인)을 처치하면 무작위 유물을 얻어 콜로니가 영구 강화됩니다.</p>';
    } else {
      body = '<div class="rl-grid">' + ids.map(function (id) {
        var r = RELICS[id];
        return '<div class="rl-item"><span class="rl-ic">' + r.icon + '</span>' +
          '<div class="rl-txt"><b>' + r.name + (relics[id] > 1 ? ' <span class="rl-x">×' + relics[id] + '</span>' : '') + '</b>' +
          '<span>' + r.desc + (relics[id] > 1 ? ' (누적)' : '') + '</span></div></div>';
      }).join('') + '</div>';
    }
    var overlay = openModal('<h2>🎁 유물</h2><div class="rl-body">' + body + '</div>' +
      '<div class="cm-actions"><button class="cm-ok rl-close">닫기</button></div>');
    overlay.querySelector('.rl-close').addEventListener('click', function () { overlay.remove(); });
  }

  // ── 자원 버리기 모달 ──
  function showDiscard() {
    var names = { wood: '목재', gold: '금', food: '식량', iron: '철', meal: '소박한 식사', leather: '가죽',
      meat: '고기', delicacy: '진미', mealGood: '푸짐한 식사', mealFeast: '진수성찬', wool: '양털', carrot: '당근', mealVeg: '채소죽' };
    var types = ['wood', 'gold', 'food', 'iron', 'meal', 'mealVeg', 'leather', 'meat', 'delicacy', 'mealGood', 'mealFeast', 'wool', 'carrot'];
    var overlay = openModal('<h2>🗑️ 자원 버리기</h2>' +
      '<p class="dc-hint">저장고가 꽉 차면 벌목·채굴이 멈춥니다. 남는 자원을 버려 공간을 확보하세요.</p>' +
      '<div class="dc-rows"></div>' +
      '<div class="cm-actions"><button class="cm-ok dc-close">닫기</button></div>');
    var rows = overlay.querySelector('.dc-rows');
    function render() {
      var s = totalRes(world);
      rows.innerHTML = types.map(function (t) {
        return '<div class="dc-row"><span class="dc-name">' + names[t] + '</span>' +
          '<b class="dc-amt">' + (s[t] || 0) + '</b>' +
          '<span class="dc-btns">' +
          '<button data-t="' + t + '" data-n="10">-10</button>' +
          '<button data-t="' + t + '" data-n="100">-100</button>' +
          '<button data-t="' + t + '" data-n="all">전부</button></span></div>';
      }).join('');
      Array.prototype.forEach.call(rows.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          var n = b.dataset.n;
          if (handlers.onDiscard) handlers.onDiscard(b.dataset.t, n === 'all' ? Infinity : +n);
          render();
        });
      });
    }
    render();
    overlay.querySelector('.dc-close').addEventListener('click', function () { overlay.remove(); });
  }

  // ── 떠돌이 상인 모달 ──
  function showTrader() {
    var names = { wood: '목재', iron: '철', food: '식량', meal: '소박한 식사', leather: '가죽',
      meat: '고기', delicacy: '진미', mealGood: '푸짐한 식사', mealFeast: '진수성찬', wool: '양털', carrot: '당근', mealVeg: '채소죽' };
    var types = ['wood', 'iron', 'food', 'meal', 'mealVeg', 'leather', 'meat', 'delicacy', 'mealGood', 'mealFeast', 'wool', 'carrot'];
    var overlay = openModal('<h2>🛒 떠돌이 상인</h2><div class="tr-body"></div>' +
      '<div class="cm-actions"><button class="cm-ok tr-close">닫기</button></div>');
    var body = overlay.querySelector('.tr-body');
    function render() {
      if (!world.traderActive) {
        body.innerHTML = '<p class="dc-hint">지금은 상인이 없습니다. ' + TRADER.intervalDays + '일 주기로 며칠씩 머물며 잉여 자원을 사갑니다.</p>';
        return;
      }
      var s = totalRes(world);
      body.innerHTML = '<p class="dc-hint">잉여 자원을 금으로 바꿔갑니다 — 떠나기 전까지만 거래 가능합니다.</p>' +
        types.map(function (t) {
          var rate = TRADER.rates[t] || 0;
          return '<div class="dc-row"><span class="dc-name">' + names[t] + '</span>' +
            '<b class="dc-amt">' + (s[t] || 0) + '</b>' +
            '<span style="font-size:11px;color:#8d94a8">개당 금' + rate + '</span>' +
            '<span class="dc-btns">' +
            '<button data-t="' + t + '" data-n="10">10개</button>' +
            '<button data-t="' + t + '" data-n="50">50개</button>' +
            '<button data-t="' + t + '" data-n="all">전부</button></span></div>';
        }).join('');
      Array.prototype.forEach.call(body.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          var n = b.dataset.n;
          if (handlers.onTradeSell) handlers.onTradeSell(b.dataset.t, n === 'all' ? 'all' : +n);
          render();
        });
      });
    }
    render();
    overlay.querySelector('.tr-close').addEventListener('click', function () { overlay.remove(); });
  }

  // ── 제작 모달 (무기 + 낚싯대) ──
  function costStr(cost, res) {
    return Object.keys(cost).map(function (t) {
      var nm = { wood: '목재', gold: '금', iron: '철', food: '식량', leather: '가죽' }[t] || t;
      return nm + ' ' + cost[t] + ' (보유 ' + (res[t] || 0) + ')';
    }).join(', ');
  }
  function showCraft() {
    var overlay = openModal('<h2>⚒️ 제작</h2><div class="cr-rows"></div>' +
      '<div class="cm-actions"><button class="cm-ok cr-close">닫기</button></div>');
    var rows = overlay.querySelector('.cr-rows');

    function render() {
      rows.innerHTML = '';
      var res = totalRes(world);

      // 낚싯대 (연구 불필요)
      var rodHead = document.createElement('p');
      rodHead.style.cssText = 'font-size:13px;color:#ffd76e;margin:2px 0 4px;';
      rodHead.textContent = '🎣 낚싯대 (현재 등급: ' + (['맨손', '나무', '강철', '황금'][world.rodTier || 0]) + ')';
      rows.appendChild(rodHead);
      RODS.forEach(function (rod) {
        var owned = (world.rodTier || 0) >= rod.tier;
        var can = affordCost(res, rod.cost);
        var item = document.createElement('div');
        item.className = 'cr-item';
        item.innerHTML = '<h3>' + rod.name + ' <span style="font-size:11px;color:#9aa3b5">희귀 어종 확률↑</span></h3>' +
          '<p>' + costStr(rod.cost, res) + '</p>' +
          (owned ? '<div class="rs-done">✅ 보유</div>'
                 : '<button class="cr-rod" ' + (can ? '' : 'disabled') + '>제작</button>');
        rows.appendChild(item);
        if (!owned) item.querySelector('.cr-rod').addEventListener('click', function () {
          if (handlers.onCraftRod) handlers.onCraftRod(rod);
          render();
        });
      });

      // 무기 (대장간 기술 필요)
      var wHead = document.createElement('p');
      wHead.style.cssText = 'font-size:13px;color:#ffd76e;margin:12px 0 4px;';
      wHead.textContent = '⚔️ 무기';
      rows.appendChild(wHead);
      if (!world.research.unlocked.blacksmith) {
        var lock = document.createElement('p');
        lock.style.cssText = 'font-size:12px;color:#8d94a8;';
        lock.textContent = '🔒 "대장간 기술" 연구가 필요합니다';
        rows.appendChild(lock);
      } else {
        // 대장간(craftHere) 건물이 완공돼 있는지 — 없으면 주문해도 제작 안 됨
        var hasSmithy = false;
        for (var bid in world.buildings) {
          var bb = world.buildings[bid];
          if (bb.stage === 'built' && BUILDS[bb.kind] && BUILDS[bb.kind].craftHere) { hasSmithy = true; break; }
        }
        if (!hasSmithy) {
          var warn = document.createElement('p');
          warn.style.cssText = 'font-size:12px;color:#ff9a5c;margin:0 0 6px;';
          warn.textContent = '⚠️ 대장간을 먼저 지으세요 — 대장간이 없으면 주문해도 제작되지 않습니다.';
          rows.appendChild(warn);
        }
        Object.keys(WEAPONS).forEach(function (type) {
          var wdef = WEAPONS[type];
          if (wdef.iron && !world.research.unlocked.steel) return;
          var queued = world.craftQueue.filter(function (o) { return o.type === type; }).length;
          var item = document.createElement('div');
          item.className = 'cr-item';
          item.innerHTML = '<h3>' + wdef.name + ' <span style="font-size:11px;color:#9aa3b5">공격력 ' + wdef.power +
            (wdef.range > 1 ? ' · 원거리' : '') + '</span></h3><p>' + costStr(wdef.cost, res) + '</p>' +
            '<button class="cr-order">제작 주문</button>' +
            (queued ? '<div class="cr-queue">대기 중인 주문: ' + queued + '개</div>' : '');
          rows.appendChild(item);
          item.querySelector('.cr-order').addEventListener('click', function () {
            if (handlers.onQueueCraft) handlers.onQueueCraft(type);
            render();
          });
        });

        // 방어구 — 무기와 같은 대장간·대기열 공유, 피격 데미지 경감(착용은 전투 시 자동)
        var aHead = document.createElement('p');
        aHead.style.cssText = 'font-size:13px;color:#ffd76e;margin:12px 0 4px;';
        aHead.textContent = '🛡️ 방어구';
        rows.appendChild(aHead);
        Object.keys(ARMOR).forEach(function (type) {
          var adef = ARMOR[type];
          if (adef.iron && !world.research.unlocked.steel) return;
          var queued = world.craftQueue.filter(function (o) { return o.type === type; }).length;
          var item = document.createElement('div');
          item.className = 'cr-item';
          item.innerHTML = '<h3>' + adef.name + ' <span style="font-size:11px;color:#9aa3b5">방어력 ' + adef.defense +
            '</span></h3><p>' + costStr(adef.cost, res) + '</p>' +
            '<button class="cr-order">제작 주문</button>' +
            (queued ? '<div class="cr-queue">대기 중인 주문: ' + queued + '개</div>' : '');
          rows.appendChild(item);
          item.querySelector('.cr-order').addEventListener('click', function () {
            if (handlers.onQueueCraft) handlers.onQueueCraft(type);
            render();
          });
        });
      }
    }
    render();
    overlay.querySelector('.cr-close').addEventListener('click', function () { overlay.remove(); });
  }
  function affordCost(res, cost) {
    for (var t in cost) if ((res[t] || 0) < cost[t]) return false;
    return true;
  }

  // ── 장비 상점 모달 (대장간 없이 금으로 즉시 구매) ──
  function showShop() {
    var overlay = openModal('<h2>🏪 장비 상점</h2><div class="cr-rows"></div>' +
      '<div class="cm-actions"><button class="cm-ok cr-close">닫기</button></div>');
    var rows = overlay.querySelector('.cr-rows');

    function hasOutfitter() {
      for (var bid in world.buildings) {
        var bb = world.buildings[bid];
        if (bb.stage === 'built' && BUILDS[bb.kind] && BUILDS[bb.kind].shopHere) return true;
      }
      return false;
    }
    function buyRow(type, def, statLabel) {
      var can = hasOutfitter() && (world.stock.gold || 0) >= def.shopCost;
      var item = document.createElement('div');
      item.className = 'cr-item';
      item.innerHTML = '<h3>' + def.name + ' <span style="font-size:11px;color:#9aa3b5">' + statLabel + '</span></h3>' +
        '<p>금 ' + def.shopCost + ' (보유 ' + (world.stock.gold || 0) + ')</p>' +
        '<button class="cr-buy" ' + (can ? '' : 'disabled') + '>구매</button>';
      rows.appendChild(item);
      item.querySelector('.cr-buy').addEventListener('click', function () {
        if (handlers.onShopBuy) handlers.onShopBuy(type);
        render();
      });
    }
    function render() {
      rows.innerHTML = '';
      if (!hasOutfitter()) {
        var warn = document.createElement('p');
        warn.style.cssText = 'font-size:12px;color:#ff9a5c;margin:0 0 6px;';
        warn.textContent = '⚠️ 장비 상점을 먼저 지으세요 — 없으면 구매할 수 없습니다.';
        rows.appendChild(warn);
      }
      var hint = document.createElement('p');
      hint.className = 'dc-hint';
      hint.textContent = '금으로 무기·방어구를 대장간 없이 즉시 구매합니다(제작보다 비쌉니다).';
      rows.appendChild(hint);

      var wHead = document.createElement('p');
      wHead.style.cssText = 'font-size:13px;color:#ffd76e;margin:8px 0 4px;';
      wHead.textContent = '⚔️ 무기';
      rows.appendChild(wHead);
      Object.keys(WEAPONS).forEach(function (type) {
        var wdef = WEAPONS[type];
        if (wdef.iron && !world.research.unlocked.steel) return;
        buyRow(type, wdef, '공격력 ' + wdef.power + (wdef.range > 1 ? ' · 원거리' : ''));
      });

      var aHead = document.createElement('p');
      aHead.style.cssText = 'font-size:13px;color:#ffd76e;margin:12px 0 4px;';
      aHead.textContent = '🛡️ 방어구';
      rows.appendChild(aHead);
      Object.keys(ARMOR).forEach(function (type) {
        var adef = ARMOR[type];
        if (adef.iron && !world.research.unlocked.steel) return;
        buyRow(type, adef, '방어력 ' + adef.defense);
      });
    }
    render();
    overlay.querySelector('.cr-close').addEventListener('click', function () { overlay.remove(); });
  }

  // ── 목표 모달 ──
  function showGoals(goals, w) {
    var doneCount = goals.filter(function (g) { return !!w.goals[g.id]; }).length;
    var rowsHtml = goals.map(function (g) {
      var done = !!w.goals[g.id];
      return '<div class="rs-item"><h3>' + (done ? '✅ ' : '⬜ ') + g.name + '</h3>' +
        '<p>' + g.desc + '</p></div>';
    }).join('');
    var overlay = openModal('<h2>🏆 목표 (' + doneCount + '/' + goals.length + ')</h2>' + rowsHtml +
      '<div class="cm-actions"><button class="cm-ok gl-close">닫기</button></div>');
    overlay.querySelector('.gl-close').addEventListener('click', function () { overlay.remove(); });
  }

  // ── 콜로니 업그레이드 모달 ──
  function showUpgrades(upgrades, cats, w) {
    var overlay = openModal('<h2>📈 콜로니 업그레이드</h2><div class="up-rows"></div>' +
      '<div class="cm-actions"><button class="cm-ok up-close">닫기</button></div>');
    var rows = overlay.querySelector('.up-rows');

    function render() {
      rows.innerHTML = '';
      var res = totalRes(w);
      Object.keys(cats).forEach(function (cat) {
        var head = document.createElement('p');
        head.style.cssText = 'font-size:13px;color:#ffd76e;margin:12px 0 4px;';
        head.textContent = cats[cat];
        rows.appendChild(head);
        Object.keys(upgrades).forEach(function (id) {
          var u = upgrades[id];
          if (u.cat !== cat) return;
          var owned = !!w.upgrades[id];
          var locked = false;
          if (u.requires) {
            for (var r = 0; r < u.requires.length; r++) if (!w.upgrades[u.requires[r]]) locked = true;
          }
          var can = affordCost(res, u.cost);
          var item = document.createElement('div');
          item.className = 'rs-item';
          var btn;
          if (owned) btn = '<div class="rs-done">✅ 보유</div>';
          else if (locked) {
            var reqNames = u.requires.map(function (r) { return upgrades[r] ? upgrades[r].name : r; }).join(', ');
            btn = '<div style="font-size:12px;color:#8d94a8;">🔒 선행 필요: ' + reqNames + '</div>';
          } else btn = '<button class="up-buy" data-id="' + id + '" ' + (can ? '' : 'disabled') + '>구매</button>';
          item.innerHTML = '<h3>' + u.name + ' <span style="font-size:11px;color:#8fd0ff">' + u.desc + '</span></h3>' +
            '<p>' + costStr(u.cost, res) + '</p>' + btn;
          rows.appendChild(item);
        });
      });
      rows.querySelectorAll('.up-buy').forEach(function (b) {
        b.addEventListener('click', function () {
          if (handlers.onBuyUpgrade) handlers.onBuyUpgrade(b.dataset.id);
          render();
        });
      });
    }
    render();
    overlay.querySelector('.up-close').addEventListener('click', function () { overlay.remove(); });
  }

  return {
    addEvent: addEvent,
    showCustomize: showCustomize,
    showResearch: showResearch,
    showCraft: showCraft,
    showShop: showShop,
    showGoals: showGoals,
    showUpgrades: showUpgrades,
    showDevelopment: showDevelopment,
    refreshLocks: refreshLocks,
    updateAutoEquipBtn: updateAutoEquipBtn,
    getTool: function () { return tool; },
    setTool: setTool,
    setHireInfo: setHireInfo,
    setSpeedUI: setSpeedUI,
    updateClock: updateClock,
    updateInvasionWarning: updateInvasionWarning,
    updateRes: updateRes,
    updateStorage: updateStorage,
    updateRoster: updateRoster,
    showPawn: showPawn,
    hidePawn: hidePawn,
    showBuilding: showBuilding,
    hideBuilding: hideBuilding,
    updatePawnPanel: updatePawnPanel,
    toast: toast,
  };
}

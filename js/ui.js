// DOM HUD: 도구·시계·자원·정착민 패널·토스트·커스터마이징 모달·연구/제작 모달
import { taskLabel } from './pawns.js';
import { HUMANS, RESEARCH, WEAPONS, SKILL_LABEL, skillLevel, BUILDS, STORAGE, RODS, WAREHOUSE_TIERS, ROLES, RANKS, BUILD_MIN_RANK, DEFENSE_TIERS, RELICS, INVASION } from './config.js';
import { totalRes, warehouseTier, warehouseCap, maxPop, rankReqStatus, defenseStats } from './world.js';

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
      btns[i].classList.toggle('locked', (BUILD_MIN_RANK[k] || 0) > rank);
    }
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
  var resFood = document.getElementById('resFood');
  var resPop = document.getElementById('resPop');

  function updateClock(day, timeMin) {
    var m = Math.floor(timeMin % 1440);
    var hh = String((m / 60) | 0).padStart(2, '0');
    var mm = String(m % 60).padStart(2, '0');
    dayLabel.textContent = day + '일차';
    timeLabel.textContent = hh + ':' + mm;
  }

  var resStorage = document.getElementById('resStorage');
  function updateRes(sum, alivePawns) {
    resWood.textContent = sum.wood || 0;
    resGold.textContent = sum.gold || 0;
    resFood.textContent = sum.food || 0;
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
      row.querySelector('.roster-hp > div').style.width = Math.max(0, Math.round(p.hp)) + '%';
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
    barHp.style.width = pawn.hp + '%';
    barMood.style.width = Math.round(pawn.mood) + '%';
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
      var tierN = DEFENSE_TIERS[b.kind] ? (b.tier || 1) : null;
      lines.push('⚔️ 공격력 <b>' + ds.power + '</b>' + (ds.cannon ? ' 💥광역' : ''));
      lines.push('🎯 사거리 <b>' + ds.range + '</b>' + (tierN ? ' · ' + tierN + '단계' : ''));
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
        if (inv.phase === 'countdown') {
          var dleft = Math.max(0, inv.triggerDay - world.day);
          html += '<p class="dev-invasion warn">⚔️ 다음 대침공까지 <b>' + dleft + '일</b> 남았습니다. 방어를 준비하세요!</p>';
        } else if (inv.phase === 'active') {
          html += '<p class="dev-invasion active">🏴 대침공 진행 중 — ' + inv.wave + '/' + INVASION.waves + '웨이브</p>';
        } else if (inv.phase === 'gap') {
          html += '<p class="dev-invasion active">⏸️ 소강 중 — 곧 ' + inv.wave + '/' + INVASION.waves + '웨이브가 몰려옵니다</p>';
        } else if (inv.phase === 'won') {
          html += '<p class="dev-invasion won">🏆 대침공을 격퇴했습니다! 나라는 안전합니다.</p>';
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
    var names = { wood: '목재', gold: '금', food: '식량', iron: '철', meal: '요리' };
    var types = ['wood', 'gold', 'food', 'iron', 'meal'];
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

  // ── 제작 모달 (무기 + 낚싯대) ──
  function costStr(cost, res) {
    return Object.keys(cost).map(function (t) {
      var nm = { wood: '목재', gold: '금', iron: '철', food: '식량' }[t] || t;
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
      }
    }
    render();
    overlay.querySelector('.cr-close').addEventListener('click', function () { overlay.remove(); });
  }
  function affordCost(res, cost) {
    for (var t in cost) if ((res[t] || 0) < cost[t]) return false;
    return true;
  }

  // ── 목표 모달 ──
  function showGoals(goals, w) {
    var rowsHtml = goals.map(function (g) {
      var done = !!w.goals[g.id];
      return '<div class="rs-item"><h3>' + (done ? '✅ ' : '⬜ ') + g.name + '</h3>' +
        '<p>' + g.desc + '</p></div>';
    }).join('');
    var overlay = openModal('<h2>🏆 목표</h2>' + rowsHtml +
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
    showGoals: showGoals,
    showUpgrades: showUpgrades,
    showDevelopment: showDevelopment,
    refreshLocks: refreshLocks,
    getTool: function () { return tool; },
    setTool: setTool,
    setHireInfo: setHireInfo,
    setSpeedUI: setSpeedUI,
    updateClock: updateClock,
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

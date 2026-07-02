// DOM HUD: 도구·시계·자원·정착민 패널·토스트·커스터마이징 모달
import { taskLabel } from './pawns.js';
import { UNITS, COLORS, TS } from './config.js';

var SHEET_W = { pawn: 1152, warrior: 1152, archer: 1536 };
var COLOR_LABEL = { Blue: '파랑', Red: '빨강', Yellow: '노랑', Purple: '보라' };

export function createUI(handlers) {
  var tool = 'select';

  // 도구 버튼
  var toolBtns = document.querySelectorAll('.tool');
  toolBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      toolBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      tool = btn.dataset.tool;
      handlers.onToolChange(tool);
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

  function updateRes(sum, alivePawns) {
    resWood.textContent = sum.wood || 0;
    resGold.textContent = sum.gold || 0;
    resFood.textContent = sum.food || 0;
    resPop.textContent = alivePawns;
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
  var barEnergy = document.getElementById('barEnergy');
  var barHp = document.getElementById('barHp');

  function showPawn(pawn) {
    panel.classList.remove('hidden');
    updatePawnPanel(pawn);
  }
  function hidePawn() {
    panel.classList.add('hidden');
  }
  function updatePawnPanel(pawn) {
    pawnName.textContent = pawn.name;
    pawnTask.textContent = taskLabel(pawn);
    barHunger.style.width = pawn.hunger + '%';
    barEnergy.style.width = pawn.energy + '%';
    barHp.style.width = pawn.hp + '%';
  }

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
      var pick = { name: pawn.name, unit: pawn.look.unit, color: pawn.look.color };
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
      Object.keys(UNITS).forEach(function (unit) {
        COLORS.forEach(function (color) {
          var btn = document.createElement('button');
          btn.className = 'cm-look';
          btn.title = UNITS[unit].label + ' · ' + COLOR_LABEL[color];
          var scale = 58 / 192;
          btn.style.backgroundImage = 'url(' + TS + UNITS[unit].sheet + color + '.png)';
          btn.style.backgroundSize = (SHEET_W[unit] * scale) + 'px auto';
          btn.style.backgroundPosition = '0 0';
          if (unit === pick.unit && color === pick.color) btn.classList.add('sel');
          btn.addEventListener('click', function () {
            pick.unit = unit; pick.color = color;
            grid.querySelectorAll('.cm-look').forEach(function (b) { b.classList.remove('sel'); });
            btn.classList.add('sel');
          });
          grid.appendChild(btn);
        });
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
        pawn.look = { unit: pk.unit, color: pk.color };
      });
      overlay.remove();
      if (onDone) onDone();
    });

    document.body.appendChild(overlay);
  }

  return {
    addEvent: addEvent,
    showCustomize: showCustomize,
    getTool: function () { return tool; },
    setSpeedUI: setSpeedUI,
    updateClock: updateClock,
    updateRes: updateRes,
    showPawn: showPawn,
    hidePawn: hidePawn,
    updatePawnPanel: updatePawnPanel,
    toast: toast,
  };
}

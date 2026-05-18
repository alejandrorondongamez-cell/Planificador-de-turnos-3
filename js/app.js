// ============================================================
// app.js — Planificador de Turnos
// Antídotos #1-5 aplicados. Ver comentarios inline.
// ============================================================

window.APP = {
  config:      null,
  users:       [],
  holidays:    {},
  schedule:    {},
  vacations:   {},
  auditTrail:  [],
  isAdmin:     false,
  currentView: 'dashboard'
};

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  showLoadingOverlay(true);
  try {
    await loadStaticData();
    loadOperationalData();
    renderApp();
    setupNavigation();
    showLoadingOverlay(false);
    window.showToast('Sistema cargado correctamente.', 'success', 2500);
  } catch (err) {
    showLoadingOverlay(false);
    document.getElementById('app-root').innerHTML =
      `<div class="fatal-error"><h2>Error de inicialización</h2><p>${err.message}</p>
       <button onclick="location.reload()">Reintentar</button></div>`;
    console.error('Init error:', err);
  }
});

// Antídoto #1: cache-busting. Antídoto #2: nunca guardar config en localStorage.
async function loadStaticData() {
  const ts = Date.now();
  const [cfgRes, usersRes, holidaysRes] = await Promise.all([
    fetch(`data/config.json?v=${ts}`),
    fetch(`data/users.json?v=${ts}`),
    fetch(`data/holidays.json?v=${ts}`)
  ]);
  if (!cfgRes.ok)      throw new Error('No se pudo cargar config.json');
  if (!usersRes.ok)    throw new Error('No se pudo cargar users.json');
  if (!holidaysRes.ok) throw new Error('No se pudo cargar holidays.json');
  APP.config   = await cfgRes.json();
  APP.users    = await usersRes.json();
  APP.holidays = await holidaysRes.json();
}

function loadOperationalData() {
  APP.schedule   = window.loadScheduleLocal();
  APP.vacations  = window.loadVacationsLocal();
  APP.auditTrail = window.loadAuditTrail();
}

// ─── Navegación ──────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', function() { navigateTo(this.dataset.nav); });
  });
}

window.navigateTo = function(view) {
  APP.currentView = view;
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('nav-active', btn.dataset.nav === view);
  });
  renderApp();
};

function renderApp() {
  const root = document.getElementById('app-root');
  if (!root) return;
  switch (APP.currentView) {
    case 'dashboard':  root.innerHTML = renderDashboard();      break;
    case 'schedule':   root.innerHTML = renderScheduleView();   break;
    case 'vacations':  root.innerHTML = renderVacationsView();  break;
    case 'report':     root.innerHTML = renderReportView();     break;
    case 'settings':   root.innerHTML = renderSettingsView();   break;
    default:           root.innerHTML = renderDashboard();
  }
  bindViewEvents();
}

// ─── Helpers UI ──────────────────────────────────────────────
function userName(id) {
  const u = APP.users.find(u => u.id === id);
  return u ? u.name : String(id);
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Tooltip global: posiciona y muestra/oculta
function setupTooltips() {
  const tip = document.getElementById('global-tooltip');
  if (!tip) return;
  document.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mouseenter', function(e) {
      tip.innerHTML = this.dataset.tip;
      tip.classList.add('tip-visible');
      positionTip(e, tip);
    });
    el.addEventListener('mousemove', function(e) { positionTip(e, tip); });
    el.addEventListener('mouseleave', function() { tip.classList.remove('tip-visible'); });
  });
}

function positionTip(e, tip) {
  const x = e.clientX + 12;
  const y = e.clientY + 16;
  const vw = window.innerWidth;
  const tipW = 220;
  tip.style.left = (x + tipW > vw ? x - tipW - 16 : x) + 'px';
  tip.style.top  = y + 'px';
}

function bindViewEvents() {
  // Llamar siempre tras renderizar
  requestAnimationFrame(setupTooltips);
}

// ─── DASHBOARD ───────────────────────────────────────────────
function renderDashboard() {
  const today     = window.formatDateLocal(new Date());
  const todayData = APP.schedule[today] || null;
  const totalDays = Object.keys(APP.schedule).length;
  const vacEntries= Object.values(APP.vacations).flat().length;
  const onVacToday= APP.users.filter(u => window.isOnVacation(u.id, today, APP.vacations));
  const holType   = window.getHolidayType(today, APP.holidays);
  const holName   = window.getHolidayName(today, APP.holidays);
  const closedToday = todayData && todayData.closed;

  // Cuadrante de hoy
  let todayCard = '';
  if (closedToday) {
    todayCard = `<div class="today-card closed">
      <div class="closed-icon">🔒</div>
      <div class="closed-text">Servicio cerrado — ${holName || 'Festivo'}</div>
    </div>`;
  } else if (todayData) {
    const mNames = (todayData.morning   || []).map(id => userName(id));
    const aNames = (todayData.afternoon || []).map(id => userName(id));
    const badge  = holType ? `<span class="hol-badge hol-${holType}">${holName}</span>` : '';
    todayCard = `
      <div class="today-card">
        ${badge}
        <div class="shift-row">
          <div class="shift-label morning-label">
            <span class="shift-icon">☀</span>
            <span>Mañana <span class="shift-time">08:00 – 17:00</span></span>
          </div>
          <div class="tech-chips">${mNames.map(n => `<span class="chip">${n}</span>`).join('') || '<span class="chip empty">Sin asignar</span>'}</div>
        </div>
        <div class="shift-row">
          <div class="shift-label afternoon-label">
            <span class="shift-icon">🌙</span>
            <span>Tarde <span class="shift-time">15:00 – 24:00</span></span>
          </div>
          <div class="tech-chips">${aNames.map(n => `<span class="chip chip-afternoon">${n}</span>`).join('') || '<span class="chip empty">Sin asignar</span>'}</div>
        </div>
      </div>`;
  } else {
    const dow = new Date().getDay();
    if (dow === 0 || dow === 6) {
      todayCard = `<div class="today-card closed"><div class="closed-icon">📅</div><div class="closed-text">Fin de semana — sin servicio</div></div>`;
    } else {
      todayCard = `<div class="today-card empty-state"><p>Sin cuadrante generado para hoy.</p><button class="btn-primary" onclick="navigateTo('schedule')">Ir al Planificador</button></div>`;
    }
  }

  // Grid equipo — sin mostrar perfil
  const teamGrid = APP.users.map(u => {
    const onVac  = window.isOnVacation(u.id, today, APP.vacations);
    const used   = window.getVacationDaysUsed(u.id, APP.vacations);
    const pct    = Math.min(100, Math.round((used / u.vacationDaysTotal) * 100));
    const status = onVac ? 'vacation' : (closedToday ? 'holiday' : 'working');
    const statusLabel = { vacation: '🏖', holiday: '🔒', working: '✓ Activo' }[status];
    const statusText  = { vacation: 'Vacaciones', holiday: 'Festivo', working: 'Activo' }[status];

    // Vacaciones próximas
    const nextVac = (APP.vacations[u.id] || [])
      .filter(v => window.parseLocalDate(v.end) >= new Date())
      .sort((a,b) => a.start.localeCompare(b.start))[0];
    const vacTip = nextVac ? `Próximas vacaciones: ${nextVac.start} → ${nextVac.end}` : 'Sin vacaciones próximas';

    return `
      <div class="team-member ${status}">
        <div class="member-avatar av-${status}">${initials(u.name)}</div>
        <div class="member-info">
          <div class="member-name">${u.name}</div>
          <div class="vac-bar-wrap"><div class="vac-bar" style="width:${pct}%"></div></div>
          <div class="vac-label">${used}/${u.vacationDaysTotal} días vacaciones</div>
        </div>
        <div class="member-status-col">
          ${onVac
            ? `<span class="status-badge status-vacation" data-tip="${vacTip}">🏖 ${onVac ? used : ''}</span>`
            : `<span class="status-badge status-${status}">${statusLabel}</span>`
          }
        </div>
      </div>`;
  }).join('');

  return `
    <div class="view-header">
      <h1 class="view-title">Dashboard</h1>
      <p class="view-sub">Visión general del equipo IT — ${today}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${totalDays}</div>
        <div class="stat-label">Días planificados</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${APP.users.length}</div>
        <div class="stat-label">Técnicos activos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🌴</div>
        <div class="stat-value">${vacEntries}</div>
        <div class="stat-label">Periodos vacacionales</div>
      </div>
      <div class="stat-card ${onVacToday.length > 0 ? 'stat-warning' : ''}">
        <div class="stat-icon">🏖</div>
        <div class="stat-value">${onVacToday.length}</div>
        <div class="stat-label">De vacaciones hoy</div>
      </div>
    </div>
    <section class="section-card">
      <h2 class="section-title">Cuadrante de Hoy</h2>
      ${todayCard}
    </section>
    <section class="section-card">
      <h2 class="section-title">Estado del Equipo</h2>
      <div class="team-grid">${teamGrid}</div>
    </section>`;
}

// ─── SCHEDULE VIEW ───────────────────────────────────────────
function renderScheduleView() {
  const today = new Date();
  return `
    <div class="view-header">
      <h1 class="view-title">Planificador de Cuadrantes</h1>
      <p class="view-sub">Generación automática y edición manual de turnos</p>
    </div>
    <div class="toolbar">
      <button class="btn-primary" onclick="openGeneratorRangeModal()">⚡ Generar Cuadrante Automático</button>
      <button class="btn-secondary" onclick="window.exportScheduleCSV(APP.schedule, APP.users)">⬇ Exportar CSV</button>
    </div>
    <div class="month-navigator">
      <button class="nav-arrow" onclick="changeScheduleMonth(-1)">◀</button>
      <span id="schedule-month-label" class="month-label">Cargando...</span>
      <button class="nav-arrow" onclick="changeScheduleMonth(1)">▶</button>
    </div>
    <div id="schedule-calendar-wrap">
      ${renderCalendar(today.getFullYear(), today.getMonth())}
    </div>
    <!-- Modal Generador -->
    <div id="modal-generator" class="modal hidden">
      <div class="modal-backdrop" onclick="closeGeneratorModal()"></div>
      <div class="modal-box">
        <h3 class="modal-title">Generar Cuadrante Automático</h3>
        <p class="modal-desc">Rango de fechas para el motor de asignación en cascada. Solo se generan días laborables (lun–vie).</p>
        <div class="form-row"><label>Fecha Inicio</label><input type="date" id="gen-start" value="2026-01-01"></div>
        <div class="form-row"><label>Fecha Fin</label><input type="date" id="gen-end" value="2026-12-31"></div>
        <div class="form-row checkbox-row">
          <input type="checkbox" id="gen-overwrite">
          <label for="gen-overwrite">Sobreescribir cuadrante existente</label>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" onclick="closeGeneratorModal()">Cancelar</button>
          <button class="btn-primary" onclick="executeAutoGenerate()">Generar</button>
        </div>
      </div>
    </div>
    <!-- Modal edición día -->
    <div id="modal-edit-day" class="modal hidden">
      <div class="modal-backdrop" onclick="closeEditDayModal()"></div>
      <div class="modal-box" id="edit-day-content"></div>
    </div>`;
}

window._scheduleMonth = new Date().getMonth();
window._scheduleYear  = new Date().getFullYear();

window.changeScheduleMonth = function(delta) {
  window._scheduleMonth += delta;
  if (window._scheduleMonth < 0)  { window._scheduleMonth = 11; window._scheduleYear--; }
  if (window._scheduleMonth > 11) { window._scheduleMonth = 0;  window._scheduleYear++; }
  const wrap = document.getElementById('schedule-calendar-wrap');
  if (wrap) wrap.innerHTML = renderCalendar(window._scheduleYear, window._scheduleMonth);
  const lbl = document.getElementById('schedule-month-label');
  if (lbl) lbl.textContent = `${window.monthName(window._scheduleMonth)} ${window._scheduleYear}`;
  requestAnimationFrame(setupTooltips);
};

function renderCalendar(year, month) {
  const lbl = document.getElementById('schedule-month-label');
  if (lbl) lbl.textContent = `${window.monthName(month)} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  let startDow   = firstDay.getDay();
  if (startDow === 0) startDow = 7;
  startDow -= 1;

  let html = `<div class="calendar-grid">
    <div class="cal-header-row">
      ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => `<div class="cal-head">${d}</div>`).join('')}
    </div>
    <div class="cal-body">`;

  for (let i = 0; i < startDow; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData = APP.schedule[dateStr];
    const holType = window.getHolidayType(dateStr, APP.holidays);
    const holName = window.getHolidayName(dateStr, APP.holidays);
    const isToday = dateStr === window.formatDateLocal(new Date());
    const dow     = window.parseLocalDate(dateStr).getDay(); // 0=Dom,6=Sáb
    const isWknd  = (dow === 0 || dow === 6);

    let cellClass = 'cal-cell';
    if (holType === 'closure')   cellClass += ' cell-closure';
    else if (holType === 'national') cellClass += ' cell-national';
    else if (holType === 'alicante') cellClass += ' cell-alicante';
    else if (isWknd)             cellClass += ' cell-weekend';
    if (isToday)                 cellClass += ' cell-today';

    let content = '';

    if (holType === 'closure') {
      content = `<div class="cell-hol-row"><span class="cell-hol-ico">🔒</span><span class="cell-hol-name">${holName}</span></div>`;
    } else if (isWknd) {
      content = `<div class="cell-weekend-label">Fin de semana</div>`;
    } else if (dayData) {
      const mIds = dayData.morning   || [];
      const aIds = dayData.afternoon || [];
      const mNames = mIds.map(id => userName(id)).join('\n');
      const aNames = aIds.map(id => userName(id)).join('\n');

      // Técnicos de vacaciones ese día
      const onVacNames = APP.users
        .filter(u => window.isOnVacation(u.id, dateStr, APP.vacations))
        .map(u => u.name).join('\n');

      const holBadge = holType ? `<span class="cell-hol-tag hol-${holType}" data-tip="${holName}">${holType === 'alicante' ? '🎆' : '🇪🇸'}</span>` : '';

      // Nombres mañana truncados para caber en celda
      const mList = mIds.map(id => {
        const n = userName(id); return `<div class="cell-tech morning-tech">${n.split(' ')[0]}</div>`;
      }).join('');
      const aList = aIds.map(id => {
        const n = userName(id); return `<div class="cell-tech afternoon-tech">${n.split(' ')[0]}</div>`;
      }).join('');

      const vacIcon = onVacNames
        ? `<span class="cell-vac-ico" data-tip="De vacaciones:\n${onVacNames}">🏖 ${APP.users.filter(u=>window.isOnVacation(u.id,dateStr,APP.vacations)).length}</span>`
        : '';

      const warn = (mIds.length < 2 || aIds.length < 2) ? `<span class="cell-warn" data-tip="Cobertura insuficiente">⚠</span>` : '';

      content = `
        <div class="cell-meta-row">${holBadge}${vacIcon}${warn}</div>
        <div class="cell-shift-block">
          <div class="cell-shift-hdr morning-hdr" data-tip="☀ Mañana (08-17):\n${mNames || 'Sin asignar'}">☀ <span class="cell-shift-count">${mIds.length}</span></div>
          ${mList}
        </div>
        <div class="cell-shift-block">
          <div class="cell-shift-hdr afternoon-hdr" data-tip="🌙 Tarde (15-24):\n${aNames || 'Sin asignar'}">🌙 <span class="cell-shift-count">${aIds.length}</span></div>
          ${aList}
        </div>`;
    } else {
      content = `<div class="cell-no-data">Sin datos</div>`;
    }

    const clickable = !isWknd && holType !== 'closure' ? `onclick="openEditDayModal('${dateStr}')"` : '';
    html += `<div class="${cellClass}" ${clickable}><div class="cell-day-num">${d}</div>${content}</div>`;
  }

  html += `</div></div>`;
  return html;
}

window.openGeneratorRangeModal = function() {
  document.getElementById('modal-generator').classList.remove('hidden');
};
window.closeGeneratorModal = function() {
  document.getElementById('modal-generator').classList.add('hidden');
};

window.executeAutoGenerate = function() {
  const startStr  = document.getElementById('gen-start').value;
  const endStr    = document.getElementById('gen-end').value;
  const overwrite = document.getElementById('gen-overwrite').checked;
  if (!startStr || !endStr) { window.showToast('Indica fechas de inicio y fin.', 'warning'); return; }

  const weeks = window.getWeeksInRange(startStr, endStr);
  if (weeks.length === 0) { window.showToast('Rango de fechas inválido.', 'error'); return; }

  const { schedule, contingencies } = window.generateSchedule(weeks, APP.users, APP.vacations, APP.holidays, APP.config);

  if (overwrite) APP.schedule = schedule;
  else Object.assign(APP.schedule, schedule);

  window.saveScheduleLocal(APP.schedule);
  window.appendAuditEntry('AUTO_GENERATE', `${startStr}→${endStr}`, 'all', null, null, APP.isAdmin ? 'Admin' : 'Sistema');

  closeGeneratorModal();

  const workDays = Object.keys(schedule).length;
  let msg = `✅ Cuadrante generado: ${workDays} días laborables planificados.`;
  if (contingencies.length > 0) {
    msg += `\n\n⚠ ${contingencies.length} semanas con ajuste manual recomendado:\n\n` + contingencies.join('\n');
    alert(msg);
  } else {
    window.showToast(msg, 'success', 4000);
  }
  renderApp();
};

window.openEditDayModal = function(dateStr) {
  if (!APP.isAdmin) {
    window.showToast('Acceso de administrador requerido para editar el cuadrante.', 'warning');
    return;
  }
  const dayData = APP.schedule[dateStr] || { morning: [], afternoon: [], closed: false };
  const d = window.parseLocalDate(dateStr);
  const title = `${window.dayNameFull(d.getDay())} ${d.getDate()} de ${window.monthName(d.getMonth())} de ${d.getFullYear()}`;

  const userChecks = (shift) => APP.users.map(u => {
    const checked = (dayData[shift] || []).includes(u.id) ? 'checked' : '';
    return `<label class="check-label">
      <input type="checkbox" data-uid="${u.id}" data-shift="${shift}" ${checked}>
      <span class="check-tech">${u.name}</span>
    </label>`;
  }).join('');

  document.getElementById('edit-day-content').innerHTML = `
    <h3 class="modal-title">Editar: ${title}</h3>
    <div class="form-row checkbox-row">
      <input type="checkbox" id="day-closed" ${dayData.closed ? 'checked' : ''}
             onchange="document.getElementById('shift-editor').style.display=this.checked?'none':''">
      <label for="day-closed">🔒 Cierre de servicio (festivo)</label>
    </div>
    <div id="shift-editor" ${dayData.closed ? 'style="display:none"' : ''}>
      <div class="shift-editor-col"><h4>☀ Mañana</h4><div class="checkboxes-list">${userChecks('morning')}</div></div>
      <div class="shift-editor-col"><h4>🌙 Tarde</h4><div class="checkboxes-list">${userChecks('afternoon')}</div></div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeEditDayModal()">Cerrar</button>
      <button class="btn-primary" onclick="saveDayEdits('${dateStr}')">Guardar</button>
    </div>`;
  document.getElementById('modal-edit-day').classList.remove('hidden');
};

window.saveDayEdits = function(dateStr) {
  const isClosed = document.getElementById('day-closed').checked;
  if (isClosed) {
    APP.schedule[dateStr] = { morning: [], afternoon: [], closed: true, holidayType: 'closure', holiday: 'Manual' };
  } else {
    const mIds = [], aIds = [];
    document.querySelectorAll('[data-shift="morning"]:checked').forEach(cb => mIds.push(parseInt(cb.dataset.uid)));
    document.querySelectorAll('[data-shift="afternoon"]:checked').forEach(cb => aIds.push(parseInt(cb.dataset.uid)));
    APP.schedule[dateStr] = { morning: mIds, afternoon: aIds, closed: false, holidayType: null, holiday: window.getHolidayName(dateStr, APP.holidays) };
  }
  window.saveScheduleLocal(APP.schedule);
  window.appendAuditEntry('MANUAL_EDIT', dateStr, 'all', null, null, 'Admin');
  closeEditDayModal();
  const wrap = document.getElementById('schedule-calendar-wrap');
  if (wrap) { wrap.innerHTML = renderCalendar(window._scheduleYear, window._scheduleMonth); requestAnimationFrame(setupTooltips); }
  window.showToast(`Cambios guardados para ${dateStr}.`, 'success');
};

window.closeEditDayModal = function() {
  document.getElementById('modal-edit-day').classList.add('hidden');
};

// ─── VACATIONS VIEW ──────────────────────────────────────────
function renderVacationsView() {
  const rows = APP.users.map(u => {
    const vacs = APP.vacations[u.id] || [];
    const used = window.getVacationDaysUsed(u.id, APP.vacations);
    const pct  = Math.min(100, Math.round((used / u.vacationDaysTotal) * 100));
    return `
      <div class="vac-user-block">
        <div class="vac-user-header">
          <div class="member-avatar av-working">${initials(u.name)}</div>
          <div style="flex:1">
            <div class="member-name">${u.name}</div>
            <div class="vac-bar-wrap wide"><div class="vac-bar" style="width:${pct}%"></div></div>
            <div class="vac-label">${used} / ${u.vacationDaysTotal} días (${pct}%)</div>
          </div>
          ${APP.isAdmin ? `<button class="btn-add" onclick="openAddVacModal(${u.id})">+ Añadir</button>` : ''}
        </div>
        <div class="vac-list">
          ${vacs.length === 0
            ? '<p class="empty-vac">Sin periodos registrados.</p>'
            : vacs.map((v, i) => {
                const days = Math.round((window.parseLocalDate(v.end) - window.parseLocalDate(v.start)) / 86400000) + 1;
                return `<div class="vac-entry">
                  <span class="vac-range">📅 ${v.start} → ${v.end}</span>
                  <span class="vac-days">${days} días</span>
                  ${APP.isAdmin ? `<button class="btn-del" onclick="deleteVacation(${u.id}, ${i})">✕</button>` : ''}
                </div>`;
              }).join('')
          }
        </div>
      </div>`;
  }).join('');

  return `
    <div class="view-header">
      <h1 class="view-title">Gestión de Vacaciones</h1>
      <p class="view-sub">Registro y validación de periodos vacacionales 2026</p>
    </div>
    <div class="info-banner">
      ⚠ <strong>Restricción 2026:</strong> Vacaciones a partir del <strong>15 de julio</strong> deben ser semanas íntegras de lunes a domingo (mínimo 7 días, múltiplos de 7).
    </div>
    <div class="vac-users-list">${rows}</div>
    <div id="modal-add-vac" class="modal hidden">
      <div class="modal-backdrop" onclick="closeAddVacModal()"></div>
      <div class="modal-box" id="add-vac-content"></div>
    </div>`;
}

window.openAddVacModal = function(userId) {
  const user = APP.users.find(u => u.id === userId);
  if (!user) return;
  document.getElementById('add-vac-content').innerHTML = `
    <h3 class="modal-title">Añadir Vacaciones — ${user.name}</h3>
    <div class="form-row"><label>Fecha Inicio</label><input type="date" id="vac-start" min="2026-01-01" max="2026-12-31"></div>
    <div class="form-row"><label>Fecha Fin</label><input type="date" id="vac-end" min="2026-01-01" max="2026-12-31"></div>
    <div id="vac-validation-msg" class="vac-msg hidden"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeAddVacModal()">Cancelar</button>
      <button class="btn-primary" onclick="saveVacation(${userId})">Guardar</button>
    </div>`;
  document.getElementById('modal-add-vac').classList.remove('hidden');
};
window.closeAddVacModal = function() { document.getElementById('modal-add-vac').classList.add('hidden'); };

window.saveVacation = function(userId) {
  const startStr = document.getElementById('vac-start').value;
  const endStr   = document.getElementById('vac-end').value;
  const msgEl    = document.getElementById('vac-validation-msg');
  const result   = window.validateVacationRequest(startStr, endStr, userId, APP.vacations);
  if (!result.valid) {
    msgEl.textContent = result.message;
    msgEl.className   = 'vac-msg error visible';
    return;
  }
  if (!APP.vacations[userId]) APP.vacations[userId] = [];
  APP.vacations[userId].push({ start: startStr, end: endStr });
  APP.vacations[userId].sort((a, b) => a.start.localeCompare(b.start));
  window.saveVacationsLocal(APP.vacations);
  window.appendAuditEntry('ADD_VACATION', `${startStr}→${endStr}`, '-', userId, APP.users.find(u=>u.id===userId)?.name, 'Admin');
  closeAddVacModal();
  renderApp();
  window.showToast(`Vacaciones añadidas correctamente.`, 'success');
};

window.deleteVacation = function(userId, index) {
  if (!confirm('¿Eliminar este periodo vacacional?')) return;
  APP.vacations[userId].splice(index, 1);
  window.saveVacationsLocal(APP.vacations);
  renderApp();
  window.showToast('Periodo vacacional eliminado.', 'warning');
};

// ─── REPORT VIEW ─────────────────────────────────────────────
function renderReportView() {
  const equity  = window.generateEquityReport(APP.users, APP.schedule, APP.vacations, APP.holidays);
  const monthly = window.generateMonthlySummary(APP.schedule, APP.users, APP.holidays, 2026);

  const eRows = equity.map(m => `
    <tr>
      <td>${m.name}</td>
      <td class="num">${m.morningDays}</td>
      <td class="num">${m.afternoonDays}</td>
      <td class="num">${m.vacationDays}</td>
      <td class="num">${m.totalWorked}</td>
      <td class="num"><div class="score-bar-wrap"><div class="score-bar" style="width:${m.equityScore}%"></div><span>${m.equityScore}%</span></div></td>
    </tr>`).join('');

  const mRows = monthly.map(m => `
    <tr>
      <td>${m.month}</td>
      <td class="num">${m.totalDays}</td>
      <td class="num">${m.closedDays}</td>
      <td class="num ${m.understaffedDays > 0 ? 'warn' : ''}">${m.understaffedDays}</td>
      <td class="num">${m.avgMorningCoverage}</td>
      <td class="num">${m.avgAfternoonCoverage}</td>
    </tr>`).join('');

  return `
    <div class="view-header">
      <h1 class="view-title">Informes y Auditoría</h1>
      <p class="view-sub">Métricas de equidad anual y trazabilidad de cambios</p>
    </div>
    <div class="toolbar">
      <button class="btn-primary" onclick="window.exportEquityReportCSV(APP.users,APP.schedule,APP.vacations,APP.holidays)">⬇ Exportar Equidad CSV</button>
      <button class="btn-secondary" onclick="window.exportScheduleCSV(APP.schedule,APP.users)">⬇ Exportar Cuadrante CSV</button>
    </div>
    <section class="section-card">
      <h2 class="section-title">Equidad por Técnico</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Técnico</th><th>Días Mañana</th><th>Días Tarde</th><th>Vacaciones</th><th>Total Trabajado</th><th>Score Equidad</th></tr></thead>
          <tbody>${eRows || '<tr><td colspan="6" class="empty-row">Sin datos.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="section-card">
      <h2 class="section-title">Resumen Mensual</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Mes</th><th>Días</th><th>Cierres</th><th>Baja Cobertura</th><th>Cobertura Mañana</th><th>Cobertura Tarde</th></tr></thead>
          <tbody>${mRows}</tbody>
        </table>
      </div>
    </section>
    <section class="section-card">
      <h2 class="section-title">Log de Auditoría</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Timestamp</th><th>Acción</th><th>Fecha/Rango</th><th>Técnico</th><th>Por</th></tr></thead>
          <tbody>
            ${APP.auditTrail.slice(-20).reverse().map(e => `
              <tr>
                <td class="mono">${e.timestamp.replace('T',' ').slice(0,19)}</td>
                <td><span class="audit-tag">${e.action}</span></td>
                <td class="mono">${e.date||'-'}</td>
                <td>${e.userName||'-'}</td>
                <td>${e.performedBy||'-'}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="empty-row">Sin registros.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;
}

// ─── SETTINGS VIEW ───────────────────────────────────────────
function renderSettingsView() {
  return `
    <div class="view-header">
      <h1 class="view-title">Configuración y Datos</h1>
      <p class="view-sub">Backup, restauración y ajustes del sistema</p>
    </div>
    <section class="section-card">
      <h2 class="section-title">Backup de Datos</h2>
      <p class="section-desc">Exporta o restaura los datos operativos (cuadrante y vacaciones). La configuración y credenciales nunca se almacenan localmente.</p>
      <div class="toolbar">
        <button class="btn-primary" onclick="window.exportBackup()">⬇ Exportar Backup JSON</button>
        <label class="btn-secondary file-btn">⬆ Importar Backup<input type="file" accept=".json" onchange="handleImportBackup(event)" style="display:none"></label>
      </div>
    </section>
    <section class="section-card">
      <h2 class="section-title">Leyenda de Festivos</h2>
      <div class="legend-grid">
        <div class="legend-item"><span class="legend-dot dot-closure"></span>Cierre total (Año Nuevo, Navidad) — sin servicio</div>
        <div class="legend-item"><span class="legend-dot dot-national"></span>Festivo nacional — 2 mañana + 2 tarde</div>
        <div class="legend-item"><span class="legend-dot dot-alicante"></span>Festivo Alicante/CV — 4 mañana + 2 tarde</div>
        <div class="legend-item"><span class="legend-dot dot-normal"></span>Día normal (lun-vie) — equipo completo</div>
      </div>
    </section>
    <section class="section-card danger-zone">
      <h2 class="section-title">⚠ Zona de Peligro</h2>
      <p class="section-desc">Elimina todos los datos locales del navegador de forma permanente.</p>
      <button class="btn-danger" onclick="confirmClearData()">🗑 Borrar Todos los Datos Locales</button>
    </section>
    <section class="section-card">
      <h2 class="section-title">Acerca de</h2>
      <div class="about-info">
        <p><strong>Planificador de Turnos</strong> v${APP.config?.version||'2.0.0'}</p>
        <p>Gestión de cuadrantes IT · Alicante 2026 · Sin backend · GitHub Pages</p>
      </div>
    </section>`;
}

window.handleImportBackup = function(event) {
  const file = event.target.files[0];
  window.importBackup(file, function(schedule, vacations) {
    APP.schedule = schedule; APP.vacations = vacations; renderApp();
  });
};
window.confirmClearData = function() {
  if (confirm('⚠ ¿Eliminar TODOS los datos locales?')) {
    window.clearAllLocalData(); APP.schedule = {}; APP.vacations = {}; APP.auditTrail = []; renderApp();
  }
};

// ─── ADMIN ───────────────────────────────────────────────────
// Antídoto #4: window scoping. Antídoto #5: sin doble disparo.
window.toggleAdminMode = function() {
  if (APP.isAdmin) {
    APP.isAdmin = false; updateAdminUI();
    window.showToast('Sesión de administrador cerrada.', 'info'); return;
  }
  document.getElementById('modal-admin').classList.remove('hidden');
  const input = document.getElementById('admin-password-input');
  if (input) {
    input.value = ''; input.focus();
    input.removeAttribute('onkeydown');
    input.removeEventListener('keydown', handleAdminKeydown);
    input.addEventListener('keydown', handleAdminKeydown);
  }
};

async function handleAdminKeydown(e) {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (!val) return; // Antídoto #5
    await submitAdminPassword();
  }
}

window.submitAdminPassword = async function() {
  const input = document.getElementById('admin-password-input');
  const val   = input ? input.value.trim() : '';
  if (!val) { window.showToast('Introduce la contraseña.', 'warning'); return; }
  const hash = await window.sha256(val);
  if (input) input.value = '';
  if (hash === APP.config.adminHash) {
    APP.isAdmin = true;
    document.getElementById('modal-admin').classList.add('hidden');
    updateAdminUI();
    window.showToast('✓ Acceso de administrador concedido.', 'success');
    renderApp();
  } else {
    window.showToast('❌ Contraseña incorrecta.', 'error');
    document.getElementById('admin-error-msg').classList.remove('hidden');
  }
};

window.closeAdminModal = function() { document.getElementById('modal-admin').classList.add('hidden'); };

function updateAdminUI() {
  const btn   = document.getElementById('admin-toggle-btn');
  const badge = document.getElementById('admin-badge');
  if (btn)   { btn.textContent = APP.isAdmin ? '🔓 Admin ON' : '🔐 Admin'; btn.classList.toggle('btn-admin-active', APP.isAdmin); }
  if (badge) { badge.style.display = APP.isAdmin ? 'flex' : 'none'; }
}

function showLoadingOverlay(v) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = v ? 'flex' : 'none';
}

// ============================================================
// app.js — Aequitas WFM
// Orquestador principal de UI, controlador de eventos del DOM
// Antídoto #1: Cache-busting activo en todos los fetch()
// Antídoto #2: NUNCA leer config/hashes desde localStorage
// Antídoto #4: Window scoping de todas las funciones de UI
// Antídoto #5: Sin doble disparo de eventos
// ============================================================

// ─── Estado global de la aplicación ─────────────────────────
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

// ─── Inicialización ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  showLoadingOverlay(true);
  try {
    await loadStaticData();
    loadOperationalData();
    renderApp();
    setupNavigation();
    showLoadingOverlay(false);
    window.showToast('Aequitas WFM cargado correctamente.', 'success', 2500);
  } catch (err) {
    showLoadingOverlay(false);
    document.getElementById('app-root').innerHTML =
      `<div class="fatal-error">
        <h2>Error de inicialización</h2>
        <p>${err.message}</p>
        <button onclick="location.reload()">Reintentar</button>
      </div>`;
    console.error('Init error:', err);
  }
});

/**
 * Carga los archivos JSON estáticos con cache-busting (Antídoto #1).
 * NUNCA persiste config/hashes en localStorage (Antídoto #2).
 */
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

/**
 * Carga solo datos operativos desde localStorage (Antídoto #2).
 */
function loadOperationalData() {
  APP.schedule   = window.loadScheduleLocal();
  APP.vacations  = window.loadVacationsLocal();
  APP.auditTrail = window.loadAuditTrail();
}

// ─── Navegación principal ────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', function() {
      const view = this.dataset.nav;
      navigateTo(view);
    });
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
    case 'dashboard':  root.innerHTML = renderDashboard();  break;
    case 'schedule':   root.innerHTML = renderScheduleView(); break;
    case 'vacations':  root.innerHTML = renderVacationsView(); break;
    case 'report':     root.innerHTML = renderReportView();   break;
    case 'settings':   root.innerHTML = renderSettingsView(); break;
    default:           root.innerHTML = renderDashboard();
  }
  bindViewEvents();
}

// ─── DASHBOARD ───────────────────────────────────────────────
function renderDashboard() {
  const today      = window.formatDateLocal(new Date());
  const todayData  = APP.schedule[today] || null;
  const totalDays  = Object.keys(APP.schedule).length;
  const vacEntries = Object.values(APP.vacations).flat().length;

  const onVacToday = APP.users.filter(u => window.isOnVacation(u.id, today, APP.vacations));
  const closedToday = todayData && todayData.closed;

  let todayCard = '';
  if (closedToday) {
    todayCard = `<div class="today-card closed"><span class="closed-badge">🔒 Servicio Cerrado</span><p>${todayData.holiday || 'Festivo'}</p></div>`;
  } else if (todayData) {
    const morningNames   = (todayData.morning   || []).map(id => APP.users.find(u => u.id === id)?.name || id);
    const afternoonNames = (todayData.afternoon || []).map(id => APP.users.find(u => u.id === id)?.name || id);
    todayCard = `
      <div class="today-card">
        <div class="shift-row">
          <span class="shift-label morning-label">☀ Mañana (08-17)</span>
          <div class="tech-chips">${morningNames.map(n => `<span class="chip">${n}</span>`).join('') || '<span class="chip empty">Sin asignar</span>'}</div>
        </div>
        <div class="shift-row">
          <span class="shift-label afternoon-label">🌙 Tarde (15-24)</span>
          <div class="tech-chips">${afternoonNames.map(n => `<span class="chip chip-afternoon">${n}</span>`).join('') || '<span class="chip empty">Sin asignar</span>'}</div>
        </div>
      </div>`;
  } else {
    todayCard = `<div class="today-card empty-state"><p>Sin cuadrante generado para hoy.</p><button class="btn-primary" onclick="navigateTo('schedule')">Ir al Planificador</button></div>`;
  }

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
      <div class="team-grid">
        ${APP.users.map(u => {
          const onVac   = window.isOnVacation(u.id, today, APP.vacations);
          const used    = window.getVacationDaysUsed(u.id, APP.vacations);
          const pct     = Math.min(100, Math.round((used / u.vacationDaysTotal) * 100));
          const status  = onVac ? 'vacation' : (closedToday ? 'holiday' : 'working');
          const statusLabel = { vacation: '🏖 Vacaciones', holiday: '🔒 Festivo', working: '✓ Activo' }[status];
          return `
            <div class="team-member ${status}">
              <div class="member-avatar">${u.name.split(' ').map(w => w[0]).join('').slice(0,2)}</div>
              <div class="member-info">
                <div class="member-name">${u.name}</div>
                <div class="member-profile">${u.profile === 'senior' ? '⭐ Senior' : '· Standard'}</div>
                <div class="vac-bar-wrap">
                  <div class="vac-bar" style="width:${pct}%"></div>
                </div>
                <div class="vac-label">${used}/${u.vacationDaysTotal} días vacaciones</div>
              </div>
              <span class="status-badge status-${status}">${statusLabel}</span>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

// ─── SCHEDULE VIEW ───────────────────────────────────────────
function renderScheduleView() {
  const months = [];
  for (let m = 0; m < 12; m++) {
    months.push({ value: String(m + 1).padStart(2,'0'), label: window.monthName(m) });
  }

  const today    = new Date();
  const curMonth = String(today.getMonth() + 1).padStart(2,'0');
  const curYear  = today.getFullYear();

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
      ${renderCalendar(curYear, parseInt(curMonth) - 1)}
    </div>

    <!-- Modal Generador -->
    <div id="modal-generator" class="modal hidden">
      <div class="modal-backdrop" onclick="closeGeneratorModal()"></div>
      <div class="modal-box">
        <h3 class="modal-title">⚡ Generar Cuadrante Automático</h3>
        <p class="modal-desc">Selecciona el rango de fechas para ejecutar el motor de asignación en cascada.</p>
        <div class="form-row">
          <label>Fecha Inicio</label>
          <input type="date" id="gen-start" value="2026-01-01">
        </div>
        <div class="form-row">
          <label>Fecha Fin</label>
          <input type="date" id="gen-end" value="2026-12-31">
        </div>
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

    <!-- Modal edición de día -->
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
};

function renderCalendar(year, month) {
  const label = document.getElementById('schedule-month-label');
  if (label) label.textContent = `${window.monthName(month)} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  let startDow   = firstDay.getDay(); // 0=Dom
  if (startDow === 0) startDow = 7;  // Lun=1..Dom=7
  startDow -= 1; // offset celdas vacías

  let html = `<div class="calendar-grid">
    <div class="cal-header-row">
      ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => `<div class="cal-head">${d}</div>`).join('')}
    </div>
    <div class="cal-body">`;

  // Celdas vacías
  for (let i = 0; i < startDow; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData   = APP.schedule[dateStr];
    const isGlobal  = window.isGlobalHoliday(dateStr, APP.holidays);
    const holName   = window.getHolidayName(dateStr, APP.holidays);
    const isToday   = dateStr === window.formatDateLocal(new Date());

    let cellClass = 'cal-cell';
    if (isGlobal)   cellClass += ' cell-holiday';
    if (isToday)    cellClass += ' cell-today';
    if (!dayData)   cellClass += ' cell-empty';

    let content = '';
    if (isGlobal) {
      content = `<span class="cell-closed">🔒</span><span class="cell-hol-name">${holName || 'Festivo'}</span>`;
    } else if (dayData) {
      const mc = (dayData.morning   || []).length;
      const ac = (dayData.afternoon || []).length;
      content = `<div class="cell-counts">
        <span class="cc-m" title="Mañana">☀${mc}</span>
        <span class="cc-a" title="Tarde">🌙${ac}</span>
        ${(mc < 2 || ac < 2) ? '<span class="cell-warn" title="Cobertura insuficiente">⚠</span>' : ''}
      </div>`;
    } else {
      content = '<span class="cell-no-data">—</span>';
    }

    html += `<div class="${cellClass}" onclick="openEditDayModal('${dateStr}')">
      <div class="cell-day-num">${d}</div>
      ${content}
    </div>`;
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

  if (!startStr || !endStr) {
    window.showToast('Indica fechas de inicio y fin.', 'warning');
    return;
  }

  const weeks = window.getWeeksInRange(startStr, endStr);
  if (weeks.length === 0) {
    window.showToast('Rango de fechas inválido.', 'error');
    return;
  }

  const { schedule, contingencies } = window.generateSchedule(
    weeks, APP.users, APP.vacations, APP.holidays, APP.config
  );

  if (overwrite) {
    APP.schedule = schedule;
  } else {
    Object.assign(APP.schedule, schedule);
  }

  window.saveScheduleLocal(APP.schedule);
  window.appendAuditEntry('AUTO_GENERATE', `${startStr}→${endStr}`, 'all', null, null, APP.isAdmin ? 'Admin' : 'Sistema');

  closeGeneratorModal();

  let msg = `✅ Cuadrante generado: ${Object.keys(schedule).length} días planificados.`;
  if (contingencies.length > 0) {
    msg += `\n\n⚠ ${contingencies.length} semanas con ajuste manual recomendado:\n` + contingencies.join('\n');
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

  const userCheckboxes = (shift) => APP.users.map(u => {
    const checked = (dayData[shift] || []).includes(u.id) ? 'checked' : '';
    return `<label class="check-label">
      <input type="checkbox" data-uid="${u.id}" data-shift="${shift}" ${checked}
             onchange="toggleUserInShift('${dateStr}', this)">
      <span class="check-tech">${u.profile === 'senior' ? '⭐' : '·'} ${u.name}</span>
    </label>`;
  }).join('');

  const content = document.getElementById('edit-day-content');
  content.innerHTML = `
    <h3 class="modal-title">Editar Día: ${title}</h3>
    <div class="form-row checkbox-row">
      <input type="checkbox" id="day-closed" ${dayData.closed ? 'checked' : ''}
             onchange="toggleDayClosed('${dateStr}', this)">
      <label for="day-closed">🔒 Marcar como festivo / cierre de servicio</label>
    </div>
    <div id="shift-editor" ${dayData.closed ? 'style="display:none"' : ''}>
      <div class="shift-editor-col">
        <h4>☀ Mañana (08:00-17:00)</h4>
        <div class="checkboxes-list">${userCheckboxes('morning')}</div>
      </div>
      <div class="shift-editor-col">
        <h4>🌙 Tarde (15:00-24:00)</h4>
        <div class="checkboxes-list">${userCheckboxes('afternoon')}</div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeEditDayModal()">Cerrar</button>
      <button class="btn-primary" onclick="saveDayEdits('${dateStr}')">Guardar Cambios</button>
    </div>`;

  document.getElementById('modal-edit-day').classList.remove('hidden');
};

window.toggleDayClosed = function(dateStr, checkbox) {
  const se = document.getElementById('shift-editor');
  if (se) se.style.display = checkbox.checked ? 'none' : '';
};

window.toggleUserInShift = function(dateStr, checkbox) {
  // Visual only — saved on "Guardar Cambios"
};

window.saveDayEdits = function(dateStr) {
  const isClosed = document.getElementById('day-closed').checked;
  if (isClosed) {
    APP.schedule[dateStr] = { morning: [], afternoon: [], closed: true, holiday: 'Manual' };
  } else {
    const morningIds   = [];
    const afternoonIds = [];
    document.querySelectorAll('[data-shift="morning"]:checked').forEach(cb => {
      morningIds.push(parseInt(cb.dataset.uid));
    });
    document.querySelectorAll('[data-shift="afternoon"]:checked').forEach(cb => {
      afternoonIds.push(parseInt(cb.dataset.uid));
    });
    APP.schedule[dateStr] = {
      morning:   morningIds,
      afternoon: afternoonIds,
      closed:    false,
      holiday:   window.getHolidayName(dateStr, APP.holidays)
    };
  }
  window.saveScheduleLocal(APP.schedule);
  window.appendAuditEntry('MANUAL_EDIT', dateStr, 'all', null, null, 'Admin');
  closeEditDayModal();

  const wrap = document.getElementById('schedule-calendar-wrap');
  if (wrap) wrap.innerHTML = renderCalendar(window._scheduleYear, window._scheduleMonth);
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
          <div class="member-avatar">${u.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
          <div>
            <div class="member-name">${u.name} <span class="profile-tag">${u.profile}</span></div>
            <div class="vac-bar-wrap wide">
              <div class="vac-bar" style="width:${pct}%"></div>
            </div>
            <div class="vac-label">${used} / ${u.vacationDaysTotal} días usados (${pct}%)</div>
          </div>
          ${APP.isAdmin ? `<button class="btn-add" onclick="openAddVacModal(${u.id})">+ Añadir</button>` : ''}
        </div>
        <div class="vac-list">
          ${vacs.length === 0
            ? '<p class="empty-vac">Sin periodos registrados.</p>'
            : vacs.map((v, i) => `
              <div class="vac-entry">
                <span class="vac-range">📅 ${v.start} → ${v.end}</span>
                <span class="vac-days">${Math.round((window.parseLocalDate(v.end) - window.parseLocalDate(v.start)) / 86400000) + 1} días</span>
                ${APP.isAdmin ? `<button class="btn-del" onclick="deleteVacation(${u.id}, ${i})">✕</button>` : ''}
              </div>`).join('')
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
      ⚠ <strong>Restricción 2026:</strong> Para vacaciones con inicio igual o posterior al <strong>15 de julio</strong>, solo se permiten semanas íntegras de lunes a domingo (mínimo 7 días, múltiplos de 7).
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

  const content = document.getElementById('add-vac-content');
  content.innerHTML = `
    <h3 class="modal-title">Añadir Vacaciones — ${user.name}</h3>
    <div class="form-row">
      <label>Fecha Inicio</label>
      <input type="date" id="vac-start" min="2026-01-01" max="2026-12-31">
    </div>
    <div class="form-row">
      <label>Fecha Fin</label>
      <input type="date" id="vac-end" min="2026-01-01" max="2026-12-31">
    </div>
    <div id="vac-validation-msg" class="vac-msg hidden"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeAddVacModal()">Cancelar</button>
      <button class="btn-primary" onclick="saveVacation(${userId})">Guardar</button>
    </div>`;

  document.getElementById('modal-add-vac').classList.remove('hidden');
};

window.closeAddVacModal = function() {
  document.getElementById('modal-add-vac').classList.add('hidden');
};

window.saveVacation = function(userId) {
  const startStr = document.getElementById('vac-start').value;
  const endStr   = document.getElementById('vac-end').value;
  const msgEl    = document.getElementById('vac-validation-msg');

  const result = window.validateVacationRequest(startStr, endStr, userId, APP.vacations);

  if (!result.valid) {
    msgEl.textContent = result.message;
    msgEl.className   = 'vac-msg error visible';
    return;
  }

  if (!APP.vacations[userId]) APP.vacations[userId] = [];
  APP.vacations[userId].push({ start: startStr, end: endStr });
  APP.vacations[userId].sort((a, b) => a.start.localeCompare(b.start));

  window.saveVacationsLocal(APP.vacations);
  window.appendAuditEntry('ADD_VACATION', `${startStr}→${endStr}`, '-', userId,
    APP.users.find(u => u.id === userId)?.name, 'Admin');

  closeAddVacModal();
  renderApp();
  window.showToast(`Vacaciones añadidas para ${APP.users.find(u => u.id === userId)?.name}.`, 'success');
};

window.deleteVacation = function(userId, index) {
  if (!confirm('¿Eliminar este periodo vacacional?')) return;
  APP.vacations[userId].splice(index, 1);
  window.saveVacationsLocal(APP.vacations);
  renderApp();
  window.showToast('Periodo vacacional eliminado.', 'warning');
};

// ─── REPORT VIEW ────────────────────────────────────────────
function renderReportView() {
  const equity   = window.generateEquityReport(APP.users, APP.schedule, APP.vacations, APP.holidays);
  const monthly  = window.generateMonthlySummary(APP.schedule, APP.users, APP.holidays, 2026);

  const equityRows = equity.map(m => `
    <tr>
      <td>${m.name}</td>
      <td><span class="profile-tag">${m.profile}</span></td>
      <td class="num">${m.morningDays}</td>
      <td class="num">${m.afternoonDays}</td>
      <td class="num">${m.vacationDays}</td>
      <td class="num">${m.totalWorked}</td>
      <td class="num">
        <div class="score-bar-wrap">
          <div class="score-bar" style="width:${m.equityScore}%"></div>
          <span>${m.equityScore}%</span>
        </div>
      </td>
    </tr>`).join('');

  const monthlyRows = monthly.map(m => `
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
      <button class="btn-primary" onclick="window.exportEquityReportCSV(APP.users, APP.schedule, APP.vacations, APP.holidays)">⬇ Exportar Equidad CSV</button>
      <button class="btn-secondary" onclick="window.exportScheduleCSV(APP.schedule, APP.users)">⬇ Exportar Cuadrante CSV</button>
    </div>

    <section class="section-card">
      <h2 class="section-title">Equidad por Técnico</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Técnico</th><th>Perfil</th><th>Días Mañana</th><th>Días Tarde</th>
            <th>Días Vacaciones</th><th>Total Trabajado</th><th>Score Equidad</th>
          </tr></thead>
          <tbody>${equityRows || '<tr><td colspan="7" class="empty-row">Sin datos de cuadrante.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section class="section-card">
      <h2 class="section-title">Resumen Mensual de Cobertura</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Mes</th><th>Días Totales</th><th>Cierres</th><th>Días Baja Cobertura</th>
            <th>Cobertura Mañana (avg)</th><th>Cobertura Tarde (avg)</th>
          </tr></thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>
    </section>

    <section class="section-card">
      <h2 class="section-title">Log de Auditoría (últimas 20 acciones)</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Timestamp</th><th>Acción</th><th>Fecha/Rango</th><th>Técnico</th><th>Ejecutado por</th></tr></thead>
          <tbody>
            ${APP.auditTrail.slice(-20).reverse().map(e => `
              <tr>
                <td class="mono">${e.timestamp.replace('T', ' ').slice(0,19)}</td>
                <td><span class="audit-tag">${e.action}</span></td>
                <td class="mono">${e.date || '-'}</td>
                <td>${e.userName || '-'}</td>
                <td>${e.performedBy || '-'}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="empty-row">Sin registros de auditoría.</td></tr>'}
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
      <p class="section-desc">Exporta o restaura los datos operativos del sistema (cuadrante y vacaciones). La configuración y credenciales nunca se almacenan localmente.</p>
      <div class="toolbar">
        <button class="btn-primary" onclick="window.exportBackup()">⬇ Exportar Backup JSON</button>
        <label class="btn-secondary file-btn">
          ⬆ Importar Backup
          <input type="file" accept=".json" onchange="handleImportBackup(event)" style="display:none">
        </label>
      </div>
    </section>
    <section class="section-card danger-zone">
      <h2 class="section-title">⚠ Zona de Peligro</h2>
      <p class="section-desc">Esta acción eliminará todos los datos locales del navegador de forma permanente.</p>
      <button class="btn-danger" onclick="confirmClearData()">🗑 Borrar Todos los Datos Locales</button>
    </section>
    <section class="section-card">
      <h2 class="section-title">Acerca de</h2>
      <div class="about-info">
        <p><strong>Aequitas WFM</strong> v${APP.config?.version || '2.0.0'}</p>
        <p>Controlador de Cuadrantes e Inteligencia de Turnos IT</p>
        <p>Alicante · Operativo 2026 · Sin backend · GitHub Pages</p>
      </div>
    </section>`;
}

window.handleImportBackup = function(event) {
  const file = event.target.files[0];
  window.importBackup(file, function(schedule, vacations) {
    APP.schedule  = schedule;
    APP.vacations = vacations;
    renderApp();
  });
};

window.confirmClearData = function() {
  if (confirm('⚠ ¿Estás seguro? Se eliminarán TODOS los datos locales (cuadrante, vacaciones y auditoría). Esta acción no se puede deshacer.')) {
    window.clearAllLocalData();
    APP.schedule  = {};
    APP.vacations = {};
    APP.auditTrail = [];
    renderApp();
  }
};

// ─── MODO ADMINISTRADOR ──────────────────────────────────────
// Antídoto #5: control limpio sin doble disparo
window.toggleAdminMode = function() {
  if (APP.isAdmin) {
    APP.isAdmin = false;
    updateAdminUI();
    window.showToast('Sesión de administrador cerrada.', 'info');
    return;
  }
  // Mostrar modal de contraseña
  document.getElementById('modal-admin').classList.remove('hidden');
  const input = document.getElementById('admin-password-input');
  if (input) {
    input.value = '';
    input.focus();
    // Antídoto #5: eliminar onkeydown residual antes de añadir listener
    input.removeAttribute('onkeydown');
    input.removeEventListener('keydown', handleAdminKeydown);
    input.addEventListener('keydown', handleAdminKeydown);
  }
};

async function handleAdminKeydown(e) {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (!val) return; // Antídoto #5: ignorar si vacío
    await submitAdminPassword();
  }
}

window.submitAdminPassword = async function() {
  const input = document.getElementById('admin-password-input');
  const val   = input ? input.value.trim() : '';
  if (!val) {
    window.showToast('Introduce la contraseña.', 'warning');
    return;
  }

  const hash = await window.sha256(val);
  if (input) input.value = ''; // Limpiar por seguridad inmediatamente

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

window.closeAdminModal = function() {
  document.getElementById('modal-admin').classList.add('hidden');
};

function updateAdminUI() {
  const btn     = document.getElementById('admin-toggle-btn');
  const badge   = document.getElementById('admin-badge');
  if (btn) {
    btn.textContent  = APP.isAdmin ? '🔓 Admin ON' : '🔐 Admin';
    btn.classList.toggle('btn-admin-active', APP.isAdmin);
  }
  if (badge) badge.style.display = APP.isAdmin ? 'flex' : 'none';
}

// ─── Auxiliares de vista ─────────────────────────────────────
function bindViewEvents() {
  // Nada adicional: todos los manejadores son window.xxx o listeners adjuntos inline
}

function showLoadingOverlay(visible) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

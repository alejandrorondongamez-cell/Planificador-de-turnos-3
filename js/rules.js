// ============================================================
// rules.js — Aequitas WFM
// Validador de restricciones legales y alertas de cobertura
// ============================================================

/**
 * Valida las restricciones de un periodo vacacional antes de guardarlo.
 * Antídoto #3 aplicado: usamos parseLocalDate internamente.
 * @returns { valid: boolean, message: string }
 */
window.validateVacationRequest = function(startStr, endStr, userId, existingVacations) {
  if (!startStr || !endStr) {
    return { valid: false, message: 'Debes indicar fecha de inicio y fin.' };
  }

  const start = window.parseLocalDate(startStr);
  const end   = window.parseLocalDate(endStr);

  if (end < start) {
    return { valid: false, message: 'La fecha de fin debe ser igual o posterior a la de inicio.' };
  }

  // ─── Regla crítica 2026 ──────────────────────────────────────
  // Si inicio >= 15 de julio de 2026 → solo semanas íntegras (múltiplos de 7)
  const cutoff = new Date(2026, 6, 15, 0, 0, 0, 0); // 15 julio 2026
  if (start >= cutoff) {
    const diffMs   = end.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

    if (start.getDay() !== 1) {
      return {
        valid: false,
        message: `⚠️ Restricción 2026: Para vacaciones a partir del 15 de julio, el periodo debe comenzar en LUNES. Fecha seleccionada: ${window.dayNameFull(start.getDay())}.`
      };
    }
    if (end.getDay() !== 0) {
      return {
        valid: false,
        message: `⚠️ Restricción 2026: Para vacaciones a partir del 15 de julio, el periodo debe terminar en DOMINGO. Fecha seleccionada: ${window.dayNameFull(end.getDay())}.`
      };
    }
    if (diffDays < 7 || diffDays % 7 !== 0) {
      return {
        valid: false,
        message: `⚠️ Restricción 2026: Las vacaciones a partir del 15 de julio deben ser semanas completas (mínimo 7 días, múltiplo de 7). Días seleccionados: ${diffDays}.`
      };
    }
  }

  // ─── Solapamiento con otras vacaciones del mismo técnico ─────
  if (existingVacations && existingVacations[userId]) {
    for (const v of existingVacations[userId]) {
      const vs = window.parseLocalDate(v.start);
      const ve = window.parseLocalDate(v.end);
      if (window.rangesOverlap(start, end, vs, ve)) {
        return {
          valid: false,
          message: `❌ El periodo solicitado se solapa con unas vacaciones ya registradas (${v.start} → ${v.end}).`
        };
      }
    }
  }

  return { valid: true, message: 'Periodo vacacional válido.' };
};

/**
 * Verifica si un técnico está de vacaciones en una fecha concreta.
 */
window.isOnVacation = function(userId, dateStr, vacations) {
  if (!vacations || !vacations[userId]) return false;
  const d = window.parseLocalDate(dateStr);
  for (const v of vacations[userId]) {
    const vs = window.parseLocalDate(v.start);
    const ve = window.parseLocalDate(v.end);
    if (d >= vs && d <= ve) return true;
  }
  return false;
};

/**
 * Verifica si una fecha es festivo de cierre total.
 * Delega en el scheduler que tiene la lógica de tipos.
 */
window.isGlobalHoliday = function(dateStr, holidays) {
  if (!holidays || !holidays.closure) return false;
  return holidays.closure.some(h => h.date === dateStr);
};

/**
 * Obtiene el nombre de un festivo para una fecha dada (cualquier categoría).
 */
window.getHolidayName = function(dateStr, holidays) {
  if (!holidays) return null;
  const all = [
    ...(holidays.closure  || []),
    ...(holidays.national || []),
    ...(holidays.alicante || [])
  ];
  const found = all.find(h => h.date === dateStr);
  return found ? found.name : null;
};

/**
 * Calcula la cobertura de un día dado el schedule y devuelve alertas.
 * @returns { morning: number, afternoon: number, warnings: string[] }
 */
window.getDayCoverage = function(dateStr, schedule, users, vacations) {
  if (!schedule[dateStr]) {
    return { morning: 0, afternoon: 0, warnings: ['Sin datos de cuadrante para este día.'] };
  }
  const day = schedule[dateStr];
  const warnings = [];
  const morningCount   = (day.morning   || []).length;
  const afternoonCount = (day.afternoon || []).length;

  if (morningCount < 2) {
    warnings.push(`Cobertura mañana insuficiente: ${morningCount}/2 técnicos.`);
  }
  if (afternoonCount < 2) {
    warnings.push(`Cobertura tarde insuficiente: ${afternoonCount}/2 técnicos.`);
  }
  return { morning: morningCount, afternoon: afternoonCount, warnings };
};

/**
 * Calcula días de vacaciones ya consumidos por un técnico en el año.
 */
window.getVacationDaysUsed = function(userId, vacations) {
  if (!vacations || !vacations[userId]) return 0;
  let total = 0;
  for (const v of vacations[userId]) {
    const s = window.parseLocalDate(v.start);
    const e = window.parseLocalDate(v.end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    total += diff;
  }
  return total;
};

/**
 * Valida todo el equipo y devuelve un informe de restricciones.
 */
window.validateFullTeam = function(users, vacations, schedule, holidays) {
  const issues = [];

  users.forEach(u => {
    const used = window.getVacationDaysUsed(u.id, vacations);
    if (used > u.vacationDaysTotal) {
      issues.push({
        type: 'vacation_exceeded',
        userId: u.id,
        name: u.name,
        message: `${u.name} tiene ${used} días de vacaciones asignados, pero solo le corresponden ${u.vacationDaysTotal}.`
      });
    }
  });

  return issues;
};

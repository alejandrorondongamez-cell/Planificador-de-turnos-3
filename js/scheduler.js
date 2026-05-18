// ============================================================
// scheduler.js — Aequitas WFM
// Motor de optimización por asignación en cascada de 3 niveles
// ============================================================

/**
 * Genera el cuadrante completo para un rango de semanas.
 * @param {Date[]} weeks     - Array de fechas de lunes
 * @param {Array}  users     - Lista de técnicos
 * @param {Object} vacations - Vacaciones indexadas por userId
 * @param {Object} holidays  - Festivos
 * @param {Object} config    - Configuración del motor
 * @returns { schedule: Object, contingencies: string[] }
 */
window.generateSchedule = function(weeks, users, vacations, holidays, config) {
  const schedule       = {};
  const contingencies  = [];

  // Penalizaciones acumuladas por técnico (para equidad)
  const penalties       = {};
  const afternoonCounts = {}; // total tardes del año
  const lastAfternoonWeekIndex = {}; // índice de semana de última tarde
  const monthAfternoonCount   = {}; // tardes por mes-año

  users.forEach(u => {
    penalties[u.id]              = 0;
    afternoonCounts[u.id]        = 0;
    lastAfternoonWeekIndex[u.id] = -99;
    monthAfternoonCount[u.id]    = {};
  });

  weeks.forEach((monday, weekIdx) => {
    const weekDays = window.getWeekDays(monday);
    const monthKey = `${monday.getFullYear()}-${monday.getMonth()}`;

    // Determinar técnicos disponibles esta semana (ningún día de la semana en vacaciones continua)
    const availableUsers = users.filter(u => {
      // Un técnico está "no disponible" si está de vacaciones durante el lunes de esa semana
      const mondayStr = window.formatDateLocal(monday);
      return !window.isOnVacation(u.id, mondayStr, vacations);
    });

    const seniors   = availableUsers.filter(u => u.profile === 'senior');
    const standards = availableUsers.filter(u => u.profile === 'standard');

    // ── Nivel 1: par óptimo Senior + Standard sin restricciones blandas violadas ──
    let afternoonPair = null;
    let usedLevel     = 1;

    const findBestPair = (seniorList, standardList, allowConsecutive = false, allowOverMonth = false) => {
      let bestScore    = Infinity;
      let bestSenior   = null;
      let bestStandard = null;

      for (const s of seniorList) {
        if (!allowConsecutive && (weekIdx - lastAfternoonWeekIndex[s.id]) <= 1) continue;
        if (!allowOverMonth) {
          const mc = (monthAfternoonCount[s.id][monthKey] || 0);
          if (mc >= config.algorithmWeights.afternoonCountMonthlyLimit) continue;
        }
        for (const st of standardList) {
          if (!allowConsecutive && (weekIdx - lastAfternoonWeekIndex[st.id]) <= 1) continue;
          if (!allowOverMonth) {
            const mc = (monthAfternoonCount[st.id][monthKey] || 0);
            if (mc >= config.algorithmWeights.afternoonCountMonthlyLimit) continue;
          }
          const score = (penalties[s.id] + penalties[st.id]) -
                        config.algorithmWeights.seniorStandardBonus;
          if (score < bestScore) {
            bestScore    = score;
            bestSenior   = s;
            bestStandard = st;
          }
        }
      }
      return (bestSenior && bestStandard) ? [bestSenior, bestStandard] : null;
    };

    // Nivel 1
    afternoonPair = findBestPair(seniors, standards);

    // Nivel 2: romper restricción blanda de consecutivo
    if (!afternoonPair && (seniors.length > 0 && standards.length > 0)) {
      afternoonPair = findBestPair(seniors, standards, true, false);
      if (afternoonPair) {
        usedLevel = 2;
        contingencies.push(`⚠ Semana ${window.formatDateLocal(monday)}: Nivel 2 activado — restricción de consecutividad relajada para ${afternoonPair.map(u => u.name).join(' + ')}.`);
      }
    }

    // Nivel 2b: romper límite mensual
    if (!afternoonPair && (seniors.length > 0 && standards.length > 0)) {
      afternoonPair = findBestPair(seniors, standards, true, true);
      if (afternoonPair) {
        usedLevel = 2;
        contingencies.push(`⚠ Semana ${window.formatDateLocal(monday)}: Nivel 2 activado — límite mensual de tardes superado para ${afternoonPair.map(u => u.name).join(' + ')}.`);
      }
    }

    // Nivel 3: cualquier pareja disponible
    if (!afternoonPair && availableUsers.length >= 2) {
      usedLevel = 3;
      // Ordenar por menor penalización
      const sorted = [...availableUsers].sort((a, b) => penalties[a.id] - penalties[b.id]);
      afternoonPair = [sorted[0], sorted[1]];
      contingencies.push(`🚨 Semana ${window.formatDateLocal(monday)}: Nivel 3 (Emergencia) — pareja no estándar: ${afternoonPair.map(u => u.name).join(' + ')}. Revisión manual recomendada.`);
    }

    if (!afternoonPair) {
      contingencies.push(`❌ Semana ${window.formatDateLocal(monday)}: Sin personal disponible suficiente. Semana sin cuadrante de tarde.`);
      afternoonPair = [];
    }

    const afternoonIds = afternoonPair.map(u => u.id);

    // Actualizar contadores
    afternoonPair.forEach(u => {
      penalties[u.id]              += config.algorithmWeights.consecutiveAfternoonPenalty * usedLevel;
      afternoonCounts[u.id]        += 1;
      lastAfternoonWeekIndex[u.id]  = weekIdx;
      if (!monthAfternoonCount[u.id][monthKey]) monthAfternoonCount[u.id][monthKey] = 0;
      monthAfternoonCount[u.id][monthKey]++;
    });

    // Asignar cada día de la semana
    weekDays.forEach(day => {
      const dateStr  = window.formatDateLocal(day);
      const isGlobal = window.isGlobalHoliday(dateStr, holidays);

      if (isGlobal) {
        // Festivo global: cierre de servicio
        schedule[dateStr] = {
          morning:   [],
          afternoon: [],
          closed:    true,
          holiday:   window.getHolidayName(dateStr, holidays)
        };
        return;
      }

      // Técnicos de mañana: los disponibles ese día que NO están en tarde
      const morningUsers = availableUsers.filter(u => {
        if (afternoonIds.includes(u.id)) return false;
        return !window.isOnVacation(u.id, dateStr, vacations);
      });

      // Técnicos de tarde: los del par, solo si no están de vacaciones ese día
      const afternoonUsers = afternoonPair.filter(u =>
        !window.isOnVacation(u.id, dateStr, vacations)
      );

      schedule[dateStr] = {
        morning:   morningUsers.map(u => u.id),
        afternoon: afternoonUsers.map(u => u.id),
        closed:    false,
        holiday:   window.getHolidayName(dateStr, holidays)
      };
    });
  });

  return { schedule, contingencies };
};

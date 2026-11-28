const TYPE_MAP = {
    kayaking: 'Kayaking', k1: 'Kayaking', c1: 'C1', c2: 'C2',
    run: 'Run', running: 'Run', laufen: 'Run',
    ride: 'Ride', cycling: 'Ride', radfahren: 'Ride',
    swim: 'Swim', swimming: 'Swim', schwimmen: 'Swim',
    weighttraining: 'WeightTraining', strength: 'WeightTraining', krafttraining: 'WeightTraining', gym: 'WeightTraining',
    restday: 'RestDay', rest: 'RestDay', ruhetag: 'RestDay'
};

export function calendarTypeForSession(session = {}) {
    const discipline = String(session.discipline || '').trim().toLowerCase();
    if (['k1', 'c1', 'c2'].includes(discipline)) return TYPE_MAP[discipline];
    const type = String(session.type || '').trim().toLowerCase();
    return TYPE_MAP[type] || null;
}

export function calendarCategoryForSession(session = {}) {
    const raw = String(session.category || session.type || '').toLowerCase();
    if (raw.includes('rest') || raw.includes('ruhetag')) return 'rest';
    if (raw.includes('interval') || raw.includes('intervall') || raw.includes('lz') || raw.includes('hz')) return 'interval';
    if (raw.includes('strength') || raw.includes('kraft')) return 'strength';
    if (raw.includes('reg') || raw.includes('recovery') || raw.includes('regen')) return 'reg';
    if (raw.includes('tech') || raw.includes('technik')) return 'tech';
    return 'ga';
}

export function buildWeeklyPlanCalendarEntries(plan, existingEntries = []) {
    const additions = [];
    const skipped = [];
    const seenDraftEntries = new Set();
    if (!plan?.id || !Array.isArray(plan.sessions)) return { additions, skipped: ['Ungültiger Wochenplan'] };
    for (const session of plan.sessions) {
        const type = calendarTypeForSession(session);
        const linked = existingEntries.some(item => item.sourceWeeklyPlanId === plan.id && item.sourceWeeklySessionId === session.id);
        const normalizedName = String(session.name || '').trim().toLocaleLowerCase('de');
        const signature = session.date + '|' + normalizedName + '|' + type;
        const duplicate = existingEntries.some(item => item.date === session.date
            && String(item.name || '').trim().toLocaleLowerCase('de') === normalizedName
            && item.type === type)
            || (normalizedName && seenDraftEntries.has(signature));
        if (linked || duplicate) {
            skipped.push(session.name || 'Unbenannte Einheit');
            continue;
        }
        if (!type) {
            skipped.push((session.name || 'Unbenannte Einheit') + ' (Trainingsart nicht eindeutig)');
            continue;
        }
        const description = [
            session.objective ? 'Ziel: ' + session.objective : '',
            session.intensity ? 'Intensität: ' + session.intensity : '',
            session.warmup ? 'Aufwärmen: ' + session.warmup : '',
            session.mainSet ? 'Hauptteil: ' + session.mainSet : '',
            session.cooldown ? 'Abwärmen: ' + session.cooldown : '',
            session.raceFormat ? 'Rennformat: ' + session.raceFormat : '',
            session.waterType ? 'Gewässer: ' + session.waterType : '',
            session.notes || ''
        ].filter(Boolean).join('\n');
        if (normalizedName) seenDraftEntries.add(signature);
        additions.push({
            id: 'season-' + plan.id + '-' + session.id,
            date: session.date,
            name: session.name,
            type,
            duration: session.durationMinutes,
            targetTss: null,
            category: calendarCategoryForSession(session),
            desc: description,
            sourceWeeklyPlanId: plan.id,
            sourceWeeklySessionId: session.id
        });
    }
    return { additions, skipped };
}

const dateKey = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : null;

function sportKey(value) {
    const key = String(value || '').trim().toLowerCase();
    const aliases = {
        kayaking: 'k1', kayak: 'k1', k1: 'k1',
        c1: 'c1', canadian: 'c1', c2: 'c2',
        run: 'run', running: 'run', laufen: 'run',
        ride: 'ride', cycling: 'ride', radfahren: 'ride', bike: 'ride',
        swim: 'swim', swimming: 'swim', schwimmen: 'swim',
        weighttraining: 'strength', strength: 'strength', krafttraining: 'strength', gym: 'strength'
    };
    return aliases[key] || null;
}

/**
 * Conservative comparison of an approved weekly plan with recorded activities.
 * Only a unique same-day/same-sport pair is matched. It never marks an item
 * completed or changes the stored plan.
 */
export function buildAdaptiveWeekReview(plan, activities = [], today = new Date().toISOString().slice(0,10)) {
    if (!plan || !dateKey(plan.weekStartDate) || !dateKey(plan.weekEndDate)) {
        throw new Error('Ungültiger Wochenplan.');
    }
    const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
    const actual = (Array.isArray(activities) ? activities : []).filter(item => {
        const date = dateKey(item?.date);
        return date && date >= plan.weekStartDate && date <= plan.weekEndDate;
    });
    const plannedByKey = new Map();
    const actualByKey = new Map();
    const keyFor = (date, sport) => date + '|' + sport;
    sessions.forEach(session => {
        const date = dateKey(session.date);
        const sport = sportKey(session.discipline || session.type);
        if (!date || !sport) return;
        const key = keyFor(date, sport);
        plannedByKey.set(key, [...(plannedByKey.get(key) || []), session]);
    });
    actual.forEach(activity => {
        const date = dateKey(activity.date);
        const sport = sportKey(activity.discipline) || sportKey(activity.type);
        if (!date || !sport) return;
        const key = keyFor(date, sport);
        actualByKey.set(key, [...(actualByKey.get(key) || []), activity]);
    });

    const matched = [];
    const ambiguous = [];
    const unmatchedPlanned = [];
    const usedActual = new Set();
    sessions.forEach(session => {
        const date = dateKey(session.date);
        const sport = sportKey(session.discipline || session.type);
        if (!date || !sport) {
            unmatchedPlanned.push({ session, reason: 'Trainingsart oder Datum nicht eindeutig' });
            return;
        }
        const key = keyFor(date, sport);
        const plannedMatches = plannedByKey.get(key) || [];
        const actualMatches = actualByKey.get(key) || [];
        if (plannedMatches.length === 1 && actualMatches.length === 1) {
            matched.push({ planned: session, actual: actualMatches[0] });
            usedActual.add(actual.indexOf(actualMatches[0]));
        } else if (actualMatches.length > 0) {
            ambiguous.push({ session, activityCount: actualMatches.length, reason: 'Mehrere mögliche Zuordnungen am selben Tag und in derselben Sportart' });
        } else if (date <= today) {
            unmatchedPlanned.push({ session, reason: 'Keine eindeutig passende Aktivität dokumentiert; nicht automatisch als ausgefallen gewertet' });
        }
    });
    const unplannedActivities = actual.filter((activity, index) => !usedActual.has(index)).map(activity => ({
        activity,
        reason: sportKey(activity.type || activity.discipline) ? 'Keine eindeutige geplante Einheit zugeordnet' : 'Sportart nicht eindeutig zuordenbar'
    }));
    const upcoming = sessions.filter(session => dateKey(session.date) > today);
    return {
        weekStartDate: plan.weekStartDate,
        weekEndDate: plan.weekEndDate,
        status: plan.status,
        matched,
        ambiguous,
        unmatchedPlanned,
        unplannedActivities,
        upcoming,
        coverage: {
            actualActivityCount: actual.length,
            matchedCount: matched.length,
            ambiguousCount: ambiguous.length,
            unconfirmedPastPlanCount: unmatchedPlanned.length,
            unplannedActivityCount: unplannedActivities.length,
            upcomingCount: upcoming.length
        },
        limitations: 'Zuordnungen erfolgen nur bei genau einer geplanten und genau einer tatsächlich dokumentierten Einheit am selben Tag und in derselben Sportart. Fehlende Zuordnung beweist keinen Trainingsausfall; Aktivitätsdaten können unvollständig sein.'
    };
}

const dateKey = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : null;

function sportKey(value) {
    const key = String(value || '').trim().toLowerCase();
    const aliases = {
        kayaking: 'k1', kayak: 'k1', k1: 'k1', c1: 'c1', canadian: 'c1', c2: 'c2',
        run: 'run', running: 'run', laufen: 'run', ride: 'ride', cycling: 'ride',
        radfahren: 'ride', bike: 'ride', swim: 'swim', swimming: 'swim', schwimmen: 'swim',
        weighttraining: 'strength', strength: 'strength', krafttraining: 'strength', gym: 'strength'
    };
    return aliases[key] || null;
}

export function areSameAdaptiveSports(session, activity) {
    const plannedSport = sportKey(session?.discipline || session?.type);
    const actualSport = sportKey(activity?.discipline) || sportKey(activity?.type);
    return Boolean(plannedSport && actualSport && plannedSport === actualSport);
}

function isRestDay(session) {
    const type = String(session?.type || '').trim().toLowerCase();
    const category = String(session?.category || '').trim().toLowerCase();
    return ['restday', 'rest', 'ruhetag'].includes(type) || category === 'rest';
}

/** Conservative plan/activity comparison. Explicit links override auto matching. */
export function buildAdaptiveWeekReview(plan, activities = [], today = new Date().toISOString().slice(0,10)) {
    if (!plan || !dateKey(plan.weekStartDate) || !dateKey(plan.weekEndDate)) throw new Error('Ungültiger Wochenplan.');
    const sessions = (Array.isArray(plan.sessions) ? plan.sessions : []).filter(session => !isRestDay(session));
    const actual = (Array.isArray(activities) ? activities : []).filter(item => {
        const date = dateKey(item?.date);
        return date && date >= plan.weekStartDate && date <= plan.weekEndDate;
    });
    const sessionById = new Map(sessions.filter(item => item?.id).map(item => [String(item.id), item]));
    const actualById = new Map();
    actual.forEach((activity, index) => {
        const id = activity?.id == null ? '' : String(activity.id);
        if (id && !actualById.has(id)) actualById.set(id, { activity, index });
    });
    const usedActual = new Set(), usedSessions = new Set(), seenActivityIds = new Set(), seenSessionIds = new Set();
    const matched = [], manualLinks = [], completedWithoutActivity = [], missed = [], manualStatuses = [];
    for (const entry of Array.isArray(plan.manualSessionStatuses) ? plan.manualSessionStatuses : []) {
        const sessionId = String(entry?.sessionId ?? '');
        const status = entry?.status;
        const session = sessionById.get(sessionId);
        if (!session || !['completed_unrecorded', 'missed'].includes(status) || dateKey(session.date) > today || seenSessionIds.has(sessionId)) continue;
        const date = dateKey(session.date);
        const sport = sportKey(session.discipline || session.type);
        if (sport) {
            const sameSportPlans = sessions.filter(item => dateKey(item.date) === date && sportKey(item.discipline || item.type) === sport);
            const sameSportActivities = actual.filter(item => dateKey(item.date) === date && (sportKey(item.discipline) || sportKey(item.type)) === sport);
            if (sameSportPlans.length === 1 && sameSportActivities.length === 1) continue;
        }
        seenSessionIds.add(sessionId);
        usedSessions.add(sessionId);
        const record = { session, status };
        manualStatuses.push(record);
        if (status === 'completed_unrecorded') completedWithoutActivity.push(record);
        else missed.push(record);
    }
    for (const link of Array.isArray(plan.manualActivityLinks) ? plan.manualActivityLinks : []) {
        const sessionId = String(link?.sessionId ?? ''), activityId = String(link?.activityId ?? '');
        const session = sessionById.get(sessionId), found = actualById.get(activityId);
        if (!session || !found || seenActivityIds.has(activityId) || seenSessionIds.has(sessionId)) continue;
        if (dateKey(found.activity.date) !== dateKey(session.date) || !areSameAdaptiveSports(session, found.activity)) continue;
        seenActivityIds.add(activityId); seenSessionIds.add(sessionId);
        usedActual.add(found.index); usedSessions.add(sessionId);
        manualLinks.push({ sessionId, activityId });
        matched.push({ planned: session, actual: found.activity, matchType: 'manual' });
    }
    const keyFor = (date, sport) => date + '|' + sport;
    const plannedByKey = new Map(), actualByKey = new Map();
    sessions.forEach(session => {
        if (usedSessions.has(String(session.id ?? ''))) return;
        const date = dateKey(session.date), sport = sportKey(session.discipline || session.type);
        if (!date || !sport) return;
        const key = keyFor(date, sport);
        plannedByKey.set(key, [...(plannedByKey.get(key) || []), session]);
    });
    actual.forEach((activity, index) => {
        if (usedActual.has(index)) return;
        const date = dateKey(activity.date), sport = sportKey(activity.discipline) || sportKey(activity.type);
        if (!date || !sport) return;
        const key = keyFor(date, sport);
        actualByKey.set(key, [...(actualByKey.get(key) || []), { activity, index }]);
    });
    const ambiguous = [], unmatchedPlanned = [];
    sessions.forEach(session => {
        if (usedSessions.has(String(session.id ?? ''))) return;
        const date = dateKey(session.date), sport = sportKey(session.discipline || session.type);
        if (!date || !sport) {
            unmatchedPlanned.push({ session, reason: 'Trainingsart oder Datum nicht eindeutig' });
            return;
        }
        const key = keyFor(date, sport), plannedMatches = plannedByKey.get(key) || [], actualMatches = actualByKey.get(key) || [];
        if (plannedMatches.length === 1 && actualMatches.length === 1) {
            const found = actualMatches[0];
            matched.push({ planned: session, actual: found.activity, matchType: 'automatic' });
            usedActual.add(found.index);
        } else if (actualMatches.length) {
            ambiguous.push({ session, activityCount: actualMatches.length, candidates: actualMatches.map(item => item.activity), reason: 'Mehrere mögliche Zuordnungen am selben Tag und in derselben Sportart' });
        } else if (date <= today) {
            unmatchedPlanned.push({ session, reason: 'Keine eindeutig passende Aktivität dokumentiert; nicht automatisch als ausgefallen gewertet' });
        }
    });
    const unplannedActivities = actual.filter((activity, index) => !usedActual.has(index)).map(activity => ({
        activity, reason: sportKey(activity.discipline) || sportKey(activity.type)
            ? 'Keine eindeutige geplante Einheit zugeordnet' : 'Sportart nicht eindeutig zuordenbar'
    }));
    const upcoming = sessions.filter(session => dateKey(session.date) > today);
    return {
        weekStartDate: plan.weekStartDate, weekEndDate: plan.weekEndDate, status: plan.status,
        matched, manualLinks, manualStatuses, completedWithoutActivity, missed, ambiguous, unmatchedPlanned, unplannedActivities, upcoming,
        coverage: {
            actualActivityCount: actual.length, matchedCount: matched.length, manualMatchedCount: manualLinks.length,
            completedWithoutActivityCount: completedWithoutActivity.length, missedCount: missed.length,
            ambiguousCount: ambiguous.length, unconfirmedPastPlanCount: unmatchedPlanned.length,
            unplannedActivityCount: unplannedActivities.length, upcomingCount: upcoming.length
        },
        limitations: 'Automatische Zuordnung erfolgt nur bei genau einer geplanten und einer tatsächlichen Einheit am selben Tag und in derselben Sportart. Manuelle Zuordnungen gelten nur für denselben Kalendertag. Fehlende Zuordnung beweist keinen Trainingsausfall; Aktivitätsdaten können unvollständig sein.'
    };
}

/**
 * KAJO season planning domain model.
 *
 * Stores season intent and phase targets without generating or changing
 * individual workouts. The athlete remains in control of every plan change.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_MODES = new Set(['hybrid', 'adaptive', 'fixed']);
const ALLOWED_HORIZONS = new Set(['season', 'block', 'week']);

function cleanText(value, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validDate(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}


export function normalizeSeasonPhase(phase = {}) {
    return {
        id: cleanText(phase.id, 80),
        name: cleanText(phase.name, 120),
        type: cleanText(phase.type, 60),
        startDate: validDate(phase.startDate) ? phase.startDate : null,
        endDate: validDate(phase.endDate) ? phase.endDate : null,
        objective: cleanText(phase.objective, 1000),
        focus: Array.isArray(phase.focus) ? phase.focus.map(item => cleanText(item, 120)).filter(Boolean).slice(0, 20) : [],
        targetHoursPerWeek: phase.targetHoursPerWeek == null || phase.targetHoursPerWeek === '' ? null : Number(phase.targetHoursPerWeek),
        targetTrainingDaysPerWeek: phase.targetTrainingDaysPerWeek == null || phase.targetTrainingDaysPerWeek === '' ? null : Number(phase.targetTrainingDaysPerWeek),
        targetSessionsPerDay: phase.targetSessionsPerDay == null || phase.targetSessionsPerDay === '' ? null : Number(phase.targetSessionsPerDay),
        disciplineFocus: Array.isArray(phase.disciplineFocus) ? phase.disciplineFocus.map(item => cleanText(item, 60)).filter(Boolean).slice(0, 12) : [],
        notes: cleanText(phase.notes, 1000),
        acwrTargetMin: phase.acwrTargetMin == null || phase.acwrTargetMin === '' ? null : Number(phase.acwrTargetMin),
        acwrTargetMax: phase.acwrTargetMax == null || phase.acwrTargetMax === '' ? null : Number(phase.acwrTargetMax),
        tsbTargetMin: phase.tsbTargetMin == null || phase.tsbTargetMin === '' ? null : Number(phase.tsbTargetMin),
        tsbTargetMax: phase.tsbTargetMax == null || phase.tsbTargetMax === '' ? null : Number(phase.tsbTargetMax)
    };
}

export function normalizeWeeklySession(session = {}) {
    return {
        id: cleanText(session.id, 100),
        date: validDate(session.date) ? session.date : null,
        name: cleanText(session.name, 160),
        type: cleanText(session.type, 60),
        category: cleanText(session.category, 60),
        discipline: cleanText(session.discipline, 40),
        raceFormat: cleanText(session.raceFormat, 40),
        waterType: cleanText(session.waterType, 40),
        durationMinutes: session.durationMinutes == null || session.durationMinutes === '' ? null : Number(session.durationMinutes),
        targetLoad: session.targetLoad == null || session.targetLoad === '' ? null : Number(session.targetLoad),
        intensity: cleanText(session.intensity, 120),
        objective: cleanText(session.objective, 500),
        warmup: cleanText(session.warmup, 1000),
        mainSet: cleanText(session.mainSet, 2000),
        cooldown: cleanText(session.cooldown, 1000),
        notes: cleanText(session.notes, 1000)
    };
}

export function normalizeWeeklyPlan(weeklyPlan = {}) {
    return {
        id: cleanText(weeklyPlan.id, 100),
        weekStartDate: validDate(weeklyPlan.weekStartDate) ? weeklyPlan.weekStartDate : null,
        weekEndDate: validDate(weeklyPlan.weekEndDate) ? weeklyPlan.weekEndDate : null,
        phaseId: cleanText(weeklyPlan.phaseId, 80),
        status: ['draft', 'approved', 'completed', 'archived'].includes(weeklyPlan.status) ? weeklyPlan.status : 'draft',
        objective: cleanText(weeklyPlan.objective, 1000),
        focus: Array.isArray(weeklyPlan.focus) ? weeklyPlan.focus.map(item => cleanText(item, 120)).filter(Boolean).slice(0, 20) : [],
        rationale: cleanText(weeklyPlan.rationale, 2000),
        openQuestions: Array.isArray(weeklyPlan.openQuestions) ? weeklyPlan.openQuestions.map(item => cleanText(item, 300)).filter(Boolean).slice(0, 10) : [],
        sessions: Array.isArray(weeklyPlan.sessions) ? weeklyPlan.sessions.map(normalizeWeeklySession).slice(0, 30) : [],
        manualActivityLinks: Array.isArray(weeklyPlan.manualActivityLinks)
            ? weeklyPlan.manualActivityLinks.map(link => ({
                sessionId: cleanText(link?.sessionId, 100),
                activityId: cleanText(link?.activityId, 160)
            })).filter(link => link.sessionId && link.activityId).slice(0, 30) : [],
        manualSessionStatuses: Array.isArray(weeklyPlan.manualSessionStatuses)
            ? weeklyPlan.manualSessionStatuses.map(entry => ({
                sessionId: cleanText(entry?.sessionId, 100),
                status: ['completed_unrecorded', 'missed'].includes(entry?.status) ? entry.status : null,
                updatedAt: typeof entry?.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt)) ? entry.updatedAt : null
            })).filter(entry => entry.sessionId && entry.status).slice(0, 30) : [],
        athleteApprovedAt: typeof weeklyPlan.athleteApprovedAt === 'string' && Number.isFinite(Date.parse(weeklyPlan.athleteApprovedAt)) ? weeklyPlan.athleteApprovedAt : null,
        createdAt: typeof weeklyPlan.createdAt === 'string' ? weeklyPlan.createdAt : null,
        updatedAt: typeof weeklyPlan.updatedAt === 'string' ? weeklyPlan.updatedAt : null
    };
}

export function validateWeeklyPlan(input, seasonInput) {
    const weekly = normalizeWeeklyPlan(input);
    const season = normalizeSeasonPlan(seasonInput);
    const errors = [];
    if (!season) return { valid: false, errors: ['Ein Saisonplan fehlt.'], weeklyPlan: weekly };
    if (season.status !== 'active' || !season.athleteApprovedAt) errors.push('Wochenpläne können erst auf Basis eines freigegebenen Saisonplans erstellt werden.');
    if (!weekly.id) errors.push('Dem Wochenplan fehlt eine eindeutige ID.');
    if (!weekly.weekStartDate || !weekly.weekEndDate) errors.push('Der Wochenzeitraum ist ungültig.');
    if (weekly.weekStartDate && weekly.weekEndDate) {
        const start = new Date(weekly.weekStartDate + 'T12:00:00Z');
        const end = new Date(weekly.weekEndDate + 'T12:00:00Z');
        const days = Math.round((end - start) / 86400000);
        if (days !== 6) errors.push('Ein Wochenplan muss genau sieben Kalendertage umfassen.');
        if (start.getUTCDay() !== 1) errors.push('Der Wochenstart muss ein Montag sein.');
        if (season.startDate && weekly.weekStartDate < season.startDate) errors.push('Die Woche beginnt vor der Saison.');
        if (season.endDate && weekly.weekEndDate > season.endDate) errors.push('Die Woche endet nach der Saison.');
    }
    const phase = season.phases.find(item => item.id === weekly.phaseId);
    if (!phase) errors.push('Die zugeordnete Saisonphase wurde nicht gefunden.');
    else if (weekly.weekStartDate && weekly.weekEndDate
        && (weekly.weekStartDate < phase.startDate || weekly.weekEndDate > phase.endDate)) {
        errors.push('Der Wochenplan muss vollständig innerhalb seiner Saisonphase liegen.');
    }
    if (!weekly.objective) errors.push('Ein Wochenziel fehlt.');
    if (!weekly.sessions.length) errors.push('Der Wochenplan enthält keine Trainingseinheiten.');
    const sessionIds = new Set();
    const sessionsByDate = new Map();
    weekly.sessions.forEach((session, index) => {
        const label = session.name || 'Einheit ' + (index + 1);
        if (!session.id) errors.push(label + ': eindeutige ID fehlt.');
        if (session.id && sessionIds.has(session.id)) errors.push(label + ': ID ist doppelt vergeben.');
        sessionIds.add(session.id);
        if (session.date) {
            const sameDay = sessionsByDate.get(session.date) || [];
            sameDay.push(session);
            sessionsByDate.set(session.date, sameDay);
        }
        const isRestDay = ['restday', 'rest', 'ruhetag'].includes(String(session.type || '').toLowerCase())
            || String(session.category || '').toLowerCase() === 'rest';
        if (isRestDay && (session.durationMinutes != null || session.targetLoad != null)) {
            errors.push(label + ': ein Ruhetag darf keine geplante Dauer oder Zielbelastung enthalten.');
        }
        if (!session.date || !weekly.weekStartDate || !weekly.weekEndDate
            || session.date < weekly.weekStartDate || session.date > weekly.weekEndDate) {
            errors.push(label + ': Datum liegt außerhalb der geplanten Woche.');
        }
        if (!session.name || !session.type) errors.push(label + ': Name und Trainingsart sind erforderlich.');
        if (session.durationMinutes != null && (!Number.isFinite(session.durationMinutes) || session.durationMinutes <= 0)) {
            errors.push(label + ': Dauer muss eine positive Minutenzahl sein.');
        }
        if (session.targetLoad != null && (!Number.isFinite(session.targetLoad) || session.targetLoad < 0)) {
            errors.push(label + ': Zielbelastung muss eine nicht-negative Zahl sein.');
        }
    });
    for (const [date, daySessions] of sessionsByDate) {
        const hasRestDay = daySessions.some(session =>
            ['restday', 'rest', 'ruhetag'].includes(String(session.type || '').toLowerCase())
            || String(session.category || '').toLowerCase() === 'rest'
        );
        if (hasRestDay && daySessions.length > 1) {
            errors.push('Am ' + date + ' kann ein Ruhetag nicht mit weiteren geplanten Einheiten kombiniert werden.');
        }
    }
    return { valid: errors.length === 0, errors, weeklyPlan: weekly };
}

export function normalizeSeasonPlan(plan) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
    return {
        schemaVersion: 1,
        id: cleanText(plan.id, 100),
        name: cleanText(plan.name, 120),
        planningMode: ALLOWED_MODES.has(plan.planningMode) ? plan.planningMode : 'hybrid',
        planningHorizon: ALLOWED_HORIZONS.has(plan.planningHorizon) ? plan.planningHorizon : 'season',
        status: ['draft', 'active', 'completed', 'archived'].includes(plan.status) ? plan.status : 'draft',
        startDate: validDate(plan.startDate) ? plan.startDate : null,
        endDate: validDate(plan.endDate) ? plan.endDate : null,
        primaryGoal: cleanText(plan.primaryGoal, 1000),
        secondaryGoals: Array.isArray(plan.secondaryGoals) ? plan.secondaryGoals.map(item => cleanText(item, 300)).filter(Boolean).slice(0, 20) : [],
        phases: Array.isArray(plan.phases) ? plan.phases.map(normalizeSeasonPhase).slice(0, 30) : [],
        weeklyPlans: Array.isArray(plan.weeklyPlans) ? plan.weeklyPlans.map(normalizeWeeklyPlan).slice(0, 60) : [],
        athleteApprovedAt: typeof plan.athleteApprovedAt === 'string' && Number.isFinite(Date.parse(plan.athleteApprovedAt)) ? plan.athleteApprovedAt : null,
        createdAt: typeof plan.createdAt === 'string' ? plan.createdAt : null,
        updatedAt: typeof plan.updatedAt === 'string' ? plan.updatedAt : null
    };
}

export function validateSeasonPlan(input) {
    const plan = normalizeSeasonPlan(input);
    const errors = [];
    if (!plan) return { valid: false, errors: ['Der Saisonplan muss ein Objekt sein.'], plan: null };
    if (!plan.id) errors.push('Dem Saisonplan fehlt eine eindeutige ID.');
    if (!plan.startDate) errors.push('Ein gültiges Startdatum fehlt.');
    if (!plan.endDate) errors.push('Ein gültiges Enddatum fehlt.');
    if (plan.startDate && plan.endDate && plan.endDate < plan.startDate) errors.push('Das Saisonende liegt vor dem Saisonstart.');
    if (!plan.primaryGoal) errors.push('Ein übergeordnetes Saisonziel fehlt.');

    const phases = plan.phases.filter(phase => phase.startDate || phase.endDate || phase.name);
    phases.forEach((phase, index) => {
        const label = phase.name || 'Trainingsphase ' + (index + 1);
        if (!phase.id) errors.push(label + ': eindeutige ID fehlt.');
        if (!phase.name) errors.push(label + ': Name fehlt.');
        if (!phase.startDate || !phase.endDate) errors.push(label + ': gültiger Zeitraum fehlt.');
        if (phase.startDate && phase.endDate && phase.endDate < phase.startDate) errors.push(label + ': Enddatum liegt vor dem Startdatum.');
        if (plan.startDate && phase.startDate && phase.startDate < plan.startDate) errors.push(label + ': beginnt vor der Saison.');
        if (plan.endDate && phase.endDate && phase.endDate > plan.endDate) errors.push(label + ': endet nach der Saison.');
        for (const key of ['targetHoursPerWeek', 'targetTrainingDaysPerWeek', 'targetSessionsPerDay']) {
            const value = phase[key];
            if (value != null && (!Number.isFinite(value) || value < 0)) errors.push(label + ': ' + key + ' muss eine nicht-negative Zahl sein.');
        }
        if (phase.targetTrainingDaysPerWeek != null && phase.targetTrainingDaysPerWeek > 7) errors.push(label + ': Trainingstage pro Woche dürfen höchstens 7 sein.');
    });

    const ordered = phases.filter(phase => phase.startDate && phase.endDate).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let index = 1; index < ordered.length; index++) {
        if (ordered[index].startDate <= ordered[index - 1].endDate) {
            errors.push('Trainingsphasen dürfen sich zeitlich nicht überschneiden: ' + ordered[index - 1].name + ' / ' + ordered[index].name + '.');
        }
    }
    return { valid: errors.length === 0, errors, plan };
}

/** Compact, source-explicit season context for the AI Coach. */
export function buildSeasonPlanningContext(input, races = []) {
    const validation = validateSeasonPlan(input);
    const plan = validation.plan;
    if (!plan) return { available: false, reason: 'Kein Saisonplan gespeichert.', planningMode: 'hybrid', planningHorizon: 'season' };
    const raceRecords = (Array.isArray(races) ? races : [])
        .filter(race => race && typeof race === 'object')
        .map(race => ({
            name: cleanText(race.name, 160) || null,
            date: validDate(race.date) ? race.date : null,
            priority: ['A', 'B', 'C', 'D', 'E'].includes(String(race.prio || '').toUpperCase()) ? String(race.prio).toUpperCase() : null,
            location: cleanText(race.location, 160) || null,
            sport: cleanText(race.sport, 80) || null,
            target: cleanText(race.target, 300) || null
        }))
        .filter(race => race.date)
        .sort((a, b) => a.date.localeCompare(b.date));
    return {
        available: true,
        validation: { valid: validation.valid, errors: validation.errors },
        planningMode: plan.planningMode,
        planningHorizon: plan.planningHorizon,
        status: plan.status,
        season: {
            id: plan.id, name: plan.name || null, startDate: plan.startDate, endDate: plan.endDate,
            primaryGoal: plan.primaryGoal || null, secondaryGoals: plan.secondaryGoals,
            athleteApprovedAt: plan.athleteApprovedAt
        },
        phases: plan.phases,
        competitions: raceRecords,
        decisionRules: [
            'Der Saisonplan ist die langfristige Orientierung; Tagesempfehlungen berücksichtigen tatsächliche Belastung, Regeneration, Gesundheit und aktuelle Rückmeldungen.',
            'Im Hybridmodus darf der Coach Anpassungen vorschlagen, aber Saison- und Wochenpläne nicht selbstständig ändern.',
            'Änderungen an Phasen, Saisonzielen oder priorisierten Wettkampfvorbereitungen benötigen ausdrückliche Zustimmung der Athletin.',
            'Leite keine konkreten Phasen, Trainingsumfänge oder Wettkampfziele aus fehlenden Angaben ab.',
            'Wettkämpfe sind anhand der übermittelten Datensätze zu priorisieren; fehlende oder ungültige Prioritäten bleiben unbekannt.'
        ]
    };
}

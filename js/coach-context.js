/**
 * coach-context.js
 *
 * Erstellt aus dem bestehenden Athletenprofil einen strukturierten,
 * transparenten Kontext für den passiven KAJO-Coach.
 *
 * Dieses Modul berechnet keine Leistungskennzahlen und verändert weder
 * Profil noch Trainingsplanung. Freitextangaben bleiben Nutzereingaben.
 */

const TEXT_FIELDS = [
    'sport',
    'discipline',
    'additionalDisciplines',
    'competitionFormats',
    'level',
    'club',
    'country',
    'federation',
    'trainingGroup',
    'coach',
    'trainingLocation',
    'athleticBackground',
    'nationalTitles',
    'competitionHistory',
    'personalRecords',
    'careerHistory',
    'careerNotes',
    'strengths',
    'developmentAreas',
    'trainingFocus',
    'trainingNotes',
    'knownLimitations',
    'trainingAvailability',
    'trainingConstraints',
    'equipment',
    'facilities',
    'season',
    'mainGoal',
    'seasonHighlights'
];

function cleanText(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
}

function parseList(value) {
    const text = cleanText(value);
    if (!text) return [];
    return [...new Set(text
        .split(/[,;\n]/)
        .map(item => item.trim())
        .filter(Boolean))];
}

function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/**
 * Gibt ausschließlich tatsächlich hinterlegte Profilinformationen zurück.
 * Fehlende Angaben bleiben null bzw. leere Listen und werden nicht ergänzt.
 */
export function buildAthleteContext(profile = {}) {
    const source = profile && typeof profile === 'object' && !Array.isArray(profile)
        ? profile
        : {};

    const context = {
        source: 'athlete_profile',
        profileCompleteness: 'partial',
        sport: {
            primary: cleanText(source.sport),
            primaryDiscipline: cleanText(source.discipline),
            additionalDisciplines: parseList(source.additionalDisciplines),
            competitionFormats: parseList(source.competitionFormats),
            level: cleanText(source.level),
            club: cleanText(source.club),
            country: cleanText(source.country),
            federation: cleanText(source.federation),
            trainingGroup: cleanText(source.trainingGroup),
            coach: cleanText(source.coach),
            trainingLocation: cleanText(source.trainingLocation),
            background: cleanText(source.athleticBackground)
        },
        career: {
            nationalTitles: cleanText(source.nationalTitles),
            competitionHistory: cleanText(source.competitionHistory),
            personalRecords: cleanText(source.personalRecords),
            history: cleanText(source.careerHistory),
            notes: cleanText(source.careerNotes)
        },
        performance: {
            maxHeartRateBpm: finiteNumber(source.maxHr),
            restingHeartRateBpm: finiteNumber(source.restingHr),
            thresholdHeartRateBpm: finiteNumber(source.thresholdHr),
            vo2max: finiteNumber(source.vo2max),
            vo2maxDate: cleanText(source.vo2maxDate),
            thresholdPowerWatts: finiteNumber(source.thresholdPower),
            thresholdPace: cleanText(source.thresholdPace),
            testSource: cleanText(source.testSource),
            strengths: cleanText(source.strengths),
            developmentAreas: cleanText(source.developmentAreas)
        },
        training: {
            daysPerWeek: finiteNumber(source.trainingDaysPerWeek),
            sessionsPerDay: finiteNumber(source.sessionsPerDay),
            gymAccess: typeof source.gymAccess === 'boolean' ? source.gymAccess : null,
            equipment: cleanText(source.equipment),
            facilities: cleanText(source.facilities),
            availability: cleanText(source.trainingAvailability),
            constraints: cleanText(source.trainingConstraints)
        },
        season: {
            period: cleanText(source.season),
            mainGoal: cleanText(source.mainGoal),
            highlights: cleanText(source.seasonHighlights),
            currentFocus: cleanText(source.trainingFocus)
        },
        healthAndIndividualNotes: {
            trainingNotes: cleanText(source.trainingNotes),
            knownLimitations: cleanText(source.knownLimitations)
        },
        completeness: {
            populatedFields: TEXT_FIELDS.filter(key => cleanText(source[key]) !== null).length,
            availableFields: TEXT_FIELDS.length,
            missingCoreFields: [
                ...(!cleanText(source.sport) ? ['sport'] : []),
                ...(!cleanText(source.discipline) ? ['discipline'] : []),
                ...(!cleanText(source.mainGoal) ? ['mainGoal'] : []),
                ...(!cleanText(source.season) ? ['season'] : [])
            ]
        }
    };

    context.profileCompleteness = context.completeness.missingCoreFields.length === 0
        ? 'core_complete'
        : 'partial';

    return context;
}

/**
 * Liefert eine kompakte, lesbare Darstellung für spätere Coach-Anfragen.
 * JSON statt zusammengebautem Freitext hält Feldgrenzen nachvollziehbar.
 */
export function serializeAthleteContext(profile = {}) {
    return JSON.stringify(buildAthleteContext(profile), null, 2);
}

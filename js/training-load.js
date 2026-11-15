import { getGarminHeartRateSeries, isGarminActivity } from './data-source.js';

/**
 * Adapted resting HR for a given activity date.
 * Uses the median of valid daily RHR values in the configured trailing window.
 * At least 60% of the window (minimum three observations) is required; otherwise a valid
 * profile restingHr may be used as an explicitly marked static fallback.
 */
export function getAdaptiveRestingHr(dailyCheckins, date, windowDays = 14, profile = {}) {
    const days = Math.min(28, Math.max(3, Math.round(Number(windowDays) || 14)));
    const endKey = String(date || '').slice(0, 10);
    if (endKey.length !== 10 || endKey[4] !== '-' || endKey[7] !== '-') return null;
    const end = new Date(endKey + 'T12:00:00');
    if (!Number.isFinite(end.getTime())) return null;
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    const startKey = [start.getFullYear(), String(start.getMonth()+1).padStart(2,'0'), String(start.getDate()).padStart(2,'0')].join('-');
    const readings = Object.entries(dailyCheckins || {})
        .filter(([key, row]) => key >= startKey && key <= endKey && row)
        .map(([key, row]) => ({ date: key, value: Number(row.garminRhr ?? row.rhr) }))
        .filter(item => Number.isFinite(item.value) && item.value >= 30 && item.value <= 120)
        .sort((a,b) => a.date.localeCompare(b.date));
    const minimumReadings = Math.max(3, Math.ceil(days * 0.6));
    if (readings.length >= minimumReadings) {
        const values = readings.map(item => item.value).sort((a,b) => a-b);
        const mid = Math.floor(values.length / 2);
        const median = values.length % 2 ? values[mid] : (values[mid-1] + values[mid]) / 2;
        return {
            value: Number(median.toFixed(1)),
            source: 'rolling-median',
            windowDays: days,
            readingCount: readings.length,
            startDate: startKey,
            endDate: endKey,
            quality: 'sufficient'
        };
    }
    const fallback = Number(profile?.restingHr);
    if (Number.isFinite(fallback) && fallback >= 30 && fallback <= 120) {
        return {
            value: fallback,
            source: 'profile-fallback',
            windowDays: days,
            readingCount: readings.length,
            startDate: startKey,
            endDate: endKey,
            quality: 'limited'
        };
    }
    return {
        value: null,
        source: 'unavailable',
        windowDays: days,
        readingCount: readings.length,
        startDate: startKey,
        endDate: endKey,
        quality: 'unavailable'
    };
}

/**
 * Five operational zones based on heart-rate reserve (Karvonen).
 * Boundaries are the upper limits of Z1–Z4 at 60/70/80/90% HRR;
 * all lower heart rates remain in Z1.
 */
export function calculateHeartRateReserveZones(maxHr, restingHr) {
    const maximum = Number(maxHr);
    const resting = Number(restingHr);
    if (!Number.isFinite(maximum) || maximum < 100 || maximum > 240
        || !Number.isFinite(resting) || resting < 30 || resting > 120
        || maximum <= resting + 20) return null;
    const reserve = maximum - resting;
    const zones = [0.60, 0.70, 0.80, 0.90].map(percent =>
        Math.round(resting + reserve * percent)
    );
    if (!zones.every((value, index) => index === 0 || value > zones[index-1])) return null;
    return zones;
}

function getAdaptiveZoneConfig(activity, settings, profile, dailyCheckins) {
    const maxHr = Number(profile?.maxHr);
    if (!Number.isFinite(maxHr) || maxHr < 100 || maxHr > 240) return null;
    const windowDays = settings?.heartRateZoneSettings?.restingHrWindowDays ?? 14;
    const resting = getAdaptiveRestingHr(
        dailyCheckins,
        String(activity?.date || '').slice(0,10),
        windowDays,
        profile
    );
    if (!resting || !Number.isFinite(resting.value)) return null;
    const zones = calculateHeartRateReserveZones(maxHr, resting.value);
    if (!zones) return null;
    return { zones, maxHr, restingHr: resting.value, restingHrSource: resting.source,
        restingHrWindowDays: resting.windowDays, restingHrReadingCount: resting.readingCount,
        restingHrQuality: resting.quality, heartRateReserve: maxHr - resting.value };
}

/* Garmin-only training-load calculation.
 * Weighted HR-zone minutes: Z1=1 ... Z5=5 points per minute.
 * This is a KAJO index, not TSS and not Garmin's native Training Load.
 */
export function calculateGarminZoneLoad(activity, settings, profile, dailyCheckins = {}) {
    // FIT-Zeitreihen können bei älteren/zusammengeführten Datensätzen bereits
    // vorhanden sein, auch wenn das Import-Flag fehlt. Nur Garmin-Aktivitäten
    // auswerten; beliebige lokale/Intervals-Telemetrie bleibt ausgeschlossen.
    if (!isGarminActivity(activity)) return null;
    const heartRateSeries = getGarminHeartRateSeries(activity);
    const hr = heartRateSeries?.hr, time = heartRateSeries?.time;
    const adaptive = getAdaptiveZoneConfig(activity, settings, profile, dailyCheckins);
    const zones = adaptive?.zones;
    if (!Array.isArray(zones)) return null;
    if (!Array.isArray(hr) || hr.length < 2) return null;
    const validZones = Array.isArray(zones) && zones.length === 4
        && zones.every(v => v != null && Number.isFinite(Number(v)) && Number(v) >= 40 && Number(v) <= 240)
        && zones.every((v, i) => i === 0 || Number(v) > Number(zones[i - 1]));
    if (!validZones) return null;
    const secondsByZone = [0,0,0,0,0];
    const durationSeconds = Number(activity.duration) > 0 ? Number(activity.duration) * 60 : null;
    const validTime = Array.isArray(time) && time.length === hr.length
        && time.every(value => Number.isFinite(Number(value)))
        && time.slice(1).every((value, index) => Number(value) > Number(time[index])
            && Number(value) - Number(time[index]) <= 30);
    // Gleiche Zeitgewichtung wie die Zonenverteilung in der Aktivitätenansicht:
    // eine vollständig valide Zeitachse hat Vorrang; andernfalls wird die
    // dokumentierte Aktivitätsdauer gleichmäßig auf die HF-Messpunkte verteilt.
    // Keine Zeitachse wird aus nicht bestätigten Zeitstempeln rekonstruiert.
    if (!validTime && durationSeconds === null) return null;
    const intervals = validTime ? time.slice(1).map((value, index) => Number(value) - Number(time[index])) : [];
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length / 2)] : 0;
    const sampleDurations = hr.map((_, index) => {
        if (!validTime) return durationSeconds / hr.length;
        if (index < time.length - 1) return intervals[index];
        return durationSeconds !== null
            ? Math.max(0, durationSeconds - Number(time[index]))
            : medianInterval;
    });
    let excludedIntervalCount = 0;
    let excludedIntervalSeconds = 0;
    if (Array.isArray(time) && time.length === hr.length) {
        for (let i = 0; i < time.length - 1; i++) {
            const delta = Number(time[i + 1]) - Number(time[i]);
            if (!Number.isFinite(delta) || delta <= 0 || delta > 30) {
                excludedIntervalCount++;
                if (Number.isFinite(delta) && delta > 0) excludedIntervalSeconds += delta;
            }
        }
    }
    hr.forEach((rawBpm, index) => {
        const bpm = Number(rawBpm);
        const seconds = Number(sampleDurations[index]);
        if (!Number.isFinite(bpm) || bpm < 30 || bpm > 250 || !Number.isFinite(seconds) || seconds <= 0) return;
        const zone = bpm <= zones[0] ? 0 : bpm <= zones[1] ? 1 : bpm <= zones[2] ? 2 : bpm <= zones[3] ? 3 : 4;
        secondsByZone[zone] += seconds;
    });
    const totalSeconds = secondsByZone.reduce((sum,value)=>sum+value,0);
    if (totalSeconds < 60) return null;
    const points = secondsByZone.reduce((sum,seconds,index)=>sum + seconds / 60 * (index + 1),0);
    return {
        value: Number(points.toFixed(1)), unit: 'Punkte', method: 'Gewichtete HF-Zonenzeit',
        zoneSource: 'karvonen-adaptive', zones: [...zones].map(Number), secondsByZone, totalSeconds,
        adaptiveRestingHr: adaptive.restingHr, restingHrSource: adaptive.restingHrSource,
        restingHrWindowDays: adaptive.restingHrWindowDays, restingHrReadingCount: adaptive.restingHrReadingCount,
        restingHrQuality: adaptive.restingHrQuality, heartRateReserve: adaptive.heartRateReserve,
        excludedIntervalCount, excludedIntervalSeconds,
        durationSource: validTime ? 'heart-rate-time-axis' : 'activity-duration-estimate',
        recordedSeconds: validTime ? Number(time[time.length - 1]) - Number(time[0]) : totalSeconds
    };
}

function calculateSessionRpeLoad(activity) {
    const duration = Number(activity?.duration);
    const rpe = Number(activity?.perceivedEffort);
    if (!activity?.date || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(rpe) || rpe < 1 || rpe > 10) return null;
    return Number((duration * rpe).toFixed(1));
}
export function getTrainingLoadData(records, settings, profile, dailyCheckins = {}) {
    const list = Array.isArray(records) ? records : [];
    const srpeData = () => {
        const eligible = list.filter(activity => activity?.date);
        const srpeRecords = eligible.map(activity => ({ activity, value: calculateSessionRpeLoad(activity) })).filter(item => item.value !== null);
        return { mode: 'srpe', unit: 'AU', records: srpeRecords, coverage: { eligibleActivityCount: eligible.length, loadedActivityCount: srpeRecords.length, excludedActivityCount: eligible.length - srpeRecords.length } };
    };
    if (settings?.trainingLoadSource === 'srpe') return srpeData();
    const hasGarmin = list.some(activity => activity.source === 'garmin'
        || activity.sourceRefs?.garminActivityId != null
        || activity.garminData || activity.garminFitImported
        || (Array.isArray(activity.sources) && activity.sources.includes('garmin'))
        || activity.garminTrainingLoad != null);
    if (hasGarmin) {
        const zoneValues = list.filter(activity => activity?.date).map(activity => ({ activity, load: calculateGarminZoneLoad(activity, settings, profile, dailyCheckins) }))
            .filter(item => item.load)
            .map(item => ({ activity: item.activity, value: item.load.value, sourceMode: 'garmin-zone' }));
        // Count all activities with native Garmin Load when comparing source
        // coverage; the chosen model will use this source exclusively.
        const nativeValues = list
            .filter(activity => activity?.date && activity.garminTrainingLoad != null
                && Number.isFinite(Number(activity.garminTrainingLoad))
                && Number(activity.garminTrainingLoad) >= 0)
            .map(activity => ({ activity, value: Number(activity.garminTrainingLoad), sourceMode: 'garmin-native' }));
        // CTL/ATL require one consistent load scale across the time series.
        // Never combine Garmin native Load with the Endurance-AI HR-zone index.
        const useZone = zoneValues.length > nativeValues.length;
        const selected = useZone ? zoneValues : nativeValues;
        if (selected.length) {
            const eligibleCount = list.filter(activity => activity?.date && (
                activity.source === 'garmin' || activity.sourceRefs?.garminActivityId != null
                || activity.garminData || (Array.isArray(activity.sources) && activity.sources.includes('garmin'))
                || activity.garminFitImported || activity.garminTrainingLoad != null
            )).length;
            return {
                mode: useZone ? 'garmin-zone' : 'garmin-native',
                unit: useZone ? 'KAJO-HF-Punkte' : 'Garmin Load',
                records: selected.map(({ activity, value }) => ({ activity, value })),
                coverage: {
                    eligibleActivityCount: eligibleCount,
                    loadedActivityCount: selected.length,
                    excludedActivityCount: Math.max(0, eligibleCount - selected.length),
                    availableZoneActivities: zoneValues.length,
                    availableNativeActivities: nativeValues.length
                }
            };
        }
        if (settings?.trainingLoadSource !== 'garmin') {
            const subjective = srpeData();
            if (subjective.records.length) return subjective;
        }
        return { mode: 'garmin-unavailable', unit: null, records: [], coverage: { eligibleActivityCount: list.filter(a => a?.date).length, loadedActivityCount: 0, excludedActivityCount: list.filter(a => a?.date).length } };
    }
    // In automatic mode, use sRPE when no Garmin-native or HR-zone load can be
    // calculated. The two scales are never mixed within one time series.
    if (settings?.trainingLoadSource !== 'garmin') {
        const subjective = srpeData();
        if (subjective.records.length) return subjective;
    }
    // External TSS is not an approved source for KAJO training-load calculations.
    return { mode: 'garmin-unavailable', unit: null, records: [], coverage: { eligibleActivityCount: list.filter(a => a?.date).length, loadedActivityCount: 0, excludedActivityCount: list.filter(a => a?.date).length } };
}


/**
 * Heart-rate-zone analysis for the KAJO comparison view.
 * KAJO uses adaptive Karvonen zones from max HR and trailing median resting HR.
 * Edwards uses five fixed %HRmax bands; time below 50%
 * HRmax is deliberately excluded rather than assigned to zone 1.
 */
export function getHeartRateZoneAnalysis(records, settings, profile, dailyCheckins = {}) {
    const list = Array.isArray(records) ? records : [];
    const output = [];
    let eligibleGarminCount = 0;
    let kajoCount = 0;
    let edwardsCount = 0;
    let missingMaxHrCount = 0;
    let missingAdaptiveRhrCount = 0;

    for (const activity of list) {
        if (!activity?.date || !isGarminActivity(activity)) continue;
        eligibleGarminCount++;
        const kajo = calculateGarminZoneLoad(activity, settings, profile, dailyCheckins);
        if (kajo) kajoCount++;

        const maxHr = Number(profile?.maxHr);
        const windowDays = settings?.heartRateZoneSettings?.restingHrWindowDays ?? 7;
        const adaptiveRhr = getAdaptiveRestingHr(
            dailyCheckins,
            String(activity.date).slice(0, 10),
            windowDays,
            profile
        );
        const hasValidMaxHr = Number.isFinite(maxHr) && maxHr >= 100 && maxHr <= 240;
        if (!hasValidMaxHr) missingMaxHrCount++;
        else if (!adaptiveRhr || !Number.isFinite(adaptiveRhr.value)) missingAdaptiveRhrCount++;

        let edwards = null;
        if (!hasValidMaxHr) {
            // Edwards requires HFmax; KAJO additionally requires an adaptive or profile resting-HR value.
        } else {
            const series = getGarminHeartRateSeries(activity);
            const hr = series?.hr;
            const time = series?.time;
            const durationSeconds = Number(activity.duration) > 0 ? Number(activity.duration) * 60 : null;
            const validTime = Array.isArray(time) && time.length === hr?.length
                && time.every(value => Number.isFinite(Number(value)))
                && time.slice(1).every((value, index) => Number(value) > Number(time[index])
                    && Number(value) - Number(time[index]) <= 30);
            if (Array.isArray(hr) && hr.length >= 2 && (validTime || durationSeconds !== null)) {
                const intervals = validTime ? time.slice(1).map((value, index) => Number(value) - Number(time[index])) : [];
                const sortedIntervals = [...intervals].sort((a,b) => a-b);
                const medianInterval = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length/2)] : 0;
                const sampleDurations = hr.map((_, index) => !validTime ? durationSeconds / hr.length
                    : index < time.length - 1 ? intervals[index]
                    : durationSeconds !== null ? Math.max(0, durationSeconds - Number(time[index])) : medianInterval);
                const secondsByZone = [0, 0, 0, 0, 0];
                let excludedIntervalCount = 0;
                let excludedIntervalSeconds = 0;
                let below50Seconds = 0;
                if (Array.isArray(time) && time.length === hr.length) {
                    for (let i=0;i<time.length-1;i++) {
                        const delta=Number(time[i+1])-Number(time[i]);
                        if (!Number.isFinite(delta) || delta<=0 || delta>30) {
                            excludedIntervalCount++;
                            if (Number.isFinite(delta) && delta>0) excludedIntervalSeconds+=delta;
                        }
                    }
                }
                hr.forEach((rawBpm,index) => {
                    const bpm=Number(rawBpm), seconds=Number(sampleDurations[index]);
                    if (!Number.isFinite(bpm) || bpm<30 || bpm>250 || !Number.isFinite(seconds) || seconds<=0) return;
                    const pct=bpm/maxHr*100;
                    if (pct<50) { below50Seconds+=seconds; return; }
                    const zone=pct<60?0:pct<70?1:pct<80?2:pct<90?3:4;
                    secondsByZone[zone]+=seconds;
                });
                const totalSeconds=secondsByZone.reduce((sum,value)=>sum+value,0);
                if (totalSeconds>=60) {
                    const value=secondsByZone.reduce((sum,seconds,index)=>sum+seconds/60*(index+1),0);
                    edwards={value:Number(value.toFixed(1)),secondsByZone,totalSeconds,below50Seconds,
                        excludedIntervalCount,excludedIntervalSeconds,maxHr,
                        durationSource:validTime?'heart-rate-time-axis':'activity-duration-estimate',
                        boundaries:[50,60,70,80,90]};
                    edwardsCount++;
                }
            }
        }
        if (kajo || edwards) output.push({
            activity,
            date: String(activity.date).slice(0, 10),
            sport: activity.type || activity.sport || 'Unbekannt',
            kajo,
            edwards
        });
    }

    const aggregate = model => {
        const daily = new Map();
        const zones = [0, 0, 0, 0, 0];
        let weightedLoad = 0;
        let zoneSeconds = 0;
        for (const item of output) {
            const result = item[model];
            if (!result) continue;
            if (!daily.has(item.date)) daily.set(item.date, { date: item.date, value: 0, activityCount: 0, secondsByZone: [0,0,0,0,0] });
            const day = daily.get(item.date);
            day.value += result.value;
            day.activityCount++;
            result.secondsByZone.forEach((seconds, index) => {
                zones[index] += seconds;
                day.secondsByZone[index] += seconds;
            });
            weightedLoad += result.value;
            zoneSeconds += result.totalSeconds;
        }
        return {
            daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({
                ...day, value: Number(day.value.toFixed(1))
            })),
            zonesSeconds: zones,
            zonesMinutes: zones.map(seconds => Number((seconds / 60).toFixed(1))),
            totalZoneMinutes: Number((zoneSeconds / 60).toFixed(1)),
            weightedLoad: Number(weightedLoad.toFixed(1))
        };
    };

    return {
        records: output,
        kajo: aggregate('kajo'),
        edwards: aggregate('edwards'),
        coverage: {
            garminActivityCount: eligibleGarminCount,
            activitiesWithKajoZones: kajoCount,
            activitiesWithEdwards: edwardsCount,
            activitiesWithoutUsableEdwardsMaxHr: missingMaxHrCount,
            activitiesWithoutUsableAdaptiveRhr: missingAdaptiveRhrCount,
            activitiesWithoutAnyUsableZoneLoad: Math.max(0, eligibleGarminCount - output.length)
        },
        edwardsMethod: {
            name: 'Edwards TRIMP',
            basis: '% der maximalen Herzfrequenz',
            zones: ['50–<60 %', '60–<70 %', '70–<80 %', '80–<90 %', '≥90 %'],
            weights: [1, 2, 3, 4, 5],
            below50: 'Nicht berücksichtigt'
        }
    };
}

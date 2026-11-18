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
    const zoneSettings = settings?.heartRateZoneSettings || {};
    const windowDays = zoneSettings.restingHrWindowDays ?? 14;
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
    const cached = activity?.garminAnalysis;
    const sameOptionalNumber = (left, right) => left == null || left === ''
        ? right == null || right === ''
        : right != null && right !== '' && Number(left) === Number(right);
    const cachedMatches = cached?.version === 1
        && sameOptionalNumber(cached.durationMinutes, activity.duration)
        && sameOptionalNumber(cached.maxHr, profile?.maxHr)
        && sameOptionalNumber(cached.restingHr, adaptive?.restingHr)
        && sameOptionalNumber(cached.restingHrWindowDays, adaptive?.restingHrWindowDays);
    if ((!Array.isArray(hr) || hr.length < 2) && cachedMatches && cached.kajo
        && Array.isArray(cached.kajo.secondsByZone)) return cached.kajo;
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
        && time.slice(1).every((value, index) => Number(value) > Number(time[index]));
    // Gleiche Zeitgewichtung wie die Zonenverteilung in der Aktivitätenansicht:
    // eine vollständig valide Zeitachse hat Vorrang; andernfalls wird die
    // dokumentierte Aktivitätsdauer gleichmäßig auf die HF-Messpunkte verteilt.
    // Keine Zeitachse wird aus nicht bestätigten Zeitstempeln rekonstruiert.
    if (!validTime && durationSeconds === null) return null;
    const intervals = validTime ? time.slice(1).map((value, index) => Number(value) - Number(time[index])) : [];
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length / 2)] : 0;
    const isDailyHrSeries = activity?.dailyHeartRateSeries?.source === 'garmin-daily-heart-rate';
    // Tages-HF-Aufzeichnungen liefern bei Garmin häufig nur etwa alle 2 Minuten
    // einen Messpunkt. Diese Werte sind keine FIT-Qualität, aber die beste
    // vorhandene Näherung: letzter Messwert gilt bis zum nächsten Messpunkt
    // (zero-order hold), ohne neue HF-Werte zu interpolieren. Einzelne große
    // Lücken werden auf 1,25 × Medianintervall (max. 5 min) begrenzt.
    const dailyIntervalCap = Math.min(300, Math.max(30, medianInterval * 1.25));
    const sampleDurations = hr.map((_, index) => {
        if (!validTime) return durationSeconds / hr.length;
        if (isDailyHrSeries) {
            const sampleTime = Number(time[index]);
            if (!Number.isFinite(sampleTime) || sampleTime < 0) return 0;
            const nextDelta = index < time.length - 1
                ? Number(time[index + 1]) - sampleTime : medianInterval;
            const credited = Math.min(Number.isFinite(nextDelta) && nextDelta > 0 ? nextDelta : 0, dailyIntervalCap);
            return durationSeconds === null ? credited : Math.max(0, Math.min(credited, durationSeconds - sampleTime));
        }
        if (index < time.length - 1) return intervals[index] <= 30 ? intervals[index] : 0;
        return 0;
    });
    let excludedIntervalCount = 0;
    let excludedIntervalSeconds = 0;
    if (Array.isArray(time) && time.length === hr.length) {
        for (let i = 0; i < time.length - 1; i++) {
            const delta = Number(time[i + 1]) - Number(time[i]);
            const exclusionThreshold = isDailyHrSeries ? dailyIntervalCap : 30;
            if (Number.isFinite(delta) && delta > exclusionThreshold) {
                excludedIntervalCount++;
                excludedIntervalSeconds += delta - exclusionThreshold;
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
        durationSource: isDailyHrSeries ? 'daily-heart-rate-sample-estimate' : (validTime ? 'heart-rate-time-axis' : 'activity-duration-estimate'),
        dataQuality: isDailyHrSeries ? 'limited' : 'standard',
        dataQualityLabel: isDailyHrSeries ? 'Eingeschränkte Näherung aus Garmin-Tagesaufzeichnung' : 'Reguläre HF-Zeitreihe',
        samplingIntervalSeconds: isDailyHrSeries && medianInterval > 0 ? Number(medianInterval.toFixed(1)) : null,
        recordedSeconds: validTime ? Number(time[time.length - 1]) - Number(time[0]) : totalSeconds
    };
}

function calculateSessionRpeLoad(activity) {
    const duration = Number(activity?.duration);
    const rawRpe = activity?.perceivedEffort;
    // 0 ist eine gültige Bewertung ("keine Anstrengung"); null/undefined/leer
    // bleiben dagegen ausdrücklich "nicht bewertet".
    if (rawRpe === null || rawRpe === undefined || rawRpe === '') return null;
    const rpe = Number(rawRpe);
    if (!activity?.date || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(rpe) || rpe < 0 || rpe > 10) return null;
    return Number((duration * rpe).toFixed(1));
}
export function getTrainingLoadData(records, settings, profile, dailyCheckins = {}) {
    const list = Array.isArray(records) ? records : [];
    const eligible = list.filter(activity => activity?.date);
    const srpeData = () => {
        const srpeRecords = eligible.map(activity => ({ activity, value: calculateSessionRpeLoad(activity) }))
            .filter(item => item.value !== null);
        return {
            mode: 'srpe', unit: 'AU', records: srpeRecords, comparisonRecords: [],
            coverage: {
                eligibleActivityCount: eligible.length,
                loadedActivityCount: srpeRecords.length,
                excludedActivityCount: eligible.length - srpeRecords.length
            }
        };
    };
    if (settings?.trainingLoadSource === 'srpe') return srpeData();

    // KAJO-HF-Zonenindex ist das feste Standardmodell. Auch ältere Konten mit
    // trainingLoadSource='auto' werden bewusst auf dieses Modell abgebildet:
    // eine wechselnde Datenabdeckung darf CTL/ATL/TSB nicht auf eine andere
    // Belastungsskala umstellen.
    const isGarminEligible = activity => activity?.date && (
        activity.source === 'garmin' || activity.sourceRefs?.garminActivityId != null
        || activity.garminData || activity.garminFitImported
        || (Array.isArray(activity.sources) && activity.sources.includes('garmin'))
        || activity.garminTrainingLoad != null
        || activity.dailyHeartRateImported === true
        || activity.dailyHeartRateSeries?.source === 'garmin-daily-heart-rate'
    );
    const garminActivities = list.filter(isGarminEligible);
    const zoneValues = garminActivities
        .map(activity => ({ activity, load: calculateGarminZoneLoad(activity, settings, profile, dailyCheckins) }))
        .filter(item => item.load)
        .map(item => ({
            activity: item.activity,
            value: item.load.value,
            dataQuality: item.load.dataQuality || 'standard',
            dataQualityLabel: item.load.dataQualityLabel || 'Reguläre HF-Zeitreihe',
            durationSource: item.load.durationSource,
            samplingIntervalSeconds: item.load.samplingIntervalSeconds
        }));
    // Garmin Native Load bleibt als eigenständige Vergleichsquelle verfügbar,
    // wird aber niemals in den KAJO-CTL-/ATL-/TSB-Verlauf übernommen.
    const nativeValues = garminActivities
        .filter(activity => activity.garminTrainingLoad != null
            && Number.isFinite(Number(activity.garminTrainingLoad))
            && Number(activity.garminTrainingLoad) >= 0)
        .map(activity => ({ activity, value: Number(activity.garminTrainingLoad), sourceMode: 'garmin-native' }));
    return {
        mode: zoneValues.length ? 'garmin-zone' : 'garmin-unavailable',
        unit: zoneValues.length ? 'KAJO-HF-Punkte' : null,
        records: zoneValues,
        comparisonRecords: nativeValues,
        coverage: {
            eligibleActivityCount: garminActivities.length,
            loadedActivityCount: zoneValues.length,
            excludedActivityCount: Math.max(0, garminActivities.length - zoneValues.length),
            availableZoneActivities: zoneValues.length,
            availableNativeActivities: nativeValues.length
        }
    };
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
        const zoneSettings = settings?.heartRateZoneSettings || {};
        const windowDays = Number(zoneSettings.restingHrWindowVersion) >= 2
            ? (zoneSettings.restingHrWindowDays ?? 14) : 14;
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
        const cachedAnalysis = activity?.garminAnalysis;
        const cachedEdwardsMatches = cachedAnalysis?.version === 1
            && (cachedAnalysis.durationMinutes == null || activity.duration == null
                ? cachedAnalysis.durationMinutes == null && activity.duration == null
                : Number(cachedAnalysis.durationMinutes) === Number(activity.duration))
            && Number(cachedAnalysis.maxHr) === Number(maxHr);
        if (cachedEdwardsMatches && cachedAnalysis.edwards
            && !getGarminHeartRateSeries(activity)) {
            edwards = cachedAnalysis.edwards;
            edwardsCount++;
        } else if (!hasValidMaxHr) {
            // Edwards requires HFmax; KAJO additionally requires an adaptive or profile resting-HR value.
        } else {
            const series = getGarminHeartRateSeries(activity);
            const hr = series?.hr;
            const time = series?.time;
            const durationSeconds = Number(activity.duration) > 0 ? Number(activity.duration) * 60 : null;
            const validTime = Array.isArray(time) && time.length === hr?.length
                && time.every(value => Number.isFinite(Number(value)))
                && time.slice(1).every((value, index) => Number(value) > Number(time[index]));
            if (Array.isArray(hr) && hr.length >= 2 && (validTime || durationSeconds !== null)) {
                const intervals = validTime ? time.slice(1).map((value, index) => Number(value) - Number(time[index])) : [];
                const sortedIntervals = [...intervals].sort((a,b) => a-b);
                const medianInterval = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length/2)] : 0;
                const sampleDurations = hr.map((_, index) => !validTime ? durationSeconds / hr.length
                    : index < time.length - 1 ? (intervals[index] <= 30 ? intervals[index] : 0) : 0);
                const secondsByZone = [0, 0, 0, 0, 0];
                let excludedIntervalCount = 0;
                let excludedIntervalSeconds = 0;
                let below50Seconds = 0;
                if (Array.isArray(time) && time.length === hr.length) {
                    for (let i=0;i<time.length-1;i++) {
                        const delta=Number(time[i+1])-Number(time[i]);
                        if (Number.isFinite(delta) && delta>30) {
                            excludedIntervalCount++;
                            excludedIntervalSeconds+=delta;
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


/**
 * Erstellt kompakte, dauerhaft speicherbare Analysewerte für eine Garmin-Aktivität.
 * Die Rohtelemetrie wird nur während der Berechnung benötigt und nicht in den
 * zurückgegebenen Cache übernommen.
 */
export function buildGarminActivityAnalysis(activity, settings, profile, dailyCheckins = {}) {
    if (!activity?.date || !isGarminActivity(activity)) return null;
    const zoneAnalysis = getHeartRateZoneAnalysis([activity], settings, profile, dailyCheckins);
    const record = zoneAnalysis.records[0] || null;
    const adaptive = getAdaptiveRestingHr(
        dailyCheckins,
        String(activity.date).slice(0, 10),
        settings?.heartRateZoneSettings?.restingHrWindowDays ?? 14,
        profile
    );
    const result = {
        version: 1,
        durationMinutes: Number(activity.duration) || null,
        maxHr: Number(profile?.maxHr) || null,
        restingHr: adaptive?.value != null && Number.isFinite(Number(adaptive.value)) ? Number(adaptive.value) : null,
        restingHrWindowDays: Number(adaptive?.windowDays) || 14,
        kajo: record?.kajo || null,
        edwards: record?.edwards || null,
        calculatedAt: new Date().toISOString()
    };
    return result.kajo || result.edwards ? result : null;
}

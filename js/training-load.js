import { getGarminHeartRateSeries, isGarminActivity } from './data-source.js';

/* Garmin-only training-load calculation.
 * Weighted HR-zone minutes: Z1=1 ... Z5=5 points per minute.
 * This is an Endurance AI index, not TSS and not Garmin's native Training Load.
 */
export function calculateGarminZoneLoad(activity, settings, profile) {
    // FIT-Zeitreihen können bei älteren/zusammengeführten Datensätzen bereits
    // vorhanden sein, auch wenn das Import-Flag fehlt. Nur Garmin-Aktivitäten
    // auswerten; beliebige lokale/Intervals-Telemetrie bleibt ausgeschlossen.
    if (!isGarminActivity(activity)) return null;
    const heartRateSeries = getGarminHeartRateSeries(activity);
    const hr = heartRateSeries?.hr, time = heartRateSeries?.time;
    let zones = settings?.heartRateZones?.[activity.type];
    let zoneSource = 'sport-specific';
    const isValidZones = values => Array.isArray(values) && values.length === 4
        && values.every(v => v != null && Number.isFinite(Number(v)) && Number(v) >= 40 && Number(v) <= 240)
        && values.every((v, i) => i === 0 || Number(v) > Number(values[i - 1]));
    if (!isValidZones(zones)) {
        const maxHr = Number(profile?.maxHr);
        if (Number.isFinite(maxHr) && maxHr >= 100 && maxHr <= 240) {
            zones = [0.73, 0.80, 0.87, 0.93].map(percent => Math.round(maxHr * percent));
            zoneSource = 'maxhr-estimate';
        }
    }
    if (!Array.isArray(hr) || hr.length < 2 || !Array.isArray(time) || time.length !== hr.length) return null;
    const validZones = Array.isArray(zones) && zones.length === 4
        && zones.every(v => v != null && Number.isFinite(Number(v)) && Number(v) >= 40 && Number(v) <= 240)
        && zones.every((v, i) => i === 0 || Number(v) > Number(zones[i - 1]));
    if (!validZones) return null;
    const intervals = [];
    for (let i = 0; i < time.length - 1; i++) {
        const delta = Number(time[i + 1]) - Number(time[i]);
        if (Number.isFinite(delta) && delta > 0 && delta <= 30) intervals.push(delta);
    }
    if (!intervals.length) return null;
    const sorted = [...intervals].sort((a,b)=>a-b);
    const medianInterval = sorted[Math.floor(sorted.length / 2)];
    const secondsByZone = [0,0,0,0,0];
    for (let i = 0; i < hr.length; i++) {
        const bpm = Number(hr[i]);
        if (!Number.isFinite(bpm) || bpm < 30 || bpm > 250) continue;
        const seconds = i < time.length - 1 ? Number(time[i + 1]) - Number(time[i]) : medianInterval;
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30) continue;
        const zone = bpm <= zones[0] ? 0 : bpm <= zones[1] ? 1 : bpm <= zones[2] ? 2 : bpm <= zones[3] ? 3 : 4;
        secondsByZone[zone] += seconds;
    }
    const totalSeconds = secondsByZone.reduce((sum,value)=>sum+value,0);
    if (totalSeconds < 60) return null;
    const points = secondsByZone.reduce((sum,seconds,index)=>sum + seconds / 60 * (index + 1),0);
    return { value: Number(points.toFixed(1)), unit: 'Punkte', method: 'Gewichtete HF-Zonenzeit', zoneSource, secondsByZone, totalSeconds };
}

function calculateSessionRpeLoad(activity) {
    const duration = Number(activity?.duration);
    const rpe = Number(activity?.perceivedEffort);
    if (!activity?.date || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(rpe) || rpe < 1 || rpe > 10) return null;
    return Number((duration * rpe).toFixed(1));
}
export function getTrainingLoadData(records, settings, profile) {
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
        const zoneValues = list.filter(activity => activity?.date).map(activity => ({ activity, load: calculateGarminZoneLoad(activity, settings, profile) }))
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
                unit: useZone ? 'EA-HF-Punkte' : 'Garmin Load',
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

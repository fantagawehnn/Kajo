/* Extract strength set records from completed activities. Planned sessions are intentionally ignored. */
export function extractStrengthRecords(activities = [], legacyRecords = []) {
    const records = [];
    for (const activity of Array.isArray(activities) ? activities : []) {
        if (activity?.type !== 'WeightTraining' || activity?.planned === true || !Array.isArray(activity.exercises)) continue;
        for (const exercise of activity.exercises) {
            const name = String(exercise?.name || '').trim();
            if (!name || !Array.isArray(exercise.sets)) continue;
            exercise.sets.forEach((set, index) => {
                const weight = Number(set?.weight);
                const reps = Number(set?.reps);
                if (set?.weight === '' || set?.weight == null || !Number.isFinite(weight) || weight < 0) return;
                if (!Number.isInteger(reps) || reps < 1) return;
                records.push({
                    id: String(activity.id || activity.date || 'activity') + ':' + name.toLowerCase() + ':' + index,
                    exercise: name,
                    date: String(activity.date || ''),
                    weight,
                    reps,
                    activityId: activity.id == null ? null : String(activity.id),
                    activityName: String(activity.name || 'Krafttraining'),
                    source: 'activity'
                });
            });
        }
    }
    for (const entry of Array.isArray(legacyRecords) ? legacyRecords : []) {
        const exercise = String(entry?.exercise || '').trim();
        const weight = Number(entry?.weight);
        const reps = Number(entry?.reps);
        if (!exercise || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1) continue;
        records.push({
            id: String(entry.id || 'legacy:' + exercise + ':' + entry.date),
            exercise,
            date: String(entry.date || ''),
            weight,
            reps,
            activityId: null,
            activityName: 'Früherer manueller Eintrag',
            source: 'legacy'
        });
    }
    return records.sort((a, b) => b.date.localeCompare(a.date) || b.weight - a.weight);
}

export function groupStrengthRecords(records = []) {
    const groups = new Map();
    for (const record of Array.isArray(records) ? records : []) {
        const key = String(record.exercise || '').trim().toLocaleLowerCase('de');
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, { exercise: record.exercise, entries: [] });
        groups.get(key).entries.push(record);
    }
    return [...groups.values()].map(group => ({
        ...group,
        entries: [...group.entries].sort((a, b) => b.date.localeCompare(a.date) || b.weight - a.weight),
        best: [...group.entries].sort((a, b) => b.weight - a.weight || b.reps - a.reps || b.date.localeCompare(a.date))[0]
    })).sort((a, b) => a.exercise.localeCompare(b.exercise, 'de'));
}

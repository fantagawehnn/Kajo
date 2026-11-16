/* KAJO: groups source activities into one displayed training session.
 * Original Garmin records remain untouched and independently stored. */
export function getActivityGroupMembers(activity, activities = []) {
    if (!activity) return [];
    if (!activity.mergedGroupId) return [activity];
    return (Array.isArray(activities) ? activities : [])
        .filter(item => item && item.mergedGroupId === activity.mergedGroupId)
        .sort((a, b) => String(a.startTimeLocal || a.start_time_local || a.startTime || '')
            .localeCompare(String(b.startTimeLocal || b.start_time_local || b.startTime || ''))
            || String(a.id).localeCompare(String(b.id)));
}
function finiteValues(members, key) {
    return members.map(item => item?.[key])
        .filter(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
        .map(Number);
}
export function getVisibleActivities(activities = []) {
    const source = Array.isArray(activities) ? activities : [];
    const grouped = new Map();
    source.forEach(item => {
        if (!item?.mergedGroupId) return;
        if (!grouped.has(item.mergedGroupId)) grouped.set(item.mergedGroupId, []);
        grouped.get(item.mergedGroupId).push(item);
    });
    const visible = [], emitted = new Set();
    source.forEach(item => {
        if (!item?.mergedGroupId) { visible.push(item); return; }
        if (emitted.has(item.mergedGroupId)) return;
        emitted.add(item.mergedGroupId);
        const members = grouped.get(item.mergedGroupId) || [item];
        const primary = members.find(member => member.mergedGroupRole === 'primary') || members[0] || item;
        const durations = finiteValues(members, 'duration');
        const durationComplete = durations.length === members.length && durations.every(value => value > 0);
        const distances = finiteValues(members, 'distance');
        const distanceComplete = distances.length === members.length;
        const weightedHr = members.every(member => member.hr != null && Number.isFinite(Number(member.hr)) && Number(member.duration) > 0)
            ? members.reduce((sum, member) => sum + Number(member.hr) * Number(member.duration), 0)
                / members.reduce((sum, member) => sum + Number(member.duration), 0) : null;
        const sumIfComplete = key => {
            const values = finiteValues(members, key);
            return values.length === members.length ? values.reduce((sum, value) => sum + value, 0) : null;
        };
        const maxHrValues = finiteValues(members, 'maxHr');
        const startTimes = members.map(member => member.startTimeLocal || member.start_time_local || member.startTime || member.time)
            .filter(Boolean).sort();
        visible.push({
            ...primary,
            name: primary.mergedGroupName || primary.name || 'Zusammengeführte Trainingseinheit',
            duration: durationComplete ? durations.reduce((sum, value) => sum + value, 0) : null,
            distance: distanceComplete ? distances.reduce((sum, value) => sum + value, 0) : null,
            hr: weightedHr === null ? null : Number(weightedHr.toFixed(1)),
            maxHr: maxHrValues.length ? Math.max(...maxHrValues) : null,
            tss: sumIfComplete('tss'),
            sRpeLoad: sumIfComplete('sRpeLoad'),
            startTimeLocal: startTimes[0] || primary.startTimeLocal || primary.startTime || null,
            mergedSegmentCount: members.length,
            mergedSegments: members.map(member => ({
                id: member.id, name: member.name || 'Trainingsteil',
                startTime: member.startTimeLocal || member.start_time_local || member.startTime || member.time || null,
                duration: member.duration ?? null, distance: member.distance ?? null, hr: member.hr ?? null
            }))
        });
    });
    return visible;
}
export function mergeActivityPair(primary, secondary, activities = []) {
    if (!primary || !secondary || String(primary.id) === String(secondary.id)) {
        throw new Error('Bitte wähle zwei unterschiedliche Aktivitäten aus.');
    }
    if (primary.date !== secondary.date || primary.type !== secondary.type) {
        throw new Error('Nur Aktivitäten desselben Tages und derselben Sportart können zusammengeführt werden.');
    }
    if (primary.mergedGroupId || secondary.mergedGroupId) {
        throw new Error('Eine der Aktivitäten gehört bereits zu einer Gruppe. Löse diese zuerst auf.');
    }
    const groupId = 'kajo-group-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const groupName = primary.name || secondary.name || 'Trainingseinheit';
    Object.assign(primary, { mergedGroupId: groupId, mergedGroupRole: 'primary', mergedGroupName: groupName });
    Object.assign(secondary, { mergedGroupId: groupId, mergedGroupRole: 'segment', mergedGroupName: groupName });
    return getActivityGroupMembers(primary, activities);
}
export function unmergeActivityGroup(activity, activities = []) {
    if (!activity?.mergedGroupId) return false;
    const groupId = activity.mergedGroupId;
    (Array.isArray(activities) ? activities : []).forEach(item => {
        if (item?.mergedGroupId !== groupId) return;
        delete item.mergedGroupId;
        delete item.mergedGroupRole;
        delete item.mergedGroupName;
    });
    return true;
}

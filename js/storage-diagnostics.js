/**
 * Lokale Größenanalyse des user_data-Snapshots.
 * Verarbeitet nur Größen und Elementanzahlen; überträgt oder verändert keine Daten.
 */
function utf8Size(value) {
    const json = JSON.stringify(value);
    if (json === undefined) return 0;
    return new TextEncoder().encode(json).byteLength;
}

function measureCollection(value) {
    if (Array.isArray(value)) {
        let bytes = 0;
        for (const item of value) bytes += utf8Size(item);
        return { bytes, count: value.length };
    }
    if (value && typeof value === 'object') {
        let bytes = 0;
        const entries = Object.entries(value);
        for (const [, item] of entries) bytes += utf8Size(item);
        return { bytes, count: entries.length };
    }
    return { bytes: utf8Size(value), count: value == null ? 0 : 1 };
}

function formatMb(bytes) {
    return Number((bytes / (1024 * 1024)).toFixed(3));
}

export function analyzeSnapshotSizes(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('Kein gültiger KAJO-Daten-Snapshot vorhanden.');
    }

    const sections = Object.entries(snapshot).map(([name, value]) => {
        const measured = measureCollection(value);
        return {
            section: name,
            items: measured.count,
            bytes: measured.bytes,
            megabytes: formatMb(measured.bytes)
        };
    }).sort((a, b) => b.bytes - a.bytes);

    const activities = Array.isArray(snapshot.activities) ? snapshot.activities : [];
    const largestActivities = activities.map((activity, index) => ({
        index: index + 1,
        bytes: utf8Size(activity)
    })).sort((a, b) => b.bytes - a.bytes).slice(0, 10)
      .map(item => ({ ...item, megabytes: formatMb(item.bytes) }));

    const totalBytes = sections.reduce((sum, section) => sum + section.bytes, 0);
    return {
        measuredAt: new Date().toISOString(),
        totalBytes,
        totalMegabytes: formatMb(totalBytes),
        sectionCount: sections.length,
        sections,
        activityCount: activities.length,
        largestActivities,
        note: 'Nur Größen und Elementanzahlen; keine Inhalte, IDs oder personenbezogenen Werte werden ausgegeben.'
    };
}

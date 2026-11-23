/**
 * cloud-merge.js
 *
 * Verlustarme Zusammenführung lokaler und zentraler KAJO-Datenstände.
 * Mit Basisstand werden Änderungen und Löschungen als Drei-Wege-Abgleich
 * erkannt. Ohne Basisstand erfolgt ein konservativer Zwei-Wege-Abgleich:
 * neue Datensätze werden ergänzt, widersprüchliche Felder blockieren den Upload.
 */

const MISSING = Symbol('missing');

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
    return value === MISSING ? MISSING : value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (isObject(value)) {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    }
    return value;
}

function equal(left, right) {
    if (left === MISSING || right === MISSING) return left === right;
    return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function itemKey(item) {
    if (item === null || typeof item !== 'object') return 'value:' + JSON.stringify(item);
    if (item.id != null) return 'id:' + String(item.id);
    if (item.garmin_activity_id != null) return 'garmin:' + String(item.garmin_activity_id);
    if (item.weekStartDate) return 'week:' + String(item.weekStartDate);
    if (item.startDate && item.endDate) return 'period:' + item.startDate + ':' + item.endDate;
    if (item.date && (item.name || item.type || item.discipline || item.exercise || item.startTime)) {
        return 'date:' + [item.date, item.startTime || '', item.name || '', item.type || '',
            item.discipline || '', item.exercise || '', item.format || ''].join('|');
    }
    return 'json:' + JSON.stringify(stable(item));
}

function mergeArray(base, local, cloud, hasBase, path, conflicts) {
    const baseArray = Array.isArray(base) ? base : [];
    const localArray = Array.isArray(local) ? local : [];
    const cloudArray = Array.isArray(cloud) ? cloud : [];

    // Primitive arrays (z. B. Symptome oder Fokus-Tags) werden als Mengen
    // zusammengeführt; Ergänzungen und Löschungen beider Seiten bleiben erhalten.
    const primitive = [...baseArray, ...localArray, ...cloudArray].every(value =>
        value === null || ['string', 'number', 'boolean'].includes(typeof value)
    );
    if (primitive) {
        if (!hasBase) {
            const values = new Map();
            [...cloudArray, ...localArray].forEach(value => values.set(JSON.stringify(value), value));
            return [...values.values()];
        }
        const baseMap = new Map(baseArray.map(value => [JSON.stringify(value), value]));
        const localMap = new Map(localArray.map(value => [JSON.stringify(value), value]));
        const cloudMap = new Map(cloudArray.map(value => [JSON.stringify(value), value]));
        const result = new Map();
        for (const [key, value] of baseMap) {
            if (localMap.has(key) && cloudMap.has(key)) result.set(key, value);
        }
        for (const [key, value] of localMap) if (!baseMap.has(key)) result.set(key, value);
        for (const [key, value] of cloudMap) if (!baseMap.has(key)) result.set(key, value);
        return [...result.values()];
    }

    const toMap = values => new Map(values.map(value => [itemKey(value), value]));
    const baseMap = toMap(baseArray);
    const localMap = toMap(localArray);
    const cloudMap = toMap(cloudArray);
    const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...cloudMap.keys()]);
    const merged = [];
    for (const key of keys) {
        const b = baseMap.has(key) ? baseMap.get(key) : MISSING;
        const l = localMap.has(key) ? localMap.get(key) : MISSING;
        const c = cloudMap.has(key) ? cloudMap.get(key) : MISSING;
        const value = mergeNode(b, l, c, hasBase && b !== MISSING, path + '[' + key + ']', conflicts);
        if (value !== MISSING && value !== undefined) merged.push(value);
    }
    return merged;
}

function mergeNode(base, local, cloud, hasBase, path, conflicts) {
    if (hasBase) {
        if (equal(local, base)) return clone(cloud);
        if (equal(cloud, base)) return clone(local);
        if (equal(local, cloud)) return clone(local);
    } else {
        if (local === MISSING) return clone(cloud);
        if (cloud === MISSING) return clone(local);
        // Ohne gespeicherten gemeinsamen Basisstand lässt sich null nicht sicher
        // als bewusste Löschung interpretieren. Der vorhandene Inhalt bleibt daher
        // erhalten; spätere Löschungen werden mit dem Basisstand eindeutig erkannt.
        if (local === null && cloud !== null) return clone(cloud);
        if (cloud === null && local !== null) return clone(local);
        if (equal(local, cloud)) return clone(local);
    }

    if (local === MISSING || cloud === MISSING) {
        conflicts.push(path + ' (Löschung gegen Änderung)');
        return clone(local);
    }

    if (Array.isArray(local) && Array.isArray(cloud)) {
        return mergeArray(hasBase ? base : [], local, cloud, hasBase, path, conflicts);
    }

    if (isObject(local) && isObject(cloud)) {
        const baseObject = hasBase && isObject(base) ? base : {};
        const keys = new Set([...Object.keys(baseObject), ...Object.keys(local), ...Object.keys(cloud)]);
        const result = {};
        for (const key of keys) {
            const b = Object.prototype.hasOwnProperty.call(baseObject, key) ? baseObject[key] : MISSING;
            const l = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING;
            const c = Object.prototype.hasOwnProperty.call(cloud, key) ? cloud[key] : MISSING;
            const value = mergeNode(b, l, c, hasBase && b !== MISSING, path ? path + '.' + key : key, conflicts);
            if (value !== MISSING && value !== undefined) result[key] = value;
        }
        return result;
    }

    conflicts.push(path + ' (abweichende Werte)');
    return clone(local);
}

export function mergeCloudSnapshots(baseSnapshot, localSnapshot, cloudSnapshot) {
    if (!localSnapshot || typeof localSnapshot !== 'object' || Array.isArray(localSnapshot)) {
        throw new Error('Der lokale KAJO-Datenstand ist ungültig.');
    }
    if (!cloudSnapshot || typeof cloudSnapshot !== 'object' || Array.isArray(cloudSnapshot)) {
        throw new Error('Der Cloud-Datenstand ist ungültig.');
    }
    const hasBase = Boolean(baseSnapshot && typeof baseSnapshot === 'object' && !Array.isArray(baseSnapshot));
    const conflicts = [];
    const snapshot = mergeNode(
        hasBase ? baseSnapshot : {},
        localSnapshot,
        cloudSnapshot,
        hasBase,
        '',
        conflicts
    );
    return {
        snapshot,
        conflicts: [...new Set(conflicts)],
        hasBase
    };
}

export function cloudSnapshotsEqual(left, right) {
    return equal(left, right);
}

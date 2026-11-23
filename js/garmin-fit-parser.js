/*
 * Read-only parser for Garmin FIT activity files.
 * It extracts timestamped HR samples and metadata only; no imports or writes.
 */
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const INVALID = new Map([
    [0, new Set([0xff])], [1, new Set([0x7f])], [2, new Set([0xff])],
    [3, new Set([0x7fffffff])], [4, new Set([0x7fff])], [5, new Set([0xffff])],
    [6, new Set([0xffffffff])], [10, new Set([0])], [11, new Set([0])], [12, new Set([0])]
]);
function bytesOf(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new TypeError('FIT-Eingabe muss ein ArrayBuffer oder Uint8Array sein.');
}
function readBase(view, offset, type, littleEndian) {
    const base = type & 0x1f;
    let value;
    switch (base) {
        case 0: case 2: case 10: case 13: value = view.getUint8(offset); break;
        case 1: value = view.getInt8(offset); break;
        case 3: value = view.getInt32(offset, littleEndian); break;
        case 4: value = view.getInt16(offset, littleEndian); break;
        case 5: case 11: value = view.getUint16(offset, littleEndian); break;
        case 6: case 12: value = view.getUint32(offset, littleEndian); break;
        case 8: value = view.getFloat32(offset, littleEndian); break;
        case 9: value = view.getFloat64(offset, littleEndian); break;
        default: return null;
    }
    if (INVALID.get(base)?.has(value)) return null;
    return Number.isFinite(value) ? value : null;
}
function readField(view, offset, field, littleEndian) {
    const sizes = {0:1,1:1,2:1,3:4,4:2,5:2,6:4,8:4,9:8,10:1,11:2,12:4,13:1};
    const size = sizes[field.baseType & 0x1f];
    if (!size || field.size < size) return null;
    const values = [];
    for (let p = 0; p + size <= field.size; p += size) values.push(readBase(view, offset + p, field.baseType, littleEndian));
    return values.length === 1 ? values[0] : values;
}
function list(value) { return Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]; }

export function parseGarminFitActivity(input) {
    const bytes = bytesOf(input);
    if (bytes.length < 14) throw new Error('FIT-Datei ist zu kurz.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerSize = bytes[0];
    if (headerSize !== 12 && headerSize !== 14) throw new Error('Ungültige FIT-Headerlänge.');
    if (String.fromCharCode(...bytes.slice(8, 12)) !== '.FIT') throw new Error('FIT-Signatur fehlt.');
    const dataSize = view.getUint32(4, true);
    const dataEnd = headerSize + dataSize;
    if (dataEnd > bytes.length || dataEnd < headerSize) throw new Error('FIT-Datenbereich ist unvollständig.');

    const definitions = new Map();
    const samples = [];
    const events = [];
    let lastTimestamp = null;
    let position = headerSize;
    let session = null;
    let fileId = null;
    while (position < dataEnd) {
        const header = view.getUint8(position++);
        const compressed = (header & 0x80) !== 0;
        const isDefinition = !compressed && (header & 0x40) !== 0;
        const hasDeveloperFields = isDefinition && (header & 0x20) !== 0;
        const local = compressed ? ((header >> 5) & 0x03) : (header & 0x0f);
        if (isDefinition) {
            if (position + 5 > dataEnd) throw new Error('Unvollständige FIT-Nachrichtendefinition.');
            position++;
            const architecture = view.getUint8(position++);
            const littleEndian = architecture === 0;
            const global = view.getUint16(position, littleEndian);
            position += 2;
            const count = view.getUint8(position++);
            if (position + count * 3 > dataEnd) throw new Error('Unvollständige FIT-Felddefinition.');
            const fields = [];
            for (let i=0;i<count;i++) {
                fields.push({number:view.getUint8(position),size:view.getUint8(position+1),baseType:view.getUint8(position+2)});
                position += 3;
            }
            const developerFields = [];
            if (hasDeveloperFields) {
                if (position >= dataEnd) throw new Error('Unvollständige FIT-Developer-Felddefinition.');
                const developerCount = view.getUint8(position++);
                if (position + developerCount * 3 > dataEnd) throw new Error('Unvollständige FIT-Developer-Felder.');
                for (let i=0;i<developerCount;i++) {
                    developerFields.push({size:view.getUint8(position+1)});
                    position += 3;
                }
            }
            definitions.set(local,{global,littleEndian,fields,developerFields});
            continue;
        }
        const definition = definitions.get(local);
        if (!definition) throw new Error('FIT-Datensatz ohne vorherige Definition.');
        const timestampField = definition.fields.find(field => field.number === 253);
        const omittedTimestampBytes = compressed ? (timestampField?.size ?? 0) : 0;
        const fieldBytes = definition.fields.reduce((sum,f)=>sum+f.size,0);
        const developerBytes = definition.developerFields.reduce((sum,f)=>sum+f.size,0);
        const recordBytes = fieldBytes - omittedTimestampBytes + developerBytes;
        if (position + recordBytes > dataEnd) throw new Error('Unvollständiger FIT-Datensatz.');
        const values = new Map();
        for (const field of definition.fields) {
            if (compressed && field.number === 253) continue;
            values.set(field.number,readField(view,position,field,definition.littleEndian));
            position += field.size;
        }
        position += developerBytes;
        const get = n => values.get(n);
        if (definition.global === 20) {
            let timestamp = get(253);
            if (compressed) {
                const offset = header & 0x1f;
                timestamp = null;
                if (lastTimestamp !== null) {
                    timestamp = (lastTimestamp & ~0x1f) + offset;
                    if (timestamp < lastTimestamp) timestamp += 0x20;
                }
            }
            if (typeof timestamp === 'number') lastTimestamp = timestamp;
            for (const bpm of list(get(3))) {
                if (typeof bpm !== 'number' || bpm < 30 || bpm > 250 || typeof timestamp !== 'number') continue;
                samples.push({timestamp:new Date(FIT_EPOCH_MS + timestamp*1000).toISOString(),timestampSeconds:timestamp,heartRateBpm:bpm});
            }
        } else if (definition.global === 18) {
            session = {
                startTimestampSeconds:get(2) ?? null,
                totalElapsedTimeSeconds:get(7) ?? null,
                totalTimerTimeSeconds:get(8) ?? null,
                averageHeartRateBpm:get(16) ?? null,
                maxHeartRateBpm:get(17) ?? null,
                sport:get(5) ?? null,
                subSport:get(6) ?? null
            };
        } else if (definition.global === 0) {
            fileId = {type:get(0) ?? null,manufacturer:get(1) ?? null,product:get(2) ?? null,serialNumber:get(3) ?? null,timeCreatedSeconds:get(4) ?? null};
        } else if (definition.global === 21) {
            events.push({timestampSeconds:get(253) ?? null,event:get(0) ?? null,eventType:get(1) ?? null});
        }
    }
    samples.sort((a,b)=>a.timestampSeconds-b.timestampSeconds);
    const unique=[];
    for (const sample of samples) {
        const previous=unique[unique.length-1];
        if (previous && previous.timestampSeconds===sample.timestampSeconds) previous.heartRateBpm=sample.heartRateBpm;
        else unique.push(sample);
    }
    const intervals=[];
    for(let i=1;i<unique.length;i++) {
        const delta=unique[i].timestampSeconds-unique[i-1].timestampSeconds;
        if(delta>0) intervals.push(delta);
    }
    return {
        format:'FIT',fileId,session,events,samples:unique,sampleCount:unique.length,
        firstSampleTime:unique[0]?.timestamp ?? null,lastSampleTime:unique.at(-1)?.timestamp ?? null,
        elapsedSampleSeconds:intervals.reduce((sum,v)=>sum+v,0),
        creditedSampleSeconds:intervals.filter(v=>v<=30).reduce((sum,v)=>sum+v,0),
        excludedGapCount:intervals.filter(v=>v>30).length
    };
}

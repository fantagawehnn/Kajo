/*
 * Read-only extractor for Garmin Connect Aggregator UDSFile JSON.
 * Undated profile defaults are not interpreted as historical measurements.
 */
const DATE_KEYS=['calendarDate','calendarDateLocal','date','day'];
const RHR_KEYS=['restingHeartRate','restingHr','restingHeartRateValue'];
const RHR7_KEYS=['lastSevenDaysAvgRestingHeartRate','sevenDayAvgRestingHeartRate','weeklyRestingHeartRate'];
const HRV_KEYS=['lastNightAvg','lastNightAverage','weeklyAvg','weeklyAverage'];
function validDate(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function numeric(value) {
    if(value===null||value===undefined||value==='') return null;
    const n=Number(value);
    return Number.isFinite(n)?n:null;
}
function firstValue(record,keys) {
    for(const key of keys) { const value=numeric(record?.[key]); if(value!==null) return {value,field:key}; }
    return null;
}
function dateFrom(record) {
    for(const key of DATE_KEYS) {
        const value=record?.[key];
        if(validDate(value)) return value;
        if(typeof value==='number'&&Number.isFinite(value)) {
            const parsed=new Date(value>1e12?value:value*1000);
            if(Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0,10);
        }
    }
    return null;
}
function collect(node,output,seen,depth) {
    if(!node||typeof node!=='object'||depth>18||seen.has(node)) return;
    seen.add(node);
    if(Array.isArray(node)) { for(const item of node) collect(item,output,seen,depth+1); return; }
    const date=dateFrom(node);
    if(date) {
        const rhr=firstValue(node,RHR_KEYS),rhr7=firstValue(node,RHR7_KEYS),hrv=firstValue(node,HRV_KEYS);
        if(rhr||rhr7||hrv) output.push({
            date,
            restingHeartRateBpm:rhr&&rhr.value>=25&&rhr.value<=130?rhr.value:null,
            restingHeartRateSourceField:rhr?.field??null,
            sevenDayAverageRestingHeartRateBpm:rhr7&&rhr7.value>=25&&rhr7.value<=130?rhr7.value:null,
            sevenDayAverageSourceField:rhr7?.field??null,
            hrvValue:hrv&&hrv.value>=1&&hrv.value<=300?hrv.value:null,
            hrvSourceField:hrv?.field??null,
            source:'garmin-uds-export'
        });
    }
    for(const child of Object.values(node)) collect(child,output,seen,depth+1);
}
export function extractGarminUdsDailyMetrics(value) {
    const raw=[]; collect(value,raw,new Set(),0);
    const byDate=new Map();
    for(const record of raw) { if(!byDate.has(record.date)) byDate.set(record.date,[]); byDate.get(record.date).push(record); }
    const records=[],ambiguousDates=[];
    for(const [date,candidates] of byDate) {
        const pick=key=>{
            const values=new Set(candidates.map(item=>item[key]).filter(value=>value!==null));
            return values.size===1?[...values][0]:values.size===0?null:undefined;
        };
        const rhr=pick('restingHeartRateBpm'),rhr7=pick('sevenDayAverageRestingHeartRateBpm'),hrv=pick('hrvValue');
        const ambiguous=rhr===undefined||rhr7===undefined||hrv===undefined;
        if(ambiguous) ambiguousDates.push(date);
        records.push({
            date,restingHeartRateBpm:rhr===undefined?null:rhr,
            sevenDayAverageRestingHeartRateBpm:rhr7===undefined?null:rhr7,
            hrvValue:hrv===undefined?null:hrv,source:'garmin-uds-export',ambiguous
        });
    }
    records.sort((a,b)=>a.date.localeCompare(b.date));
    return {records,ambiguousDates:[...new Set(ambiguousDates)].sort(),rawRecordCount:raw.length};
}

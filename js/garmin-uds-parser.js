/*
 * Read-only extractor for Garmin Connect Aggregator UDSFile JSON.
 * Undated profile defaults are not interpreted as historical measurements.
 */
const DATE_KEYS=['calendarDate','calendarDateLocal','date','day'];
const RHR_KEYS=['restingHeartRate','restingHr','restingHeartRateValue'];
const RHR7_KEYS=['lastSevenDaysAvgRestingHeartRate','sevenDayAvgRestingHeartRate','weeklyRestingHeartRate'];
const HRV_LAST_NIGHT_KEYS=['lastNightAvg','lastNightAverage'];
const HRV_WEEKLY_KEYS=['weeklyAvg','weeklyAverage'];
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
        const rhr=firstValue(node,RHR_KEYS),rhr7=firstValue(node,RHR7_KEYS);
        const hrvNight=firstValue(node,HRV_LAST_NIGHT_KEYS),hrvWeekly=firstValue(node,HRV_WEEKLY_KEYS);
        if(rhr||rhr7||hrvNight||hrvWeekly) output.push({
            date,
            restingHeartRateBpm:rhr&&rhr.value>=25&&rhr.value<=130?rhr.value:null,
            restingHeartRateSourceField:rhr?.field??null,
            sevenDayAverageRestingHeartRateBpm:rhr7&&rhr7.value>=25&&rhr7.value<=130?rhr7.value:null,
            sevenDayAverageSourceField:rhr7?.field??null,
            hrvLastNightAverageMs:hrvNight&&hrvNight.value>=1&&hrvNight.value<=300?hrvNight.value:null,
            hrvLastNightSourceField:hrvNight?.field??null,
            hrvWeeklyAverageMs:hrvWeekly&&hrvWeekly.value>=1&&hrvWeekly.value<=300?hrvWeekly.value:null,
            hrvWeeklySourceField:hrvWeekly?.field??null,
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
        const sourceField=key=>{
            const values=new Set(candidates.map(item=>item[key]).filter(value=>value!==null));
            return values.size===1?[...values][0]:null;
        };
        const rhr=pick('restingHeartRateBpm'),rhr7=pick('sevenDayAverageRestingHeartRateBpm');
        const hrvNight=pick('hrvLastNightAverageMs'),hrvWeekly=pick('hrvWeeklyAverageMs');
        const rhrField=sourceField('restingHeartRateSourceField'),rhr7Field=sourceField('sevenDayAverageSourceField');
        const hrvNightField=sourceField('hrvLastNightSourceField'),hrvWeeklyField=sourceField('hrvWeeklySourceField');
        const ambiguous=rhr===undefined||rhr7===undefined||hrvNight===undefined||hrvWeekly===undefined;
        if(ambiguous) ambiguousDates.push(date);
        records.push({
            date,restingHeartRateBpm:rhr===undefined?null:rhr,
            restingHeartRateSourceField:rhrField,
            sevenDayAverageRestingHeartRateBpm:rhr7===undefined?null:rhr7,
            sevenDayAverageSourceField:rhr7Field,
            hrvLastNightAverageMs:hrvNight===undefined?null:hrvNight,
            hrvLastNightSourceField:hrvNightField,
            hrvWeeklyAverageMs:hrvWeekly===undefined?null:hrvWeekly,
            hrvWeeklySourceField:hrvWeeklyField,
            source:'garmin-uds-export',ambiguous
        });
    }
    records.sort((a,b)=>a.date.localeCompare(b.date));
    return {records,ambiguousDates:[...new Set(ambiguousDates)].sort(),rawRecordCount:raw.length};
}

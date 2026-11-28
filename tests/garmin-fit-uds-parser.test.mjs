import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGarminFitActivity} from '../js/garmin-fit-parser.js';
import {extractGarminUdsDailyMetrics} from '../js/garmin-uds-parser.js';

function fitFixture() {
    const bytes=[];
    const u8=v=>bytes.push(v&255);
    const u16=v=>{u8(v);u8(v>>8);};
    const u32=v=>{u8(v);u8(v>>8);u8(v>>16);u8(v>>24);};
    const definition=(local,global,fields)=>{
        u8(0x40|local);u8(0);u8(0);u16(global);u8(fields.length);
        for(const [number,size,type] of fields){u8(number);u8(size);u8(type);}
    };
    u8(12);u8(0x10);u32(0);u8(0);u8(0);u8(0x2e);u8(0x46);u8(0x49);u8(0x54);
    definition(0,20,[[253,4,0x86],[3,1,0x02]]);
    for(const [timestamp,hr] of [[1000,140],[1001,145],[1040,150]]){u8(0);u32(timestamp);u8(hr);}
    const size=bytes.length-12;
    bytes[4]=size&255;bytes[5]=(size>>8)&255;bytes[6]=(size>>16)&255;bytes[7]=(size>>24)&255;
    return new Uint8Array(bytes);
}

function compressedFitFixture(startTimestamp, compressedRecords) {
    const bytes=[];
    const u8=v=>bytes.push(v&255);
    const u16=v=>{u8(v);u8(v>>8);};
    const u32=v=>{u8(v);u8(v>>8);u8(v>>16);u8(v>>24);};
    u8(12);u8(0x10);u32(0);u8(0);u8(0);u8(0x2e);u8(0x46);u8(0x49);u8(0x54);
    u8(0x40);u8(0);u8(0);u16(20);u8(2);
    u8(253);u8(4);u8(0x86);
    u8(3);u8(1);u8(0x02);
    u8(0);u32(startTimestamp);u8(140);
    for (const [timestamp,hr] of compressedRecords) {
        u8(0x80 | (timestamp & 0x1f));
        u8(hr);
    }
    const size=bytes.length-12;
    bytes[4]=size&255;bytes[5]=(size>>8)&255;bytes[6]=(size>>16)&255;bytes[7]=(size>>24)&255;
    return new Uint8Array(bytes);
}

test('FIT parser extracts HR samples and excludes gaps over 30 seconds from credited time',()=>{
    const parsed=parseGarminFitActivity(fitFixture());
    assert.equal(parsed.sampleCount,3);
    assert.deepEqual(parsed.samples.map(item=>item.heartRateBpm),[140,145,150]);
    assert.equal(parsed.elapsedSampleSeconds,40);
    assert.equal(parsed.creditedSampleSeconds,1);
    assert.equal(parsed.excludedGapCount,1);
    assert.equal(parsed.firstSampleTime,'1989-12-31T00:16:40.000Z');
});
test('FIT parser rejects truncated and non-FIT input',()=>{
    assert.throws(()=>parseGarminFitActivity(new Uint8Array([1,2,3])),/zu kurz/);
    const bad=fitFixture();bad[8]=0;
    assert.throws(()=>parseGarminFitActivity(bad),/Signatur/);
});
test('UDS parser extracts dated RHR and seven-day average with provenance',()=>{
    const result=extractGarminUdsDailyMetrics({wellness:[{calendarDate:'2023-04-01',restingHeartRate:52,lastSevenDaysAvgRestingHeartRate:54}]});
    assert.equal(result.records.length,1);
    assert.equal(result.records[0].restingHeartRateBpm,52);
    assert.equal(result.records[0].sevenDayAverageRestingHeartRateBpm,54);
    assert.equal(result.records[0].restingHeartRateSourceField,'restingHeartRate');
    assert.equal(result.records[0].sevenDayAverageSourceField,'lastSevenDaysAvgRestingHeartRate');
    assert.equal(result.records[0].source,'garmin-uds-export');
});
test('UDS parser keeps overnight and weekly HRV averages separate',()=>{
    const result=extractGarminUdsDailyMetrics({records:[{calendarDate:'2024-02-01',lastNightAvg:68,weeklyAvg:64}]});
    assert.equal(result.records[0].hrvLastNightAverageMs,68);
    assert.equal(result.records[0].hrvWeeklyAverageMs,64);
});

test('UDS parser ignores undated defaults and flags conflicting values',()=>{
    const result=extractGarminUdsDailyMetrics({
        profile:{restingHeartRate:56},
        records:[{calendarDate:'2022-01-02',restingHeartRate:51},{calendarDate:'2022-01-02',restingHeartRate:53}]
    });
    assert.equal(result.records.length,1);
    assert.equal(result.records[0].restingHeartRateBpm,null);
    assert.deepEqual(result.ambiguousDates,['2022-01-02']);
});

test('FIT parser reads HR correctly from compressed timestamp records',()=>{
    const parsed=parseGarminFitActivity(compressedFitFixture(1000,[[1001,145],[1002,150]]));
    assert.equal(parsed.sampleCount,3);
    assert.deepEqual(parsed.samples.map(item=>item.heartRateBpm),[140,145,150]);
    assert.deepEqual(parsed.samples.map(item=>item.timestampSeconds),[1000,1001,1002]);
});

test('FIT parser reconstructs compressed timestamps across the 32-second rollover',()=>{
    const parsed=parseGarminFitActivity(compressedFitFixture(1023,[[1024,145]]));
    assert.deepEqual(parsed.samples.map(item=>item.timestampSeconds),[1023,1024]);
    assert.deepEqual(parsed.samples.map(item=>item.heartRateBpm),[140,145]);
});

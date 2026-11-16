/* ============================================================
 * recovery-calculations.js – Zentrale Regenerations- und Readiness-Berechnung
 *
 * Reine Berechnung ohne DOM- oder UI-Abhängigkeiten.
 * ============================================================ */

const localTodayKey = () => {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
};
const clamp = (v,min=0,max=100)=>Math.max(min,Math.min(max,v));
function median(values){const a=values.slice().sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function validNumber(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));}

export function calculateReadiness(dailyCheckins = {}, dateKey = localTodayKey()){
  const current=dailyCheckins[dateKey]||{};
  const dateMs=new Date(dateKey+'T12:00:00').getTime();
  const history=Object.entries(dailyCheckins).filter(([date])=>{const ms=new Date(date+'T12:00:00').getTime();return date<dateKey&&Number.isFinite(ms)&&dateMs>ms&&dateMs-ms<=90*86400000;});
  const objective=[];
  const addBaseline=(key,label,scoreFn)=>{
    const raw=key==='sleepDuration'?(current.sleepDuration??(Number(current.sleep)>5?current.sleep:null)):key==='rhr'?(current.garminRhr??current.rhr):current[key];
    if(!validNumber(raw))return;
    const vals=history.map(([,r])=>key==='sleepDuration'?(r.sleepDuration??(Number(r.sleep)>5?r.sleep:null)):key==='rhr'?(r.garminRhr??r.rhr):r[key]).filter(validNumber).map(Number);
    if(vals.length<5)return;
    const base=median(vals),value=Number(raw);
    if(!(base>0)||!(value>0))return;
    objective.push({key,label,value,baseline:Number(base.toFixed(1)),score:Math.round(clamp(scoreFn(value,base)))});
  };
  addBaseline('hrv','HRV',(v,b)=>((v/b)-0.70)/0.30*100);
  addBaseline('rhr','RHF',(v,b)=>(1.20-(v/b))/0.20*100);
  addBaseline('sleepDuration','Schlafdauer',(v,b)=>((v/b)-0.70)/0.30*100);
  if(validNumber(current.sleepScore)&&Number(current.sleepScore)>=0&&Number(current.sleepScore)<=100){
    objective.push({key:'sleepScore',label:'Schlafscore',value:Number(current.sleepScore),score:Math.round(clamp(Number(current.sleepScore)))});
  }
  const subjective=[];
  const addSubjective=(key,label,reverse)=>{if(!validNumber(current[key]))return;const v=Number(current[key]);if(v<1||v>10)return;subjective.push({key,label,value:v,score:Math.round(reverse?(10-v)/9*100:(v-1)/9*100)});};
  addSubjective('sleepQuality','Schlafqualität',false);addSubjective('motivation','Motivation',false);addSubjective('fatigue','Müdigkeit',true);addSubjective('soreness','Muskelkater',true);addSubjective('stress','Stress',true);
  const cycleImpact=Number(current.cycle?.trainingImpact);
  if(current.cycle?.period===true&&Number.isFinite(cycleImpact)&&cycleImpact>0&&cycleImpact<=10){
    subjective.push({key:'cycleTrainingImpact',label:'Zyklusbedingte Trainingsbeeinträchtigung',value:cycleImpact,score:Math.round(clamp((10-cycleImpact)/10*100))});
  }
  const mean=a=>a.length?a.reduce((s,x)=>s+x.score,0)/a.length:null;
  const objectiveScore=mean(objective),subjectiveScore=mean(subjective);
  // Self-monitoring enriches the score when available, but is never required.
  // Without subjective entries, all available objective metrics are used.
  const score=objectiveScore===null&&subjectiveScore===null
    ?null
    :objectiveScore!==null&&subjectiveScore!==null
      ?Math.round(objectiveScore*0.7+subjectiveScore*0.3)
      :Math.round(objectiveScore??subjectiveScore);
  const totalCount=objective.length+subjective.length;
  const dataQuality=totalCount>=4?'Mehrere Messgrößen':totalCount>=2?'Begrenzte Datengrundlage':'Eingeschränkte Datengrundlage';
  return {
    score:Number.isFinite(score)?score:null,
    enoughData:totalCount>=2,
    dataQuality,
    dataMode:subjective.length?'Objektive Daten und Self-Monitoring':'Automatisch aus verfügbaren Wearable- und Trainingsdaten',
    objectiveScore:objectiveScore===null?null:Math.round(objectiveScore),
    subjectiveScore:subjectiveScore===null?null:Math.round(subjectiveScore),
    objectiveCount:objective.length,subjectiveCount:subjective.length,
    objective,subjective,totalCount
  };
}


const RECOVERY_TREND_METRICS = Object.freeze({
  sleepDuration: { label: 'Schlafdauer', unit: 'h', digits: 1 },
  sleepScore: { label: 'Sleep Score', unit: '/ 100', digits: 0 },
  hrv: { label: 'HRV', unit: 'ms', digits: 1 },
  rhr: { label: 'Ruhepuls', unit: 'bpm', digits: 1 },
  bodyBattery: { label: 'Body Battery', unit: '/ 100', digits: 0 },
  sleepQuality: { label: 'Schlafqualität', unit: '/ 10', digits: 1 },
  fatigue: { label: 'Müdigkeit', unit: '/ 10', digits: 1 }
});

function recoveryTrendValue(row, key) {
  if (!row || typeof row !== 'object') return null;
  let value;
  if (key === 'sleepDuration') value = row.sleepDuration ?? (Number(row.sleep) > 5 ? row.sleep : null);
  else if (key === 'rhr') value = row.garminRhr ?? row.rhr;
  else value = row[key];
  if (!validNumber(value)) return null;
  const n = Number(value);
  if (key === 'sleepDuration' && (n <= 0 || n > 24)) return null;
  if (key === 'sleepScore' || key === 'bodyBattery') return n >= 0 && n <= 100 ? n : null;
  if (key === 'sleepQuality' || key === 'fatigue') return n >= 1 && n <= 10 ? n : null;
  if ((key === 'hrv' || key === 'rhr') && n <= 0) return null;
  return n;
}

/**
 * Compares the seven calendar days ending on dateKey with the preceding
 * seven calendar days. Missing measurements are excluded, never treated as 0.
 */
export function summarizeRecoveryTrends(dailyCheckins = {}, dateKey = localTodayKey()) {
  const parts = String(dateKey).split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isInteger(n)) || parts[0] < 1900 ||
      parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31) {
    return { from: null, to: null, previousFrom: null, previousTo: null, metrics: [] };
  }
  const end = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  if (!Number.isFinite(end.getTime()) || end.getFullYear() !== parts[0] ||
      end.getMonth() !== parts[1] - 1 || end.getDate() !== parts[2]) {
    return { from: null, to: null, previousFrom: null, previousTo: null, metrics: [] };
  }
  const keyFor = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const shift = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
  const to = keyFor(end), from = keyFor(shift(end, -6));
  const previousTo = keyFor(shift(end, -7)), previousFrom = keyFor(shift(end, -13));
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const entries = Object.entries(dailyCheckins || {});
  const metrics = Object.entries(RECOVERY_TREND_METRICS).map(([key, meta]) => {
    const currentValues = entries.filter(([date]) => date >= from && date <= to)
      .map(([, row]) => recoveryTrendValue(row, key)).filter(value => value !== null);
    const previousValues = entries.filter(([date]) => date >= previousFrom && date <= previousTo)
      .map(([, row]) => recoveryTrendValue(row, key)).filter(value => value !== null);
    const currentAverage = average(currentValues);
    const previousAverage = average(previousValues);
    const baselineValues = ['hrv', 'rhr'].includes(key)
      ? entries.filter(([date]) => date < from && date >= keyFor(shift(end, -96)))
          .map(([, row]) => recoveryTrendValue(row, key)).filter(value => value !== null)
      : [];
    const baselineMedian = baselineValues.length >= 5 ? median(baselineValues) : null;
    return {
      key, ...meta,
      currentAverage: currentAverage === null ? null : Number(currentAverage.toFixed(2)),
      previousAverage: previousAverage === null ? null : Number(previousAverage.toFixed(2)),
      delta: currentAverage === null || previousAverage === null ? null : Number((currentAverage - previousAverage).toFixed(2)),
      currentCount: currentValues.length,
      previousCount: previousValues.length,
      baselineMedian: baselineMedian === null ? null : Number(baselineMedian.toFixed(2)),
      baselineCount: baselineValues.length,
      baselineDeltaPercent: baselineMedian === null || currentAverage === null || baselineMedian === 0
        ? null : Number(((currentAverage / baselineMedian - 1) * 100).toFixed(1))
    };
  });
  return { from, to, previousFrom, previousTo, metrics };
}


/**
 * Calculates the accumulated shortfall against an explicitly configured
 * personal sleep target. Nights without a valid duration are excluded.
 * Extra sleep on another night is not treated as repayment of a shortfall.
 */
export function summarizeSleepDeficit(dailyCheckins = {}, sleepNeedHours, dateKey = localTodayKey(), windowDays = 7) {
  const target = validNumber(sleepNeedHours) ? Number(sleepNeedHours) : null;
  const days = Number(windowDays);
  const parts = String(dateKey).split('-').map(Number);
  if (target === null || target < 4 || target > 14 || !Number.isInteger(days) || days < 1 || days > 90 ||
      parts.length !== 3 || parts.some(n => !Number.isInteger(n))) {
    return { target: target !== null && target >= 4 && target <= 14 ? target : null, from: null, to: null, cumulativeShortfall: null, averageDuration: null, measuredNights: 0, nightsBelowTarget: 0 };
  }
  const end = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  if (!Number.isFinite(end.getTime()) || end.getFullYear() !== parts[0] ||
      end.getMonth() !== parts[1] - 1 || end.getDate() !== parts[2]) {
    return { target, from: null, to: null, cumulativeShortfall: null, averageDuration: null, measuredNights: 0, nightsBelowTarget: 0 };
  }
  const keyFor = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const fromDate = new Date(end);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const values = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(end);
    date.setDate(date.getDate() - offset);
    const value = recoveryTrendValue((dailyCheckins || {})[keyFor(date)], 'sleepDuration');
    if (value !== null) values.push(value);
  }
  const shortfall = values.reduce((sum, value) => sum + Math.max(0, target - value), 0);
  return {
    target: Number(target.toFixed(2)),
    from: keyFor(fromDate),
    to: keyFor(end),
    cumulativeShortfall: values.length ? Number(shortfall.toFixed(2)) : null,
    averageDuration: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null,
    measuredNights: values.length,
    nightsBelowTarget: values.filter(value => value < target).length
  };
}

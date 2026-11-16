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

export function calculateReadiness(dailyCheckins = {}, dailyTimeline = [], dateKey = localTodayKey()){
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
  // Acute-to-chronic workload ratio from the existing load timeline. This
  // is a training-strain indicator, not a medical or injury-risk diagnosis.
  const loadDay=(dailyTimeline||[]).find(day=>day.date===dateKey);
  if(loadDay&&validNumber(loadDay.acwr)&&Number(loadDay.acwr)>0){
    const ratio=Number(loadDay.acwr);
    const loadScore=clamp(100-Math.max(0,ratio-1)*60-Math.max(0,0.8-ratio)*25);
    objective.push({key:'trainingLoad',label:'Trainingsbelastung',value:ratio,unit:'ACWR',score:Math.round(loadScore)});
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

/* KAJO V2 – Training Load overview and HR-zone analysis.
 * Reuses the central CTL/ATL/TSB timeline and the existing HR-zone calculations.
 * No separate load formulas are introduced in this presentation layer.
 */
import { state } from './state.js';
import { computePerformanceTimeline } from './calculations.js';
import { getHeartRateZoneAnalysis } from './training-load.js?v=3';

let selectedModel='kajo', selectedSport='all', volumeMeasure='duration', zoneDisplayMode='minutes';
const charts=Object.create(null);
const periodCounts={'7d':7,'28d':28,'3m':90,'6m':180,'1y':365};
const zoneNames=['Z1','Z2','Z3','Z4','Z5'];
const zoneColors=['#6DA8F7','#55B6A4','#E5C45B','#E99A55','#D96A78'];
const colors={ctl:'#6DA8F7',atl:'#D98AB5',tsb:'#A78BFA',volume:'#6D9DCB'};
const valid=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const fmt=value=>valid(value)?Number(value).toLocaleString('de-DE',{maximumFractionDigits:1}):'—';
const fmtDuration=minutes=>{if(!valid(minutes))return '—';const n=Math.round(Number(minutes));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')+' h';};
const setText=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value==null?'':String(value);};
const setVisible=(id,visible)=>document.getElementById(id)?.classList.toggle('hidden',!visible);
function destroyChart(key){if(charts[key]){charts[key].destroy();delete charts[key];}}
function chartBase(id,key,config){const canvas=document.getElementById(id);if(!canvas||typeof Chart!=='function')return;destroyChart(key);charts[key]=new Chart(canvas.getContext('2d'),config);}
function todayKey(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function getRange(){
 if(state.activeTimeframe==='custom'){const from=document.getElementById('date-from')?.value,to=document.getElementById('date-to')?.value;if(from&&to&&from<=to)return{from,to};}
 const days=periodCounts[state.activeTimeframe]||90,end=new Date(todayKey()+'T12:00:00'),start=new Date(end);start.setDate(start.getDate()-days+1);
 const key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 return{from:key(start),to:key(end)};
}
function dateKeys(range){const out=[],d=new Date(range.from+'T12:00:00'),end=new Date(range.to+'T12:00:00');while(d<=end&&out.length<500){out.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'));d.setDate(d.getDate()+1);}return out;}
function uniqueActivities(records){
 const seen=new Set();return(Array.isArray(records)?records:[]).filter(item=>{const date=String(item?.date||'').slice(0,10);if(!date)return false;const stable=item.garminActivityId||item.externalId||item.id;const key=stable!=null&&stable!==''?'id:'+stable:[date,item.type,item.startTime||item.startTimeLocal||'',item.name||'',item.duration??''].join('|');if(seen.has(key))return false;seen.add(key);return true;});
}
function allActivities(){const records=uniqueActivities(state.rawActivities);return selectedSport==='all'?records:records.filter(item=>(item.type||'Other')===selectedSport);}
function selectedActivities(){const range=getRange();return allActivities().filter(item=>{const d=String(item.date).slice(0,10);return d>=range.from&&d<=range.to;});}
function rangeLabel(){return({'7d':'Letzte 7 Tage','28d':'Letzte 28 Tage','3m':'Letzte 90 Tage','6m':'Letzte 6 Monate','1y':'Letztes Jahr',custom:'Individueller Zeitraum'})[state.activeTimeframe]||'Letzte 90 Tage';}
function updatePeriodControl(){setText('training-load-period-button',rangeLabel()+'⌄');const b=document.getElementById('training-load-period-button');if(b)b.setAttribute('aria-expanded',String(!document.getElementById('training-load-period-menu')?.classList.contains('hidden')));}
function updateSportOptions(){
 const select=document.getElementById('training-load-sport-filter');if(!select)return;
 const values=[...new Set(uniqueActivities(state.rawActivities).map(item=>item.type||'Other'))].sort((a,b)=>a.localeCompare(b,'de'));
 if(selectedSport!=='all'&&!values.includes(selectedSport))selectedSport='all';
 select.replaceChildren();const all=document.createElement('option');all.value='all';all.textContent='Alle Sportarten';select.appendChild(all);
 values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);});select.value=selectedSport;
}
function getPerformanceTimeline(){return selectedSport==='all'?(Array.isArray(state.dailyTimeline)?state.dailyTimeline:[]):computePerformanceTimeline(allActivities(),state.settings||{},state.profile||{},state.dailyCheckins||{});}
function selectedTimeline(){const range=getRange(),map=new Map(getPerformanceTimeline().map(day=>[day.date,day]));return dateKeys(range).map(date=>map.get(date)||{date,ctl:null,atl:null,tsb:null,load:null,dataStatus:'unknown',activityCount:0});}
function lastValidLoadDay(timeline){for(let i=timeline.length-1;i>=0;i--){const row=timeline[i];if(valid(row.ctl)||valid(row.atl)||valid(row.tsb))return row;}return null;}
function renderRings(timeline){
 const root=document.getElementById('training-load-rings');if(!root)return;const last=lastValidLoadDay(timeline);
 const items=[
  {key:'ctl',label:'CTL',value:last?.ctl,detail:'Langfristig',color:colors.ctl},
  {key:'atl',label:'ATL',value:last?.atl,detail:'Kurzfristig',color:colors.atl},
  {key:'tsb',label:'TSB',value:last?.tsb,detail:'CTL minus ATL',color:valid(last?.tsb)?(Number(last.tsb)<0?'#D98A6F':Number(last.tsb)>0?'#55B6A4':colors.tsb):colors.tsb}
 ];
 root.replaceChildren();items.forEach(item=>{const card=document.createElement('div');card.className='kajo-load-metric';const ring=document.createElement('span');ring.className='kajo-load-ring';ring.style.setProperty('--load-ring-color',item.color);ring.dataset.metric=item.key;const value=document.createElement('strong');value.textContent=fmt(item.value);ring.appendChild(value);const label=document.createElement('span');label.className='kajo-load-label';label.textContent=item.label;const detail=document.createElement('small');detail.textContent=item.detail;card.append(ring,label,detail);root.appendChild(card);});
 setText('training-load-status-date',last?'Stand '+new Date(last.date+'T12:00:00').toLocaleDateString('de-DE'):'Keine gültigen Modellwerte');
 const mode=last?.loadMode==='srpe'?'sRPE-Load':last?.loadMode==='garmin-zone'?'KAJO-HF-Zonenindex':'Belastungsmodell';
 setText('training-load-status-title',mode);
 setText('training-load-status-note',last?'CTL und ATL beruhen auf derselben Belastungsskala. TSB ist die Differenz aus CTL und ATL. Die Kreise zeigen Messwerte, keinen künstlichen Fortschritt oder Zielerreichungs-Prozentwert.':'CTL, ATL und TSB sind mit der derzeitigen Datenabdeckung nicht berechenbar. Fehlende Tage werden nicht als Ruhetage interpretiert.');
}
function renderVolumeSummary(activities,range){
 const hasDuration=item=>item.duration!==null&&item.duration!==undefined&&item.duration!==''&&Number.isFinite(Number(item.duration))&&Number(item.duration)>0;
 const known=activities.filter(hasDuration),total=known.reduce((sum,item)=>sum+Number(item.duration),0);
 const days=Math.max(1,Math.round((new Date(range.to+'T12:00:00')-new Date(range.from+'T12:00:00'))/86400000)+1),average=total/days*7;
 const values=[{label:'Trainingszeit',value:fmtDuration(total),detail:'erfasste Dauer'},{label:'Einheiten',value:String(activities.length),detail:'absolviert'},{label:'Ø pro Woche',value:fmtDuration(average),detail:'Trainingszeit'}];
 const root=document.getElementById('training-load-volume-summary');if(root){root.replaceChildren();values.forEach(item=>{const cell=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong'),detail=document.createElement('small');label.textContent=item.label;value.textContent=item.value;detail.textContent=item.detail;cell.append(label,value,detail);root.appendChild(cell);});}
 setText('training-load-volume-note',(known.length?known.length+' von '+activities.length+' Einheiten mit erfasster Dauer.':'Keine Trainingsdauern im Zeitraum erfasst.')+(activities.length?' Das Wochenmittel berücksichtigt die exakte Länge des gewählten Zeitraums.':''));
 const buckets=new Map();activities.forEach(item=>{const date=String(item.date).slice(0,10),day=new Date(date+'T12:00:00');day.setDate(day.getDate()-((day.getDay()+6)%7));const key=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');if(!buckets.has(key))buckets.set(key,{minutes:0});if(hasDuration(item))buckets.get(key).minutes+=Number(item.duration);});
 const keys=[...buckets.keys()].sort(),labels=keys.map(key=>new Date(key+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}));
 chartBase('training-load-week-chart','weekChart',{type:'bar',data:{labels,datasets:[{data:keys.map(key=>Number((buckets.get(key).minutes/60).toFixed(2))),backgroundColor:colors.volume,borderRadius:5,maxBarThickness:30}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>fmt(item.parsed.y)+' h'}}},scales:{x:{grid:{display:false},ticks:{color:'#7d8a98',maxRotation:0}},y:{beginAtZero:true,grid:{color:'rgba(148,163,184,.10)'},ticks:{color:'#7d8a98'},title:{display:true,text:'Stunden pro Woche',color:'#7d8a98'}}}}});
}
function renderLoadTrend(timeline,activities){
 const labels=timeline.map(row=>new Date(row.date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})),textColor='#94a3b8';
 chartBase('training-load-ctl-atl-chart','ctlAtlChart',{type:'line',data:{labels,datasets:[
  {label:'CTL · langfristig',data:timeline.map(row=>valid(row.ctl)?Number(row.ctl):null),borderColor:colors.ctl,backgroundColor:colors.ctl,borderWidth:2.2,tension:.22,pointRadius:0,pointHitRadius:8,spanGaps:false},
  {label:'ATL · kurzfristig',data:timeline.map(row=>valid(row.atl)?Number(row.atl):null),borderColor:colors.atl,backgroundColor:colors.atl,borderWidth:2,tension:.22,pointRadius:0,pointHitRadius:8,spanGaps:false}
 ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:textColor,usePointStyle:true,boxWidth:8}},tooltip:{callbacks:{label:item=>item.dataset.label+': '+fmt(item.parsed.y)}}},scales:{x:{grid:{display:false},ticks:{color:textColor,maxTicksLimit:9,maxRotation:0}},y:{beginAtZero:true,grid:{color:'rgba(148,163,184,.10)'},ticks:{color:textColor}}}}});
 const activityByDate=new Map();activities.forEach(item=>{const date=String(item.date).slice(0,10);if(!activityByDate.has(date))activityByDate.set(date,{minutes:0,sessions:0,knownDurationCount:0});const day=activityByDate.get(date);day.sessions++;if(item.duration!==null&&item.duration!==undefined&&item.duration!==''&&Number.isFinite(Number(item.duration))&&Number(item.duration)>0){day.minutes+=Number(item.duration);day.knownDurationCount++;}});
 const measure=volumeMeasure;
 chartBase('training-load-volume-chart','volumeChart',{type:'bar',data:{labels,datasets:[{label:measure==='duration'?'Trainingszeit':'Einheiten',data:timeline.map(row=>{const day=activityByDate.get(row.date);if(!day)return row.dataStatus==='confirmed-rest'?0:null;if(measure==='sessions')return day.sessions;return day.knownDurationCount?Number((day.minutes/60).toFixed(2)):null;}),backgroundColor:colors.volume,borderRadius:3,maxBarThickness:18}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>measure==='duration'?fmt(item.parsed.y)+' h':fmt(item.parsed.y)+' Einheiten'}}},scales:{x:{grid:{display:false},ticks:{color:textColor,maxTicksLimit:9,maxRotation:0}},y:{beginAtZero:true,grid:{color:'rgba(148,163,184,.10)'},ticks:{color:textColor},title:{display:true,text:measure==='duration'?'Stunden pro Tag':'Einheiten pro Tag',color:textColor}}}}});
 chartBase('training-load-tsb-chart','tsbChart',{type:'line',data:{labels,datasets:[
  {label:'TSB',data:timeline.map(row=>valid(row.tsb)?Number(row.tsb):null),borderColor:colors.tsb,backgroundColor:colors.tsb,borderWidth:2.2,tension:.22,pointRadius:0,pointHitRadius:8,spanGaps:false},
  {label:'Nulllinie',data:timeline.map(row=>valid(row.tsb)?0:null),borderColor:'rgba(148,163,184,.6)',borderWidth:1,borderDash:[5,4],pointRadius:0,pointHitRadius:0,tension:0}
 ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>item.datasetIndex===0?'TSB: '+fmt(item.parsed.y):null}}},scales:{x:{grid:{display:false},ticks:{color:textColor,maxTicksLimit:9,maxRotation:0}},y:{grid:{color:'rgba(148,163,184,.10)'},ticks:{color:textColor},title:{display:true,text:'TSB · CTL minus ATL',color:textColor}}}}});
 const has=timeline.some(row=>valid(row.ctl)||valid(row.atl)||valid(row.tsb));setText('training-load-trend-note',has?'Trainingszeit und Einheiten stammen aus dokumentierten Aktivitäten. Tage ohne bestätigte Datenabdeckung bleiben Lücken und werden nicht als trainingsfrei interpretiert.':'Für den gewählten Zeitraum liegt kein durchgängiger, berechenbarer CTL-/ATL-/TSB-Verlauf vor.');
}
function modelKeys(){return selectedModel==='compare'?['kajo','edwards']:[selectedModel];}
function modelName(key){return key==='kajo'?'KAJO · HF-Reserve':'Edwards · %HFmax';}
function zoneValues(seconds){const total=seconds.reduce((sum,v)=>sum+(valid(v)?Number(v):0),0);return zoneDisplayMode==='percent'?seconds.map(v=>total>0?Number((Number(v)/total*100).toFixed(1)):null):seconds.map(v=>Number((Number(v)/60).toFixed(1)));}
function renderZoneChart(analysis){
 const keys=modelKeys(),rows=keys.map(key=>({key,label:modelName(key),values:zoneValues(analysis[key].zonesSeconds)}));
 const datasets=zoneNames.map((name,index)=>({label:name,data:rows.map(row=>row.values[index]),backgroundColor:zoneColors[index],borderWidth:0,borderRadius:3,barThickness:18,stack:'zone-'+(keys.length>1?'comparison':'single')}));
 chartBase('training-load-zone-chart','zoneChart',{type:'bar',data:{labels:rows.map(row=>row.label),datasets},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},scales:{x:{stacked:true,beginAtZero:true,max:zoneDisplayMode==='percent'?100:undefined,grid:{color:'rgba(148,163,184,.10)'},ticks:{color:'#7d8a98'},title:{display:true,text:zoneDisplayMode==='percent'?'Anteil der erfassten Zonenzeit (%)':'Zeit (Minuten)',color:'#7d8a98'}},y:{stacked:true,grid:{display:false},ticks:{color:'#a9b5c2'}}},plugins:{legend:{display:true,position:'bottom',labels:{color:'#a9b5c2',usePointStyle:true,boxWidth:8,padding:12}},tooltip:{callbacks:{label:item=>item.dataset.label+': '+fmt(item.parsed.x)+(zoneDisplayMode==='percent'?' %':' min')}}}}});
 setText('training-load-zone-totals',keys.map(key=>modelName(key)+': '+fmt(analysis[key].totalZoneMinutes)+' min · gewichteter Index '+fmt(analysis[key].weightedLoad)+' Punkte').join('  |  '));
 setText('training-load-zone-unit',zoneDisplayMode==='percent'?'Anteil (%)':'Minuten');
}
function renderZoneTrendChart(analysis,range){
 const keys=modelKeys(),dates=dateKeys(range),labels=dates.map(date=>new Date(date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})),datasets=[];
 keys.forEach(key=>{const daily=new Map(analysis[key].daily.map(row=>[row.date,row]));zoneNames.forEach((name,index)=>datasets.push({label:(keys.length>1?(key==='kajo'?'KAJO ':'Edwards '):'')+name,data:dates.map(date=>{const row=daily.get(date);if(!row)return null;const seconds=row.secondsByZone||[0,0,0,0,0],total=seconds.reduce((sum,v)=>sum+Number(v||0),0);return zoneDisplayMode==='percent'?(total>0?Number((Number(seconds[index])/total*100).toFixed(1)):null):Number((Number(seconds[index])/60).toFixed(1));}),backgroundColor:zoneColors[index],borderColor:zoneColors[index],borderWidth:0,stack:key}));});
 chartBase('training-load-daily-chart','dailyChart',{type:'bar',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},scales:{x:{stacked:true,grid:{display:false},ticks:{color:'#7d8a98',maxTicksLimit:9,maxRotation:0}},y:{stacked:true,beginAtZero:true,max:zoneDisplayMode==='percent'?100:undefined,grid:{color:'rgba(148,163,184,.10)'},ticks:{color:'#7d8a98'},title:{display:true,text:zoneDisplayMode==='percent'?'Anteil pro Tag (%)':'Minuten pro Tag',color:'#7d8a98'}}},plugins:{legend:{display:true,position:'bottom',labels:{color:'#a9b5c2',usePointStyle:true,boxWidth:7,padding:8}},tooltip:{callbacks:{label:item=>item.dataset.label+': '+fmt(item.parsed.y)+(zoneDisplayMode==='percent'?' %':' min')}}}}});
 setText('training-load-zone-trend-unit',zoneDisplayMode==='percent'?'Anteil je Tag':'Minuten pro Tag');
}
function renderCoverage(analysis){
 const c=analysis.coverage;
 setText('training-load-source-title',selectedModel==='kajo'?'KAJO-HF-Zonenindex':selectedModel==='edwards'?'Edwards TRIMP':'Vergleich der HF-Zonenmodelle');
 setText('training-load-source-description',selectedModel==='kajo'?'Gewichtete Zeit in adaptiven Herzfrequenzreserve-Zonen (Karvonen). Die Ruheherzfrequenz wird anhand des konfigurierten Rückblicks angepasst; HFmax stammt aus dem Athletenprofil.':selectedModel==='edwards'?'Gewichtete Zeit in fünf festen Bereichen relativ zur maximalen Herzfrequenz: 50–<60 %, 60–<70 %, 70–<80 %, 80–<90 % und ≥90 %. Zeit unter 50 % wird nicht gewertet.':'KAJO nutzt adaptive Herzfrequenzreserve-Zonen; Edwards verwendet feste Prozentbereiche der HFmax.');
 setText('training-load-coverage','Garmin-Aktivitäten: '+c.garminActivityCount+' · KAJO berechenbar: '+c.activitiesWithKajoZones+' · Edwards berechenbar: '+c.activitiesWithEdwards+(c.activitiesWithoutUsableAdaptiveRhr?' · KAJO ohne adaptive Ruhe-HF: '+c.activitiesWithoutUsableAdaptiveRhr:'')+(c.activitiesWithoutUsableEdwardsMaxHr?' · Edwards ohne gültige HFmax: '+c.activitiesWithoutUsableEdwardsMaxHr:''));
 const maxHr=Number(state.profile?.maxHr);setText('training-load-edwards-maxhr-note',Number.isFinite(maxHr)&&maxHr>=100&&maxHr<=240?'HFmax '+maxHr+' bpm aus deinem Athletenprofil.':'Für Edwards ist eine gültige HFmax im Athletenprofil erforderlich.');
}
function renderActivityList(analysis){
 const node=document.getElementById('training-load-activity-list');if(!node)return;node.replaceChildren();
 const rows=[...analysis.records].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);
 if(!rows.length){const empty=document.createElement('p');empty.className='text-xs text-slate-500';empty.textContent='Keine Aktivitäten mit auswertbaren Herzfrequenz-Zeitreihen im ausgewählten Zeitraum.';node.appendChild(empty);return;}
 rows.forEach(item=>{const row=document.createElement('div');row.className='flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 py-2 text-xs';const left=document.createElement('span');left.className='text-slate-300';left.textContent=item.date+' · '+item.sport;const right=document.createElement('span');right.className='text-slate-400 text-right';const values=[];if(item.kajo&&(selectedModel==='kajo'||selectedModel==='compare'))values.push('KAJO '+fmt(item.kajo.value));if(item.edwards&&(selectedModel==='edwards'||selectedModel==='compare'))values.push('Edwards '+fmt(item.edwards.value));right.textContent=values.join(' · ')||'Nicht berechenbar';row.append(left,right);node.appendChild(row);});
}
export function toggleTrainingLoadPeriodMenu(){const menu=document.getElementById('training-load-period-menu'),button=document.getElementById('training-load-period-button');if(!menu)return;const open=menu.classList.toggle('hidden')===false;button?.setAttribute('aria-expanded',String(open));}
export function setTrainingLoadPeriod(period){document.getElementById('training-load-period-menu')?.classList.add('hidden');document.getElementById('training-load-period-button')?.setAttribute('aria-expanded','false');if(period==='custom'){document.getElementById('custom-date-box')?.classList.remove('hidden');return;}if(!['7d','28d','3m','6m','1y'].includes(period))return;window.setTimeframe?.(period);}
export function setTrainingLoadSportFilter(sport){selectedSport=sport||'all';renderTrainingLoadView();}
export function setTrainingLoadVolumeMeasure(measure){if(!['duration','sessions'].includes(measure))return;volumeMeasure=measure;document.querySelectorAll('[data-load-volume]').forEach(button=>{const active=button.dataset.loadVolume===measure;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});renderLoadTrend(selectedTimeline(),selectedActivities());}
export function setTrainingLoadZoneDisplayMode(mode){if(!['minutes','percent'].includes(mode))return;zoneDisplayMode=mode;document.querySelectorAll('[data-zone-display]').forEach(button=>{const active=button.dataset.zoneDisplay===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});renderTrainingLoadView();}
export function setTrainingLoadModel(model){if(!['kajo','edwards','compare'].includes(model))return;selectedModel=model;document.querySelectorAll('[data-training-load-model]').forEach(button=>{const active=button.dataset.trainingLoadModel===model;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});renderTrainingLoadView();}
export function setTrainingLoadDailyMeasure(){}
export function setTrainingLoadChartMetric(){}
export function openTrainingLoadMetric(){}
export function closeTrainingLoadMetric(){renderTrainingLoadView();}
export function renderTrainingLoadView(){
 updateSportOptions();updatePeriodControl();const range=getRange(),activities=selectedActivities(),timeline=selectedTimeline();
 renderRings(timeline);renderVolumeSummary(activities,range);renderLoadTrend(timeline,activities);
 const analysis=getHeartRateZoneAnalysis(activities,state.settings||{},state.profile||{},state.dailyCheckins||{});
 renderCoverage(analysis);renderZoneChart(analysis);renderZoneTrendChart(analysis,range);renderActivityList(analysis);
 const hasZones=analysis.records.length>0;setVisible('training-load-no-data',!hasZones);setVisible('training-load-zone-analysis',hasZones);
 const note=document.getElementById('training-load-zone-method-note');
 if(note)note.textContent=selectedModel==='compare'?'Die Zonenbezeichnungen Z1–Z5 sind zwischen den Modellen nicht physiologisch identisch. KAJO nutzt adaptive HF-Reserve-Zonen; Edwards feste Prozentbereiche der HFmax. Werte nicht als identische Zonen vergleichen.':selectedModel==='edwards'?'Edwards verwendet feste Prozentbereiche der HFmax. Zeit unter 50 % HFmax wird nicht einer Zone zugeordnet.':'KAJO verwendet adaptive HF-Reserve-Zonen mit einer Ruhe-HF-Basis aus dem konfigurierten Rückblick; ein Profil-Fallback ist als eingeschränkte Datenbasis zu verstehen.';
 document.querySelectorAll('[data-training-load-model]').forEach(button=>{const active=button.dataset.trainingLoadModel===selectedModel;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
 document.querySelectorAll('[data-zone-display]').forEach(button=>{const active=button.dataset.zoneDisplay===zoneDisplayMode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
 document.querySelectorAll('[data-load-volume]').forEach(button=>{const active=button.dataset.loadVolume===volumeMeasure;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
}

/* ============================================================
 * charts.js – Alle Chart.js-Diagramme
 *   - Hauptdiagramm CTL / ATL / TSB (+ Zeitraum-Steuerung)
 *   - Multisport-Verteilung (Doughnut + Legende)
 *   - Wettkampf-Zeitstrahl / Fitness-Projektion
 *   - Aktivitäts-Telemetrie
 * `Chart` kommt als globales Objekt vom CDN-Script in index.html.
 * ============================================================ */

import { state } from './state.js';
import { formatDateDDMMYY, sportsCatalog, toLocalDateString, getSportsCatalog } from './utils.js';
import { inspectDay, calculateReadiness, renderMetricHistory } from './dashboard.js';
import { getTrainingLoadData } from './training-load.js';
import { getGarminTelemetry } from './data-source.js';

function renderLoadSourceNote(timeline) {
    const note = document.getElementById('load-source-note');
    if (!note) return;
    const last = Array.isArray(timeline) && timeline.length ? timeline[timeline.length - 1] : null;
    const mode = last?.loadMode;
    const descriptions = {
        'garmin-zone': 'Quelle: Garmin-FIT-Herzfrequenzdaten. Der angezeigte Wert ist ein Endurance-AI-Index aus gewichteter Zeit in HF-Zonen (Z1–Z5), kein TSS und kein Garmin-Training-Load. Es zählen nur Aktivitäten mit auswertbarer HF-Zeitreihe und gültigen HF-Zonen.',
        'garmin-native': 'Quelle: Garmin-eigene Trainingsbelastung. Diese Werte werden nicht mit externem TSS oder dem Endurance-AI-HF-Zonenindex vermischt und sind nicht direkt mit ihnen vergleichbar.',
        'external-tss': 'Externe TSS-Werte werden nicht als Belastungsgrundlage verwendet.',
        'garmin-unavailable': 'Garmin-Daten erkannt, aber aktuell keine auswertbaren Garmin-Load-Werte vorhanden. Externe TSS-Werte werden in diesem Modus nicht beigemischt.'
    };
    const coverage = last?.loadCoverage;
    const coverageText = coverage?.eligibleActivityCount
        ? ' Abdeckung: ' + coverage.loadedActivityCount + ' von ' + coverage.eligibleActivityCount + ' Garmin-Aktivitäten mit ausgewählter Quelle; ' + coverage.excludedActivityCount + ' ohne passenden Wert.'
        : '';
    note.textContent = (descriptions[mode] || 'Belastungsquelle derzeit nicht eindeutig zuordenbar. Belastungswerte verschiedener Berechnungsmethoden sind nicht direkt vergleichbar.') + coverageText;
}

export function renderMainLoadChart(timeline, timeframe) {
    const canvas = document.getElementById('intervalsLoadChart');
    if (!canvas) return;
    renderLoadSourceNote(timeline);
    if (!timeline || !timeline.length) {
        if (state.mainChartInstance) state.mainChartInstance.destroy();
        const hasGarmin = state.rawActivities.some(a => a.source === 'garmin' || a.garminData || a.garminFitImported || (Array.isArray(a.sources) && a.sources.includes('garmin')));
        const title = hasGarmin ? 'Für den Verlauf fehlen noch auswertbare Garmin-Load-Daten.' : 'Noch keine auswertbaren Trainingsdaten.';
        state.mainChartInstance = new Chart(canvas.getContext('2d'), {type:'line',data:{labels:[],datasets:[]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:title,color:'#94a3b8'}}}});
        ['kpi-ctl','kpi-atl','kpi-tsb','kpi-acwr'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='—'; });
        return;
    }
    let filtered = timeline;
    if (timeframe === '7d') filtered = timeline.slice(-7);
    else if (timeframe === '28d') filtered = timeline.slice(-28);
    else if (timeframe === '3m') filtered = timeline.slice(-90);
    else if (timeframe === '6m') filtered = timeline.slice(-180);
    else if (timeframe === '1y') filtered = timeline.slice(-365);
    else if (timeframe === 'custom') {
        const from=document.getElementById('date-from')?.value, to=document.getElementById('date-to')?.value;
        filtered=timeline.filter(t=>t.date>=from&&t.date<=to);
    }
    if (!filtered.length) return;
    const last=timeline[timeline.length-1];
    const isGarmin=last.loadMode === 'garmin-native' || last.loadMode === 'garmin-zone';
    const isSrpe=last.loadMode === 'srpe';
    const labels=filtered.map(t=>formatDateDDMMYY(t.date));
    const ctl=filtered.map(t=>t.ctl);
    const atl=filtered.map(t=>t.atl);
    const form=filtered.map(t=>isGarmin ? t.formPct : isSrpe ? t.tsb : null);
    const health=filtered.map(t=>state.healthLogs[t.date] ? t.ctl : null);
    const ctx=canvas.getContext('2d');
    if(state.mainChartInstance) state.mainChartInstance.destroy();
    state.mainChartInstance=new Chart(ctx,{
        type:'line',
        data:{labels,datasets:[
            {label:'Langfristige Belastung (CTL)',data:ctl,borderColor:'#60a5fa',backgroundColor:'rgba(96,165,250,.08)',fill:true,borderWidth:2.5,tension:.25,pointRadius:0,pointHitRadius:8,yAxisID:'y'},
            {label:'Kurzfristige Belastung (ATL)',data:atl,borderColor:'#d946ef',borderWidth:2,tension:.25,pointRadius:0,pointHitRadius:8,yAxisID:'y'},
            {label:isGarmin?(last.loadMode==='garmin-native'?'Relativer Saldo (Garmin Load)':'Relativer Saldo (EA-HF-Zonenindex)'):isSrpe?'Belastungsbilanz (sRPE)':'Keine Load-Quelle',data:form,borderColor:'#a3a3a3',borderWidth:1.8,tension:.25,pointRadius:0,pointHitRadius:8,yAxisID:'y1'},
            {label:'Krankheit / Verletzung',data:health,showLine:false,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:'#facc15',pointBorderColor:'#facc15',yAxisID:'y'}
        ]},
        options:{
            responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
            onClick:(e,els)=>{if(els.length) inspectDay(filtered[els[0].index]);},
            plugins:{
                legend:{display:true,labels:{color:'#cbd5e1',usePointStyle:true,boxWidth:18,padding:12,font:{size:11},filter:item=>item.datasetIndex<3}},
                tooltip:{
                    backgroundColor:'rgba(15,23,42,.96)',titleColor:'#f8fafc',bodyColor:'#e2e8f0',borderWidth:0,cornerRadius:8,padding:10,
                    callbacks:{
                        title:items=>formatDateDDMMYY(filtered[items[0].dataIndex].date),
                        label:item=>item.datasetIndex===3 ? 'Gesundheitseintrag' : item.dataset.label+': '+(item.parsed.y==null?'—':Number(item.parsed.y).toFixed(1)),
                        afterBody:items=>{
                            const day=filtered[items[0].dataIndex];
                            const acts=state.rawActivities.filter(a=>typeof a.date==='string'&&a.date.slice(0,10)===day.date);
                            const healthLog=state.healthLogs[day.date];
                            const lines=acts.slice(0,4).map(act=>{
                                const duration=act.duration!=null?act.duration+' min':'Dauer —';
                                const distance=act.distance!=null?Number(act.distance).toFixed(1)+' km':'Distanz —';
                                const hr=act.hr!=null?'Ø HF '+act.hr:'Ø HF —';
                                const maxHr=act.maxHr!=null?' · Max '+act.maxHr:'';
                                const rpe=act.perceivedEffort!=null?' · RPE '+act.perceivedEffort+'/10':'';
                                return (act.name||act.type||'Aktivität')+': '+duration+' · '+distance+' · '+hr+maxHr+rpe;
                            });
                            if(acts.length>4) lines.push('+'+(acts.length-4)+' weitere Aktivitäten');
                            if(healthLog) lines.push((healthLog.status==='sick'?'Krankheit':healthLog.status==='injured'?'Verletzung':'Gesundheit')+': '+(healthLog.diagnosis||healthLog.status||'Eintrag'));
                            return lines;
                        }
                    }
                }
            },
            scales:{
                x:{grid:{display:false},ticks:{color:'#94a3b8',maxTicksLimit:10,autoSkip:true,maxRotation:0}},
                y:{position:'left',grid:{color:'rgba(148,163,184,.10)'},ticks:{color:'#94a3b8',maxTicksLimit:5},title:{display:true,text:'Modellierte Belastung',color:'#64748b',font:{size:10}}},
                y1:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#a3a3a3',maxTicksLimit:5},title:{display:true,text:isGarmin?'Relativer Saldo (%)':'Belastungssaldo (TSS · Tagesende)',color:'#64748b',font:{size:10}}}
            }
        }
    });
}

/**
 * Vergleicht den zeitlichen Trainingsumfang der vier Kanu-Disziplinen.
 * Die Dauer wird aus den importierten Aktivitätsminuten summiert.
 */
let customCanoeDateRange = null;

function formatDateInput(date) {
    return toLocalDateString(date);
}

export function applyCanoeDateRange() {
    const from = document.getElementById('canoe-date-from')?.value;
    const to = document.getElementById('canoe-date-to')?.value;
    const message = document.getElementById('canoe-training-hours-note');
    if (!from || !to) {
        if (message) message.textContent = 'Bitte wähle ein Start- und Enddatum aus.';
        return;
    }
    if (from > to) {
        if (message) message.textContent = 'Das Startdatum muss vor dem Enddatum liegen.';
        return;
    }
    if (to > toLocalDateString(new Date())) {
        if (message) message.textContent = 'Das Enddatum darf nicht in der Zukunft liegen.';
        return;
    }
    customCanoeDateRange = { from, to };
    renderCanoeTrainingHours(state.rawActivities);
}

export function resetCanoeDateRange() {
    customCanoeDateRange = null;
    const fromEl = document.getElementById('canoe-date-from');
    const toEl = document.getElementById('canoe-date-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    renderCanoeTrainingHours(state.rawActivities);
}

export function renderCanoeTrainingHours(records) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = customCanoeDateRange?.to || toLocalDateString(today);
    let startDate = customCanoeDateRange?.from || null;
    if (!customCanoeDateRange) {
        const defaultStart = new Date(today);
        defaultStart.setDate(defaultStart.getDate() - 89);
        startDate = toLocalDateString(defaultStart);
    }
    const filtered = records.filter(r => {
        const date = typeof r?.date === 'string' ? r.date.slice(0, 10) : '';
        return ['Kayaking', 'C1', 'C2', 'PaddleErgo'].includes(r.type)
            && date >= startDate && date <= endDate;
    });
    const disciplines = [
        { key: 'Kayaking', label: 'K1', color: '#0284c7' },
        { key: 'C1', label: 'C1', color: '#0369a1' },
        { key: 'C2', label: 'C2', color: '#0891b2' },
        { key: 'PaddleErgo', label: 'Ergo', color: '#06b6d4' }
    ];
    const totals = Object.fromEntries(disciplines.map(d => [d.key, { minutes: 0, sessions: 0, distance: 0 }]));
    filtered.forEach(r => {
        const item = totals[r.type];
        item.minutes += Math.max(0, Number(r.duration) || 0);
        item.sessions += 1;
        item.distance += Math.max(0, Number(r.distance) || 0);
    });

    const fromDate = new Date(startDate + 'T12:00:00');
    const toDate = new Date(endDate + 'T12:00:00');
    const daySpan = Math.round((toDate - fromDate) / 86400000) + 1;
    const dailyView = daySpan <= 14;
    const labels = [];
    const buckets = [];
    if (dailyView) {
        for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
            const key = toLocalDateString(d);
            buckets.push(key);
            labels.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
        }
    } else {
        const monday = new Date(fromDate);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        while (monday <= toDate) {
            const key = toLocalDateString(monday);
            buckets.push(key);
            const thursday = new Date(monday);
            thursday.setDate(thursday.getDate() + 3);
            const jan4 = new Date(thursday.getFullYear(), 0, 4);
            const week1 = new Date(jan4);
            week1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
            const week = Math.round((monday - week1) / 604800000) + 1;
            labels.push('KW ' + String(week).padStart(2, '0') + '/' + thursday.getFullYear());
            monday.setDate(monday.getDate() + 7);
        }
    }
    const dataByDiscipline = disciplines.map(d => {
        const byBucket = Object.fromEntries(buckets.map(key => [key, 0]));
        filtered.forEach(r => {
            const dateKey = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
            const date = new Date(dateKey + 'T12:00:00');
            let key = dateKey;
            if (!dailyView) {
                date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
                key = toLocalDateString(date);
            }
            if (key in byBucket) byBucket[key] += Math.max(0, Number(r.duration) || 0) / 60;
        });
        return { label: d.label, data: buckets.map(key => Number((byBucket[key] || 0).toFixed(2))), borderColor: d.color, backgroundColor: d.color, tension: 0.25, pointRadius: 2, borderWidth: 2 };
    });

    // Trainingsinhalte werden nur anhand der gespeicherten Kategorie und Bootsklasse ausgewertet.
    const contentSummary = document.getElementById('canoe-training-content-summary');
    if (contentSummary) {
        const boatRows = [
            { key: 'Kayaking', label: 'K1' },
            { key: 'C1', label: 'C1' },
            { key: 'C2', label: 'C2' },
            { key: 'PaddleErgo', label: 'Paddelergometer' }
        ];
        const categoryRows = [
            { key: 'ga', label: 'GA Ausdauer' },
            { key: 'interval', label: 'Intervalle' },
            { key: 'race', label: 'Wettkampf' },
            { key: 'reg', label: 'Regeneration' },
            { key: 'strength', label: 'Kraft' },
            { key: 'tech', label: 'Technik' },
            { key: '', label: 'Nicht zugeordnet' }
        ];
        const cellFor = (boat, category) => {
            const matches = filtered.filter(r => r.type === boat && (r.category || '') === category);
            const minutes = matches.reduce((sum, r) => sum + Math.max(0, Number(r.duration) || 0), 0);
            return { count: matches.length, hours: minutes / 60 };
        };
        contentSummary.innerHTML =
            '<div class="overflow-x-auto"><table class="w-full min-w-[620px] text-xs text-left"><thead><tr class="text-slate-400 border-b border-slate-800"><th class="py-2 pr-3">Boot / Kategorie</th>' +
            categoryRows.map(c => '<th class="py-2 px-2 text-right">' + c.label + '</th>').join('') +
            '</tr></thead><tbody>' +
            boatRows.map(boat => '<tr class="border-b border-slate-900"><th class="py-2 pr-3 text-white font-semibold">' + boat.label + '</th>' +
                categoryRows.map(category => {
                    const cell = cellFor(boat.key, category.key);
                    return '<td class="py-2 px-2 text-right text-slate-300 whitespace-nowrap">' +
                        cell.hours.toFixed(1) + ' h <span class="text-slate-500">(' + cell.count + ')</span></td>';
                }).join('') + '</tr>').join('') +
            '</tbody></table></div><p class="mt-2 text-[10px] text-slate-500">Angaben: Stunden (Anzahl Einheiten). Nur gespeicherte Bootsklassen und Trainingskategorien; fehlende Zuordnungen erscheinen separat.</p>';
    }

    // Sprint/Classic werden nur anhand einer ausdrücklich gespeicherten Kennzeichnung ausgewertet.
    const formatSummary = document.getElementById('canoe-race-format-summary');
    if (formatSummary) {
        const canoeRecords = filtered.filter(r => ['Kayaking', 'C1', 'C2'].includes(r.type));
        const formatRows = [
            { key: 'sprint', label: 'Sprint' },
            { key: 'classic', label: 'Classic' },
            { key: '', label: 'Nicht zugeordnet' }
        ];
        formatSummary.innerHTML = formatRows.map(row => {
            const matching = canoeRecords.filter(r => (r.raceFormat || '') === row.key);
            const minutes = matching.reduce((sum, r) => sum + Math.max(0, Number(r.duration) || 0), 0);
            return '<div class="bg-slate-950 border border-slate-800 rounded-xl p-3">' +
                '<div class="text-xs font-semibold text-white">' + row.label + '</div>' +
                '<div class="text-lg font-bold text-white mt-1">' + matching.length + ' Einheiten</div>' +
                '<div class="text-[10px] text-slate-400 mt-1">' + (minutes / 60).toFixed(1) + ' Stunden</div>' +
                '</div>';
        }).join('');
    }

    const canvas = document.getElementById('canoeTrainingHoursChart');
    if (canvas) {
        if (state.canoeVolumeChartInstance) state.canoeVolumeChartInstance.destroy();
        state.canoeVolumeChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: dataByDiscipline },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#cbd5e1', usePointStyle: true } },
                    tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + ' Std.' } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', maxTicksLimit: 16, maxRotation: 0 }, grid: { color: '#1e293b' } },
                    y: { beginAtZero: true, title: { display: true, text: dailyView ? 'Stunden pro Tag' : 'Stunden pro Woche', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
                }
            }
        });
    }

    const summary = document.getElementById('canoe-training-hours-summary');
    if (summary) {
        const totalMinutes = disciplines.reduce((sum, d) => sum + totals[d.key].minutes, 0);
        summary.innerHTML = disciplines.map(d => {
            const item = totals[d.key];
            const hours = item.minutes / 60;
            const share = totalMinutes ? item.minutes / totalMinutes * 100 : 0;
            return '<div class="bg-slate-950 border border-slate-800 rounded-xl p-3 min-w-0">' +
                '<div class="flex items-center gap-2 text-xs font-semibold text-white"><span class="w-2.5 h-2.5 rounded-full" style="background:' + d.color + '"></span>' + d.label + '</div>' +
                '<div class="text-xl font-bold text-white mt-1">' + hours.toFixed(1) + ' h</div>' +
                '<div class="text-[10px] text-slate-400 mt-1">' + share.toFixed(1) + ' % · ' + item.sessions + ' Einheiten</div>' +
                '</div>';
        }).join('');
        const note = document.getElementById('canoe-training-hours-note');
        if (note) note.textContent = filtered.length
            ? filtered.length + ' Kanu-Einheiten · ' + fromDate.toLocaleDateString('de-DE') + '–' + toDate.toLocaleDateString('de-DE')
            : 'Keine Kanu-Einheiten im gewählten Zeitraum.';
    }
}
export function renderSportDistribution(records) {
    const rangeEl=document.getElementById('sport-range');
    const days=rangeEl?rangeEl.value:'7';
    if(days!=='all'){
        const cutoff=new Date();cutoff.setDate(cutoff.getDate()-(Number(days)-1));
        const from=toLocalDateString(cutoff), to=toLocalDateString(new Date());
        records=records.filter(r=>{const date=typeof r?.date==='string'?r.date.slice(0,10):'';return date>=from&&date<=to;});
    }
    const sportCatalog = getSportsCatalog();
    const loadData = getTrainingLoadData(records, state.settings, state.profile);
    const loadByActivity = new Map(loadData.records.map(item => [item.activity, item.value]));
    const totals = {};
    const loadCounts = {};
    const durationTotals = {};
    const hrSums = {};
    const hrCounts = {};

    records.forEach(r => {
        const k = r.type || 'Workout';
        if (loadByActivity.has(r)) {
            totals[k] = (totals[k] || 0) + Number(loadByActivity.get(r));
            loadCounts[k] = (loadCounts[k] || 0) + 1;
        } else {
            totals[k] = totals[k] || 0;
        }
        const duration = Number(r.duration);
        if (Number.isFinite(duration) && duration > 0) durationTotals[k] = (durationTotals[k] || 0) + duration;
        const avgHr = Number(r.hr);
        if (Number.isFinite(avgHr) && avgHr > 0) {
            hrSums[k] = (hrSums[k] || 0) + avgHr;
            hrCounts[k] = (hrCounts[k] || 0) + 1;
        }
    });

    const labels = [];
    const vals = [];
    const colors = [];

    Object.keys(totals).forEach(k => {
        const conf = sportCatalog[k] || sportCatalog.Workout;
        labels.push(conf.label);
        vals.push(Number((durationTotals[k] / 60).toFixed(1)));
        colors.push(conf.color);
    });

    const ctx = document.getElementById('sportDistributionChart').getContext('2d');
    if (state.pieChartInstance) state.pieChartInstance.destroy();

    state.pieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${Number(ctx.parsed).toFixed(1)} Std.` } } } }
    });

    const legendEl = document.getElementById('sport-breakdown-legend');
    legendEl.innerHTML = '';

    Object.keys(totals).forEach(k => {
        const conf = sportCatalog[k] || sportCatalog.Workout;
        const hours = (durationTotals[k] / 60).toFixed(1);
        const distance = records.filter(r => (r.type || 'Workout') === k).reduce((sum,r) => sum + (Number(r.distance)||0), 0);
        const count = records.filter(r => (r.type || 'Workout') === k).length;
        const avgHr = hrCounts[k] ? Math.round(hrSums[k] / hrCounts[k]) : '-';

        legendEl.insertAdjacentHTML('beforeend', `
            <div class="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${conf.color}"></span>
                    <span class="text-white font-medium text-xs">${conf.label}</span>
                </div>
                <div class="font-mono text-xs flex items-center gap-3">
                    <span class="text-sky-400 font-bold">${loadCounts[k] ? Number(totals[k] || 0).toFixed(1) + ' Load' : '— Load nicht verfügbar'}</span>
                    <span class="text-slate-300">${hours} Std</span>
                    <span class="text-slate-300">${distance.toFixed(2)} km</span>
                    <span class="text-slate-500">${count} Einh.</span>
                    <span class="text-rose-400">Ø je Einheit ${avgHr} bpm</span>
                </div>
            </div>
        `);
    });
}

export function renderHeartRateZoneDistribution(records) {
    const canvas = document.getElementById('heartRateZonesChart');
    const note = document.getElementById('heart-rate-zone-note');
    const summary = document.getElementById('heart-rate-zone-summary');
    if (!canvas) return;

    const catalog = getSportsCatalog();
    const totals = {};
    const rangeEl = document.getElementById('sport-range');
    const days = rangeEl ? rangeEl.value : '7';
    if (days !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (Number(days) - 1));
        const from = toLocalDateString(cutoff);
        const to = toLocalDateString(new Date());
        records = (records || []).filter(activity => activity.date >= from && activity.date <= to);
    }

    let usable = 0, missingTelemetry = 0, missingZones = 0, missingDuration = 0, estimatedActivities = 0;
    for (const activity of records || []) {
        const telemetry = getGarminTelemetry(activity) || {};
        const hr = telemetry.hr;
        if (!Array.isArray(hr) || hr.length < 2) {
            missingTelemetry++;
            continue;
        }
        const zones = state.settings?.heartRateZones?.[activity.type];
        const validZones = Array.isArray(zones) && zones.length === 4
            && zones.every(value => value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 40 && Number(value) <= 240)
            && zones.every((value, index) => index === 0 || Number(value) > Number(zones[index - 1]));
        if (!validZones) {
            missingZones++;
            continue;
        }

        const durationSeconds = Number(activity.duration) > 0 ? Number(activity.duration) * 60 : null;
        const time = telemetry.time;
        const hasUsableTime = Array.isArray(time) && time.length === hr.length
            && time.every(value => Number.isFinite(Number(value)))
            && time.slice(1).every((value, index) => Number(value) > Number(time[index])
                && Number(value) - Number(time[index]) <= 30);
        if (!hasUsableTime) estimatedActivities++;
        if (!hasUsableTime && durationSeconds === null) {
            missingDuration++;
            continue;
        }

        const intervals = hasUsableTime
            ? time.slice(1).map((value, index) => Number(value) - Number(time[index]))
            : [];
        const sortedIntervals = [...intervals].sort((a, b) => a - b);
        const medianInterval = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length / 2)] : 0;
        const sampleDurations = hr.map((_, index) => {
            if (hasUsableTime) {
                if (index < time.length - 1) return intervals[index];
                return durationSeconds !== null
                    ? Math.max(0, durationSeconds - Number(time[index]))
                    : medianInterval;
            }
            return durationSeconds / hr.length;
        });

        if (!totals[activity.type]) totals[activity.type] = [0, 0, 0, 0, 0];
        let activityHasValidSample = false;
        hr.forEach((rawBpm, index) => {
            const bpm = Number(rawBpm);
            if (!Number.isFinite(bpm) || bpm <= 0) return;
            const zoneIndex = bpm <= zones[0] ? 0
                : bpm <= zones[1] ? 1
                : bpm <= zones[2] ? 2
                : bpm <= zones[3] ? 3 : 4;
            const seconds = sampleDurations[index];
            if (Number.isFinite(seconds) && seconds > 0) {
                totals[activity.type][zoneIndex] += seconds;
                activityHasValidSample = true;
            }
        });
        if (activityHasValidSample) usable++;
    }

    if (state.zoneChartInstance) state.zoneChartInstance.destroy();
    const keys = Object.keys(totals);
    if (!keys.length) {
        state.zoneChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar', data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false, plugins: {
                legend: { display: false },
                title: { display: true, text: 'Noch keine auswertbaren Herzfrequenz-Zeitreihen und Zonen', color: '#94a3b8' }
            }}
        });
        if (summary) summary.innerHTML = '';
        if (note) note.textContent = 'Noch keine auswertbaren Herzfrequenz-Zeitreihen.';
        return;
    }

    const palette = ['#38bdf8', '#34d399', '#facc15', '#fb923c', '#f43f5e'];
    const datasets = palette.map((color, index) => ({
        label: 'Z' + (index + 1),
        data: keys.map(key => Number((totals[key][index] / 3600).toFixed(2))),
        backgroundColor: color
    }));
    state.zoneChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: keys.map(key => catalog[key]?.label || key), datasets },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: {
                x: { stacked: true, title: { display: true, text: 'Stunden' }, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
                y: { stacked: true, ticks: { color: '#cbd5e1' }, grid: { display: false } }
            },
            plugins: {
                legend: { labels: { color: '#cbd5e1' } },
                tooltip: { callbacks: { label: context => context.dataset.label + ': ' + context.parsed.x.toFixed(2) + ' h' } }
            }
        }
    });

    if (summary) {
        const rows = keys.map(key => {
            const zoneSeconds = totals[key];
            const totalSeconds = zoneSeconds.reduce((sum, value) => sum + value, 0);
            const duration = seconds => {
                const minutes = Math.round(seconds / 60);
                return Math.floor(minutes / 60) + ' h ' + String(minutes % 60).padStart(2, '0') + ' min';
            };
            return `<div class="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <div class="flex items-center justify-between gap-2"><strong class="text-xs text-white">${catalog[key]?.label || key}</strong><span class="text-[10px] text-slate-400">${duration(totalSeconds)} erfasst</span></div>
                <div class="grid grid-cols-5 gap-1">${zoneSeconds.map((seconds, index) => {
                    const percent = totalSeconds > 0 ? seconds / totalSeconds * 100 : 0;
                    const bounds = state.settings.heartRateZones[key].map(Number);
                    const lower = index === 0 ? null : bounds[index - 1] + 1;
                    const upper = index === 4 ? null : bounds[index];
                    const rangeLabel = lower === null ? `≤ ${upper} bpm`
                        : upper === null ? `> ${bounds[3]} bpm`
                        : `${lower}–${upper} bpm`;
                    return `<div class="min-w-0"><div class="text-[10px] font-semibold text-slate-300">Z${index + 1}</div><div class="text-[9px] text-slate-400 whitespace-nowrap">${rangeLabel}</div><div class="text-xs font-semibold text-white mt-1">${percent.toFixed(0)}%</div><div class="text-[9px] text-slate-500">${duration(seconds)}</div></div>`;
                }).join('')}</div>
            </div>`;
        });
        summary.innerHTML = rows.join('');
    }

    if (note) note.textContent = usable + ' Einheiten ausgewertet · ' + (missingTelemetry + missingZones + missingDuration) + ' nicht auswertbar' + (estimatedActivities ? ' · ' + estimatedActivities + ' mit geschätzter Dauer' : '') + '. Prozentwerte beziehen sich auf erfasste HF-Zeit.';
}

export function renderRaceTimeline(){
    const canvas = document.getElementById('raceTimelineChart'); if(!canvas)return;
    if(state.raceTimelineChartInstance) state.raceTimelineChartInstance.destroy();
    const upcoming = [...state.races].sort((a,b)=>a.date.localeCompare(b.date));
    const today = new Date(); today.setHours(0,0,0,0);
    const labels = ['Heute', ...upcoming.map(r=>`${formatDateDDMMYY(r.date)} ${r.name}`)];
    const last = state.dailyTimeline[state.dailyTimeline.length-1];
    const base = last?.ctl || 0;
    const recent = state.dailyTimeline.slice(-28);
    const meanLoad = recent.length ? recent.reduce((sum,d)=>sum+d.tss,0)/recent.length : 0;
    const forecastCtl = (days) => { let ctl = base; const k = 1 - Math.exp(-1/42); for(let i=0;i<Math.min(days,365);i++) ctl+=(meanLoad-ctl)*k; return Number(ctl.toFixed(1)); };
    const data = [base, ...upcoming.map(r=>{ const days = Math.max(0,Math.round((new Date(r.date+'T00:00:00')-today)/86400000)); return forecastCtl(days); })];
    const priorityColors = { A: '#f43f5e', B: '#f59e0b', C: '#38bdf8', D: '#34d399', E: '#94a3b8' };
    const colors = ['#60a5fa', ...upcoming.map(r=>priorityColors[r.prio] || priorityColors.C)];
    state.raceTimelineChartInstance = new Chart(canvas.getContext('2d'), { type:'line', data:{labels,datasets:[{label:'Fitness-Projektion',data,borderColor:'#60a5fa',backgroundColor:'rgba(96,165,250,.08)',fill:true,tension:.25,pointRadius:5,pointBackgroundColor:colors}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#cbd5e1'}}},scales:{x:{ticks:{color:'#94a3b8',maxRotation:30,minRotation:0},grid:{color:'#1e293b'}},y:{ticks:{color:'#94a3b8'},grid:{color:'#1e293b'}}}}});
}

const activitySeriesMeta = {
    hr: { label: 'Herzfrequenz', unit: 'bpm', color: '#fb7185', min: 30, max: 250 },
    pace: { label: 'Pace', unit: 's/km', color: '#f59e0b', min: 0 },
    swimPace: { label: 'Pace', unit: 's/100 m', color: '#f59e0b', min: 0 },
    speed: { label: 'Geschwindigkeit', unit: 'km/h', color: '#38bdf8', min: 0 },
    power: { label: 'Leistung', unit: 'W', color: '#a78bfa', min: 0 },
    cadence: { label: 'Frequenz', unit: '/min', color: '#fbbf24', min: 0 },
    altitude: { label: 'Höhe', unit: 'm', color: '#34d399' },
    distance: { label: 'Distanz', unit: 'km', color: '#60a5fa', min: 0 }
};

export function getActivityTelemetrySeries(act) {
    const telem = getGarminTelemetry(act) || {};
    const fields = act?.garminFitData?.recordFields || {};
    const aliases = {
        hr: [telem.hr, fields.heart_rate],
        pace: [telem.paceSecondsPerKm, fields.pace_seconds_per_km],
        swimPace: [telem.paceSecondsPer100m, fields.pace_seconds_per_100m],
        speed: [telem.speed, fields.speed, fields.enhanced_speed],
        power: [telem.power, fields.power],
        cadence: [telem.cadence, fields.cadence],
        altitude: [telem.altitude, fields.altitude, fields.enhanced_altitude],
        distance: [telem.distance, fields.distance]
    };
    const result = [];
    for (const [key, sources] of Object.entries(aliases)) {
        const values = sources.find(value => Array.isArray(value) && value.filter(item =>
            item !== null && item !== undefined && item !== '' && Number.isFinite(Number(item))
        ).length >= 2);
        if (!values) continue;
        const meta = activitySeriesMeta[key];
        const valid = values.filter(value => value !== null && value !== undefined && value !== ''
            && Number.isFinite(Number(value)) && (meta.min == null || Number(value) >= meta.min)
            && (meta.max == null || Number(value) <= meta.max));
        if (valid.length < 2) continue;
        result.push({ key, label: meta.label, unit: meta.unit, color: meta.color, values: values.map(value =>
            value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
                || (meta.min != null && Number(value) < meta.min) || (meta.max != null && Number(value) > meta.max)
                ? null : Number(value)
        ) });
    }
    return result;
}

export function setActivityTelemetryMetric(metric) {
    const act = state.selectedActivityForModal;
    if (!act) return;
    state.activityTelemetryMetric = metric;
    renderActivityTelemetryChart(act);
}

export function renderActivityTelemetryChart(act) {
    const canvas = document.getElementById('activityTelemetryChart');
    const panel = document.getElementById('activity-telemetry-panel');
    const controls = document.getElementById('activity-telemetry-switch');
    if (!canvas || !panel) return;
    const series = getActivityTelemetrySeries(act);
    if (state.telemetryChartInstance) {
        state.telemetryChartInstance.destroy();
        state.telemetryChartInstance = null;
    }
    if (!series.length) {
        panel.classList.add('hidden');
        if (controls) controls.innerHTML = '';
        return;
    }
    panel.classList.remove('hidden');
    const preferred = series.some(item => item.key === state.activityTelemetryMetric)
        ? state.activityTelemetryMetric
        : series.some(item => item.key === 'hr') ? 'hr' : series[0].key;
    state.activityTelemetryMetric = preferred;
    if (controls) {
        controls.innerHTML = series.map(item =>
            '<button type="button" class="activity-series-switch' + (item.key === preferred ? ' is-active' : '')
            + '" data-metric="' + item.key + '" aria-pressed="' + (item.key === preferred ? 'true' : 'false') + '">'
            + item.label + '</button>'
        ).join('');
        controls.querySelectorAll('[data-metric]').forEach(button => {
            button.addEventListener('click', () => setActivityTelemetryMetric(button.dataset.metric));
        });
    }
    const selected = series.find(item => item.key === preferred);
    const pointReadout = document.getElementById('activity-telemetry-point');
    if (pointReadout) { pointReadout.hidden = true; pointReadout.textContent = ''; }
    const formatValue = value => (selected.key === 'pace' || selected.key === 'swimPace') && Number.isFinite(Number(value))
        ? Math.floor(Number(value) / 60) + ':' + String(Math.round(Number(value) % 60)).padStart(2, '0')
        : Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 });
    const telem = act?.telemetry || act?.garminTelemetry || {};
    const times = Array.isArray(telem.time) ? telem.time : [];
    const hasElapsedTime = times.length === selected.values.length
        && times.every(value => Number.isFinite(Number(value)))
        && times.slice(1).every((value, index) => Number(value) > Number(times[index]));
    const hasClockLabels = Array.isArray(telem.labels) && telem.labels.length === selected.values.length;
    const labels = hasElapsedTime
        ? times.map(value => String(Math.floor(Number(value) / 60)).padStart(2, '0') + ':' + String(Math.floor(Number(value) % 60)).padStart(2, '0'))
        : hasClockLabels ? telem.labels : selected.values.map((_, index) => String(index + 1));
    const selectedLap = state.activitySelectedLap;
    const highlightedIndexes = hasElapsedTime && selectedLap
        ? times.reduce((indexes, value, index) => {
            const seconds = Number(value);
            if (seconds >= selectedLap.startTimeSeconds && seconds <= selectedLap.endTimeSeconds) indexes.push(index);
            return indexes;
        }, []) : [];
    const highlightRange = highlightedIndexes.length ? [highlightedIndexes[0], highlightedIndexes[highlightedIndexes.length - 1]] : null;
    const status = document.getElementById('activity-hr-series-status');
    if (status) {
        const validCount = selected.values.filter(value => value !== null).length;
        const complete = hasElapsedTime && validCount === selected.values.length;
        const dataStatus = complete ? 'Vollständig' : 'Eingeschränkt';
        const axisNote = hasElapsedTime ? 'Zeit seit Start' : hasClockLabels ? 'Uhrzeit · keine verlässliche Zeitachse' : 'Messpunktindex · keine Zeitstempel';
        status.textContent = 'Datenstatus: ' + dataStatus + ' · ' + validCount.toLocaleString('de-DE') + ' gültige Messpunkte · ' + axisNote;
    }
    state.telemetryChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{
            label: selected.label + (selected.key === 'pace' ? ' (min/km)' : selected.key === 'swimPace' ? ' (min/100 m)' : selected.unit ? ' (' + selected.unit + ')' : ''),
            data: selected.values,
            borderColor: selected.color,
            backgroundColor: selected.color + '22',
            borderWidth: 1.7,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: .18,
            spanGaps: false,
            fill: false
        }] },
        plugins: [{
            id: 'activity-lap-highlight',
            beforeDatasetsDraw(chart) {
                if (!highlightRange || !chart.chartArea || !chart.scales?.x) return;
                const left = chart.scales.x.getPixelForValue(highlightRange[0]);
                const right = chart.scales.x.getPixelForValue(highlightRange[1]);
                const ctx = chart.ctx;
                ctx.save();
                ctx.fillStyle = 'rgba(56,189,248,.13)';
                ctx.fillRect(Math.min(left, right), chart.chartArea.top, Math.max(2, Math.abs(right - left)), chart.chartArea.bottom - chart.chartArea.top);
                ctx.restore();
            }
        }],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: context =>
                    selected.label + ': ' + (context.parsed.y == null ? '—' :
                    Number(context.parsed.y).toLocaleString('de-DE', { maximumFractionDigits: 2 })
                    + (selected.unit ? ' ' + selected.unit : ''))
                } }
            },
            onClick(event, elements, chart) {
                const active = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
                if (!active.length || !pointReadout) return;
                const index = active[0].index;
                const value = selected.values[index];
                if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
                const timeLabel = labels[index] ?? ('Messpunkt ' + (index + 1));
                const shown = formatValue(value) + ((selected.key === 'pace' || selected.key === 'swimPace') ? '' : selected.unit ? ' ' + selected.unit : '');
                pointReadout.textContent = timeLabel + ' · ' + selected.label + ': ' + shown;
                pointReadout.hidden = false;
            },
            scales: {
                x: { title: { display: true, text: hasElapsedTime ? 'Zeit seit Start' : hasClockLabels ? 'Uhrzeit' : 'Messpunkt', color: '#64748b', font: { size: 9 } },
                    grid: { color: 'rgba(100,116,139,.12)' }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 8 } },
                y: { title: { display: true, text: selected.key === 'pace' ? 'min/km' : selected.key === 'swimPace' ? 'min/100 m' : selected.unit, color: '#64748b', font: { size: 9 } },
                    ticks: { callback: value => (selected.key === 'pace' || selected.key === 'swimPace') ? formatValue(value) : value, color: '#94a3b8', font: { size: 9 } },
                    grid: { color: 'rgba(100,116,139,.16)' }, ticks: { color: '#94a3b8', font: { size: 9 } } }
            }
        }
    });
}

export function setTimeframe(tf) {
    state.activeTimeframe = tf;
    state.metricHistoryRange = tf;
    const periodLabel = document.getElementById('analysis-period-label');
    if (periodLabel) periodLabel.textContent = ({ '7d': 'Letzte 7 Tage', '28d': 'Letzte 28 Tage', '3m': 'Letzte 90 Tage', '6m': 'Letzte 180 Tage', '1y': 'Letztes Jahr' })[tf] || 'Individueller Zeitraum';
    ['7d', '28d', '3m', '6m', '1y'].forEach(t => {
        const btn = document.getElementById(`tf-${t}`);
        if (btn) btn.className = t === tf ? 'px-3 py-1.5 rounded-lg bg-sky-600 text-white font-semibold' : 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white';
    });
    document.getElementById('custom-date-box')?.classList.add('hidden');
    renderMainLoadChart(state.dailyTimeline, state.activeTimeframe);
    renderMetricHistory('health');
    renderMetricHistory('training');
    window.kajoRenderTrainingLoadView?.();
}

export function toggleCustomDatePicker() { document.getElementById('custom-date-box')?.classList.toggle('hidden'); }
export function applyCustomDateRange() {
    const from = document.getElementById('date-from')?.value;
    const to = document.getElementById('date-to')?.value;
    if (!from || !to || from > to) return;
    state.metricHistoryRange = 'custom';
    state.activeTimeframe = 'custom';
    const periodLabel = document.getElementById('analysis-period-label');
    if (periodLabel) periodLabel.textContent = 'Individueller Zeitraum';
    ['health', 'training'].forEach(kind => {
        const fromInput = document.getElementById(kind + '-history-from');
        const toInput = document.getElementById(kind + '-history-to');
        if (fromInput) fromInput.value = from;
        if (toInput) toInput.value = to;
    });
    renderMainLoadChart(state.dailyTimeline, 'custom');
    renderMetricHistory('health');
    renderMetricHistory('training');
    window.kajoRenderTrainingLoadView?.();
}

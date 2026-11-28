import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=8';
import { escapeHtml } from './utils.js';

const riverSuggestions = ['Sieg','Moldau – Prag','Inn – Rosenheim','Rhein – Bonn','Agger'];
function isCanoeOnWaterActivity(activity) {
  return ['Kayaking', 'C1', 'C2'].includes(String(activity?.type || ''));
}
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function getTrainingRoutesRaw() {
  if (!Array.isArray(state.settings?.trainingRoutes)) state.settings = { ...(state.settings || {}), trainingRoutes: [] };
  return state.settings.trainingRoutes;
}
export function getTrainingWaters() {
  if (!Array.isArray(state.settings?.trainingWaters)) state.settings = { ...(state.settings || {}), trainingWaters: [] };
  const waters = state.settings.trainingWaters;
  let changed = false;
  getTrainingRoutesRaw().forEach(route => {
    let water = waters.find(item => normalize(item.name) === normalize(route.river));
    if (!water) {
      water = { id: 'water-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6), name: route.river || 'Unbenanntes Gewässer', sections: [] };
      waters.push(water); changed = true;
    }
    if (!Array.isArray(water.sections)) { water.sections = []; changed = true; }
    let section = water.sections.find(item => normalize(item.name) === normalize(route.section));
    if (!section) {
      section = { id: 'section-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6), name: route.section || 'Allgemeiner Abschnitt' };
      water.sections.push(section); changed = true;
    }
    if (route.waterId !== water.id || route.sectionId !== section.id) {
      route.waterId = water.id; route.sectionId = section.id; changed = true;
    }
    if (route.river !== water.name || route.section !== section.name) {
      route.river = water.name; route.section = section.name; changed = true;
    }
  });
  if (changed) {
    state.settings = { ...(state.settings || {}), trainingWaters: waters, trainingRoutes: getTrainingRoutesRaw() };
    saveDataToLocalStorage();
  }
  return waters;
}
export function getTrainingRoutes() { getTrainingWaters(); return getTrainingRoutesRaw(); }
export function getRouteById(id) { return getTrainingRoutes().find(route => String(route.id) === String(id)) || null; }
export function getRouteName(id) { const route = getRouteById(id); return route ? [route.name, route.section, route.river].filter(Boolean).join(' · ') : ''; }
export function getSectionById(sectionId) {
  for (const water of getTrainingWaters()) {
    const section = (water.sections || []).find(item => String(item.id) === String(sectionId));
    if (section) return { water, section };
  }
  return null;
}
export function getActivityRouteAssignments(activity) {
  if (!activity) return [];
  if (Array.isArray(activity.routeAssignments)) return activity.routeAssignments
    .filter(item => getRouteById(item.routeId))
    .map(item => ({ routeId: String(item.routeId), runs: Math.max(1, Math.floor(Number(item.runs) || 1)), source: item.source || 'manual' }));
  if (activity.routeId && getRouteById(activity.routeId)) return [{ routeId: String(activity.routeId), runs: 1, source: activity.routeAssignmentSource || 'legacy' }];
  if (activity.routeAssignmentSource === 'manual-none') return [];
  const name = normalize(activity.name);
  if (!name) return [];
  const candidates = [];
  getTrainingRoutesRaw().forEach(route => {
    const terms = [route.name, route.section, ...(Array.isArray(route.aliases) ? route.aliases : [])]
      .map(normalize).filter(term => term.length >= 3);
    terms.forEach(term => { if ((` ${name} `).includes(` ${term} `)) candidates.push({ id: String(route.id), length: term.length }); });
  });
  candidates.sort((a,b) => b.length-a.length);
  if (!candidates.length || (candidates[1] && candidates[0].length === candidates[1].length && candidates[0].id !== candidates[1].id)) return [];
  activity.routeAssignments = [{ routeId: candidates[0].id, runs: 1, source: 'auto' }];
  activity.routeAssignmentSource = 'auto';
  saveDataToLocalStorage();
  return activity.routeAssignments;
}
export function countTrainingOnRouteBefore(routeId, date) {
  if (!routeId) return { sessions: 0, runs: 0 };
  const matching = (state.rawActivities || []).filter(activity => isCanoeOnWaterActivity(activity) && activity.category !== 'race'
    && !/wettkampf|competition|race|rennen/i.test(String(activity.name || ''))
    && String(activity.date || '') < String(date || '9999-12-31')
    && getActivityRouteAssignments(activity).some(item => String(item.routeId) === String(routeId)));
  const runs = matching.reduce((sum, activity) => sum + getActivityRouteAssignments(activity)
    .filter(item => String(item.routeId) === String(routeId)).reduce((n,item) => n + item.runs, 0), 0);
  return { sessions: matching.length, runs };
}
export function countTrainingOnSectionBefore(routeId, date) {
  const route = getRouteById(routeId);
  if (!route) return { sessions: 0, runs: 0 };
  const sectionId = String(route.sectionId || '');
  const matching = (state.rawActivities || []).filter(activity => {
    if (!isCanoeOnWaterActivity(activity)) return false;
    if (activity.category === 'race' || /wettkampf|competition|race|rennen/i.test(String(activity.name || ''))) return false;
    if (String(activity.date || '') >= String(date || '9999-12-31')) return false;
    return getActivityRouteAssignments(activity).some(assignment => {
      const assignedRoute = getRouteById(assignment.routeId);
      return assignedRoute && (sectionId ? String(assignedRoute.sectionId) === sectionId
        : normalize(assignedRoute.river) === normalize(route.river) && normalize(assignedRoute.section) === normalize(route.section));
    });
  });
  const runs = matching.reduce((sum, activity) => sum + getActivityRouteAssignments(activity)
    .filter(assignment => {
      const assignedRoute = getRouteById(assignment.routeId);
      return assignedRoute && (sectionId ? String(assignedRoute.sectionId) === sectionId
        : normalize(assignedRoute.river) === normalize(route.river) && normalize(assignedRoute.section) === normalize(route.section));
    }).reduce((total, assignment) => total + assignment.runs, 0), 0);
  return { sessions: matching.length, runs };
}
export function getWaterConditionSummaryBefore(routeId, date) {
  const route = getRouteById(routeId);
  if (!route) return { measuredSessions: 0, records: [] };
  const sectionId = String(route.sectionId || '');
  const records = (state.rawActivities || []).filter(activity => {
    if (!isCanoeOnWaterActivity(activity)) return false;
    if (activity.category === 'race' || /wettkampf|competition|race|rennen/i.test(String(activity.name || ''))) return false;
    if (String(activity.date || '') >= String(date || '9999-12-31')) return false;
    const water = activity.waterConditions;
    if (!water || (water.level == null && water.discharge == null)) return false;
    return getActivityRouteAssignments(activity).some(assignment => {
      const assignedRoute = getRouteById(assignment.routeId);
      return assignedRoute && (sectionId ? String(assignedRoute.sectionId) === sectionId
        : normalize(assignedRoute.river) === normalize(route.river) && normalize(assignedRoute.section) === normalize(route.section));
    });
  }).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
  return { measuredSessions: records.length, records: records.slice(0, 5).map(activity => ({
    date: activity.date, name: activity.name || 'Training',
    level: activity.waterConditions.level ?? null,
    levelUnit: activity.waterConditions.levelUnit || 'cm',
    discharge: activity.waterConditions.discharge ?? null,
    note: activity.waterConditions.note || ''
  })) };
}

export function setActivityRouteAssignment(routeId, enabled) {
  const activity = state.selectedActivityForModal;
  if (!activity || !isCanoeOnWaterActivity(activity) || !getRouteById(routeId)) return;
  let assignments = getActivityRouteAssignments(activity);
  if (enabled) {
    if (!assignments.some(item => item.routeId === String(routeId))) assignments.push({ routeId: String(routeId), runs: 1, source: 'manual' });
  } else assignments = assignments.filter(item => item.routeId !== String(routeId));
  activity.routeAssignments = assignments;
  delete activity.routeId;
  activity.routeAssignmentSource = 'manual';
  saveDataToLocalStorage();
  renderActivityRouteAssignments(activity);
  refreshAll();
}
export function setActivityRouteRuns(routeId, value) {
  const activity = state.selectedActivityForModal;
  if (!activity || !isCanoeOnWaterActivity(activity)) return;
  const assignments = getActivityRouteAssignments(activity);
  const item = assignments.find(entry => entry.routeId === String(routeId));
  if (!item) return;
  item.runs = Math.max(1, Math.min(100, Math.floor(Number(value) || 1)));
  item.source = 'manual';
  activity.routeAssignments = assignments;
  saveDataToLocalStorage();
  refreshAll();
}
export function renderActivityRouteAssignments(activity) {
  const container = document.getElementById('activity-route-assignments');
  if (!container) return;
  if (!isCanoeOnWaterActivity(activity)) { container.innerHTML = '<p class="text-xs text-slate-500">Streckenabschnitte sind nur für K1, C1 und C2 verfügbar.</p>'; return; }
  const assignments = getActivityRouteAssignments(activity);
  const routes = getTrainingRoutes();
  container.innerHTML = routes.length ? routes.map(route => {
    const assigned = assignments.find(item => item.routeId === String(route.id));
    const id = escapeHtml(String(route.id));
    return `<div class="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 py-2 border-b border-slate-800 last:border-0">
      <label class="flex items-start gap-2 min-w-0 text-xs text-slate-200"><input type="checkbox" class="mt-0.5 accent-cyan-500" ${assigned ? 'checked' : ''} onchange="setActivityRouteAssignment('${id}',this.checked)"><span class="min-w-0">${escapeHtml([route.name,route.section,route.river].filter(Boolean).join(' · '))}</span></label>
      <label class="text-[10px] text-slate-500">Durchfahrten<input type="number" min="1" max="100" step="1" value="${assigned ? assigned.runs : 1}" ${assigned ? '' : 'disabled'} onchange="setActivityRouteRuns('${id}',this.value)" class="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white disabled:opacity-30"></label>
    </div>`;
  }).join('') : '<p class="text-xs text-slate-500">Lege zuerst im Bereich Streckenverwaltung deine Strecken an.</p>';
  const note = document.getElementById('activity-route-assignment-note');
  if (note) note.textContent = assignments.length ? assignments.map(item => {
    const route = getRouteById(item.routeId); return `${route?.name || 'Strecke'}: ${item.runs} Durchfahrten`;
  }).join(' · ') : 'Noch keine Strecke zugeordnet.';
}
export function populateActivityRouteSelect(activity) { if (isCanoeOnWaterActivity(activity)) renderActivityRouteAssignments(activity); }
export function setActivityRoute(value) {
  const activity = state.selectedActivityForModal;
  if (!activity || !isCanoeOnWaterActivity(activity)) return;
  activity.routeAssignments = value && getRouteById(value) ? [{ routeId: String(value), runs: 1, source: 'manual' }] : [];
  delete activity.routeId;
  activity.routeAssignmentSource = 'manual';
  saveDataToLocalStorage();
  renderActivityRouteAssignments(activity);
  refreshAll();
}
export function populateRaceRouteSelect() {
  const select = document.getElementById('race-route');
  if (!select) return;
  const current = select.value;
  const routes = getTrainingRoutes().filter(route => route.type === 'competition' || route.type === 'both');
  select.innerHTML = '<option value="">Keine Wettkampfstrecke zugeordnet</option>' + routes.map(route =>
    '<option value="'+escapeHtml(String(route.id))+'">'+escapeHtml([route.name,route.section,route.river].filter(Boolean).join(' · '))+'</option>'
  ).join('');
  if (routes.some(route => String(route.id) === current)) select.value = current;
}
export function renderWatersManager() {
  const container = document.getElementById('training-waters-list');
  if (!container) return;
  const waters = getTrainingWaters();
  container.innerHTML = waters.length ? waters.map(water => {
    const sections = (water.sections || []).map(section => {
      const used = getTrainingRoutesRaw().filter(route => String(route.sectionId || '') === String(section.id)).length;
      return `<div class="flex items-center justify-between gap-2 py-2 border-t border-slate-800"><div class="min-w-0"><span class="text-xs text-slate-200">${escapeHtml(section.name)}</span><span class="text-[10px] text-slate-500 ml-2">${used} Strecken</span></div><div class="flex gap-2 shrink-0"><button type="button" onclick="renameTrainingSection('${escapeHtml(section.id)}')" class="text-[10px] text-cyan-300">Umbenennen</button><button type="button" onclick="deleteTrainingSection('${escapeHtml(section.id)}')" class="text-[10px] text-rose-400">Löschen</button></div></div>`;
    }).join('');
    return `<article class="rounded-xl border border-slate-800 bg-slate-950 p-3"><div class="flex items-center justify-between gap-2"><strong class="text-sm text-white">${escapeHtml(water.name)}</strong><div class="flex gap-2"><button type="button" onclick="renameTrainingWater('${escapeHtml(water.id)}')" class="text-[10px] text-cyan-300">Umbenennen</button><button type="button" onclick="deleteTrainingWater('${escapeHtml(water.id)}')" class="text-[10px] text-rose-400">Löschen</button></div></div>${sections || '<p class="text-[10px] text-slate-500 mt-2">Noch keine Abschnitte angelegt.</p>'}</article>`;
  }).join('') : '<p class="text-xs text-slate-500">Noch keine Flüsse oder Abschnitte angelegt.</p>';
  populateRouteSectionSelect();
}
export function populateRouteSectionSelect() {
  const select = document.getElementById('route-section-id');
  if (!select) return;
  const current = select.value;
  const options = getTrainingWaters().flatMap(water => (water.sections || []).map(section =>
    ({ id: section.id, label: water.name + ' · ' + section.name })));
  select.innerHTML = '<option value="">Flussabschnitt auswählen</option>' + options.map(item =>
    '<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.label)+'</option>').join('');
  if (options.some(item => String(item.id) === current)) select.value = current;
}
export function saveTrainingWaterSection() {
  const riverName = document.getElementById('route-water-name')?.value.trim();
  const sectionName = document.getElementById('route-section-name')?.value.trim();
  if (!riverName || !sectionName) { alert('Bitte gib Fluss und Flussabschnitt an.'); return; }
  const waters = getTrainingWaters();
  let water = waters.find(item => normalize(item.name) === normalize(riverName));
  if (!water) { water = { id: 'water-' + Date.now().toString(36), name: riverName, sections: [] }; waters.push(water); }
  if (!Array.isArray(water.sections)) water.sections = [];
  if (water.sections.some(item => normalize(item.name) === normalize(sectionName))) {
    alert('Dieser Flussabschnitt ist bereits angelegt.'); return;
  }
  water.sections.push({ id: 'section-' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), name: sectionName });
  state.settings = { ...(state.settings || {}), trainingWaters: waters };
  saveDataToLocalStorage();
  document.getElementById('route-water-name').value = '';
  document.getElementById('route-section-name').value = '';
  renderRoutesView();
}
export function renameTrainingWater(id) {
  const water = getTrainingWaters().find(item => String(item.id) === String(id));
  if (!water) return;
  const name = prompt('Neuer Flussname:', water.name);
  if (!name?.trim()) return;
  water.name = name.trim();
  getTrainingRoutesRaw().filter(route => String(route.waterId) === String(id)).forEach(route => { route.river = water.name; });
  saveDataToLocalStorage(); renderRoutesView();
}
export function deleteTrainingWater(id) {
  const water = getTrainingWaters().find(item => String(item.id) === String(id));
  if (!water) return;
  const used = getTrainingRoutesRaw().some(route => String(route.waterId) === String(id));
  if (used || (water.sections || []).length) { alert('Dieser Fluss enthält noch Abschnitte oder zugeordnete Strecken. Lösche zuerst die Strecken und Abschnitte.'); return; }
  if (!confirm('Fluss wirklich löschen?')) return;
  state.settings.trainingWaters = getTrainingWaters().filter(item => String(item.id) !== String(id));
  saveDataToLocalStorage(); renderRoutesView();
}
export function renameTrainingSection(id) {
  const found = getSectionById(id);
  if (!found) return;
  const name = prompt('Neuer Name für den Flussabschnitt:', found.section.name);
  if (!name?.trim()) return;
  found.section.name = name.trim();
  getTrainingRoutesRaw().filter(route => String(route.sectionId) === String(id)).forEach(route => { route.section = found.section.name; });
  saveDataToLocalStorage(); renderRoutesView();
}
export function deleteTrainingSection(id) {
  const found = getSectionById(id);
  if (!found) return;
  const used = getTrainingRoutesRaw().some(route => String(route.sectionId) === String(id));
  if (used) { alert('Dieser Abschnitt wird noch von Strecken verwendet. Ordne diese Strecken zuerst einem anderen Abschnitt zu oder lösche sie.'); return; }
  if (!confirm('Flussabschnitt wirklich löschen?')) return;
  found.water.sections = found.water.sections.filter(item => String(item.id) !== String(id));
  saveDataToLocalStorage(); renderRoutesView();
}
let trainingRouteFilter = 'all';

export function setTrainingRouteFilter(filter) {
  trainingRouteFilter = ['all','training','competition'].includes(filter) ? filter : 'all';
  renderRoutesView();
}

export function toggleTrainingRouteForm(show = true) {
  const panel = document.getElementById('route-form-panel');
  if (!panel) return;
  const shouldShow = typeof show === 'boolean' ? show : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !shouldShow);
  if (shouldShow) {
    panel.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('route-name')?.focus({ preventScroll: true });
  }
}

export function toggleTrainingWatersManager() {
  const panel = document.getElementById('route-water-manager');
  const button = document.querySelector('.kajo-route-manager-toggle');
  if (!panel) return;
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  button?.setAttribute('aria-expanded', String(opening));
  button?.setAttribute('aria-label', opening ? 'Gewässer verwalten schließen' : 'Gewässer verwalten öffnen');
  button?.setAttribute('title', opening ? 'Gewässer verwalten schließen' : 'Gewässer verwalten öffnen');
  button?.classList.toggle('is-open', opening);
}

export function renderRoutesView() {
  renderWatersManager();
  const list = document.getElementById('training-routes-list');
  if (!list) return;
  const routes = getTrainingRoutes();
  const waters = getTrainingWaters();
  const sections = waters.reduce((sum, water) => sum + (water.sections || []).length, 0);
  const summary = {
    waters: document.getElementById('route-summary-waters'),
    sections: document.getElementById('route-summary-sections'),
    routes: document.getElementById('route-summary-routes')
  };
  if (summary.waters) summary.waters.textContent = String(waters.length);
  if (summary.sections) summary.sections.textContent = String(sections);
  if (summary.routes) summary.routes.textContent = String(routes.length);

  document.querySelectorAll('[data-route-filter]').forEach(button => {
    const active = button.dataset.routeFilter === trainingRouteFilter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const filtered = routes.filter(route => trainingRouteFilter === 'all'
    || (trainingRouteFilter === 'training' && (route.type === 'training' || route.type === 'both'))
    || (trainingRouteFilter === 'competition' && (route.type === 'competition' || route.type === 'both')));
  const countLabel = document.getElementById('route-filter-count');
  if (countLabel) countLabel.textContent = filtered.length + (filtered.length === 1 ? ' Eintrag' : ' Einträge');

  if (!filtered.length) {
    const message = routes.length
      ? 'Für diesen Filter sind noch keine Strecken angelegt.'
      : 'Noch keine Strecken angelegt. Füge eine Strecke hinzu oder lege zuerst ein Gewässer mit Flussabschnitt an.';
    list.innerHTML = '<p class="kajo-route-empty">' + message + '</p>';
  } else {
    const grouped = waters.map(water => ({
      water,
      sections: (water.sections || []).map(section => ({
        section,
        routes: filtered.filter(route => String(route.sectionId || '') === String(section.id)
          || (!route.sectionId && normalize(route.river) === normalize(water.name) && normalize(route.section) === normalize(section.name)))
      })).filter(group => group.routes.length)
    })).filter(group => group.sections.length);

    list.innerHTML = grouped.map(group => '<section class="kajo-route-water-group">'
      + '<div class="kajo-route-water-heading"><i data-lucide="waves"></i><h3>' + escapeHtml(group.water.name) + '</h3></div>'
      + group.sections.map(sectionGroup => '<div class="kajo-route-section-group"><div class="kajo-route-section-heading"><i data-lucide="map-pin"></i><span>' + escapeHtml(sectionGroup.section.name) + '</span></div>'
        + '<div class="kajo-route-items">' + sectionGroup.routes.map(route => {
          const count = (state.rawActivities || []).filter(activity => getActivityRouteAssignments(activity).some(item => item.routeId === String(route.id))).length;
          const id = String(route.id).replace(/'/g, '');
          const typeLabel = route.type === 'both' ? 'Training & Wettkampf' : route.type === 'competition' ? 'Wettkampf' : 'Training';
          const typeClass = route.type === 'competition' ? 'is-competition' : route.type === 'both' ? 'is-both' : 'is-training';
          const details = (route.aliases?.length || route.notes) ? '<details class="kajo-route-details"><summary>Details</summary>'
            + (route.aliases?.length ? '<p><strong>Suchbegriffe:</strong> ' + escapeHtml(route.aliases.join(', ')) + '</p>' : '')
            + (route.notes ? '<p>' + escapeHtml(route.notes) + '</p>' : '') + '</details>' : '';
          return '<article class="kajo-route-item"><div class="kajo-route-item-main"><div class="kajo-route-item-title"><strong>' + escapeHtml(route.name) + '</strong><span class="kajo-route-type ' + typeClass + '">' + typeLabel + '</span></div><span class="kajo-route-usage">' + count + (count === 1 ? ' Aktivität' : ' Aktivitäten') + '</span>' + details + '</div>'
            + '<div class="kajo-route-item-actions"><button type="button" onclick="editTrainingRoute(\'' + id + '\')" aria-label="Strecke bearbeiten"><i data-lucide="pencil"></i></button><button type="button" onclick="deleteTrainingRoute(\'' + id + '\')" aria-label="Strecke löschen"><i data-lucide="trash-2"></i></button></div></article>';
        }).join('') + '</div></div>').join('') + '</section>').join('');
    try { globalThis.lucide?.createIcons?.(); } catch (error) { console.warn('Strecken-Icons konnten nicht initialisiert werden:', error); }
  }
  populateRaceRouteSelect();
}
export function editTrainingRoute(id) {
  const route = getRouteById(id); if (!route) return;
  document.getElementById('route-edit-id').value = route.id;
  document.getElementById('route-name').value = route.name || '';
  populateRouteSectionSelect();
  document.getElementById('route-section-id').value = route.sectionId || '';
  document.getElementById('route-type').value = route.type || 'training';
  document.getElementById('route-aliases').value = (route.aliases || []).join(', ');
  document.getElementById('route-notes').value = route.notes || '';
  document.getElementById('route-form-title').textContent = 'Strecke bearbeiten';
  toggleTrainingRouteForm(true);
  document.getElementById('route-cancel-edit').classList.remove('hidden');
  document.getElementById('route-name').focus();
}
export function resetTrainingRouteForm() {
  ['route-edit-id','route-name','route-aliases','route-notes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const section=document.getElementById('route-section-id'); if(section) section.value='';
  const type=document.getElementById('route-type'); if(type) type.value='training';
  const title=document.getElementById('route-form-title'); if(title) title.textContent='Neue Strecke anlegen';
  document.getElementById('route-cancel-edit')?.classList.add('hidden');
  toggleTrainingRouteForm(false);
}
export function saveTrainingRoute() {
  const name = document.getElementById('route-name')?.value.trim();
  const sectionId = document.getElementById('route-section-id')?.value;
  const selected = getSectionById(sectionId);
  const type = document.getElementById('route-type')?.value || 'training';
  if (!name || !selected) { alert('Bitte gib einen Streckennamen an und wähle einen Flussabschnitt aus.'); return; }
  const id = document.getElementById('route-edit-id')?.value;
  const routes = getTrainingRoutesRaw();
  const record = { id: id || 'route-' + Date.now().toString(36), name, river: selected.water.name, section: selected.section.name,
    waterId: selected.water.id, sectionId: selected.section.id, type,
    aliases: (document.getElementById('route-aliases')?.value || '').split(',').map(v=>v.trim()).filter(Boolean),
    notes: document.getElementById('route-notes')?.value.trim() || '' };
  const index = routes.findIndex(route => String(route.id) === String(id));
  if (index >= 0) routes[index] = record; else routes.push(record);
  state.settings = { ...(state.settings || {}), trainingRoutes: routes };
  saveDataToLocalStorage(); resetTrainingRouteForm(); renderRoutesView(); refreshAll();
}
export function deleteTrainingRoute(id) {
  const route = getRouteById(id); if (!route) return;
  const used = (state.rawActivities || []).some(activity => getActivityRouteAssignments(activity).some(item => item.routeId === String(id)))
    || (state.races || []).some(race => String(race.routeId || '') === String(id));
  if (used && !confirm('Diese Strecke ist bereits Aktivitäten oder Wettkämpfen zugeordnet. Wirklich löschen? Die Zuordnungen werden dabei entfernt.')) return;
  if (!used && !confirm('Strecke wirklich löschen?')) return;
  state.settings.trainingRoutes = getTrainingRoutesRaw().filter(item => String(item.id) !== String(id));
  (state.rawActivities || []).forEach(activity => { if (Array.isArray(activity.routeAssignments)) activity.routeAssignments = activity.routeAssignments.filter(item => String(item.routeId) !== String(id)); if (String(activity.routeId || '') === String(id)) { delete activity.routeId; delete activity.routeAssignmentSource; } });
  (state.races || []).forEach(race => { if (String(race.routeId || '') === String(id)) delete race.routeId; });
  saveDataToLocalStorage(); renderRoutesView(); refreshAll();
}

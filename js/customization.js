import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js';

const NAV_ITEMS = [
  { id: 'today', label: 'Heute' },
  { id: 'calendar', label: 'Plan' },
  { id: 'training', label: 'Training' },
  { id: 'analysis', label: 'Analyse' },
  { id: 'more', label: 'Ich' }
];
const DASHBOARD_ITEMS = [
  { id: 'status', label: 'Tagesstatus', selector: '#view-dashboard > .kajo-home-status' },
  { id: 'training', label: 'Training heute', selector: '#home-daily-overview' },
  { id: 'recommendation', label: 'Trainingsempfehlung', selector: '.kajo-home-recommendation, .kajo-home-recommendation-meta' },
  { id: 'wearables', label: 'Gesundheit & Check-in', selector: '#view-dashboard .kajo-home-wearables' },
  { id: 'wellbeing', label: 'Befinden – Wochenmuster', selector: '#view-dashboard .kajo-wellbeing-history' },
  { id: 'race', label: 'Nächster Wettkampf', selector: '#home-next-race-card' },
  { id: 'week', label: 'Trainingswoche', selector: '#home-training-week' }
];
const DEFAULT_NAV_ORDER = NAV_ITEMS.map(item => item.id);

function preferences() {
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  if (!state.settings.dashboardVisibility || typeof state.settings.dashboardVisibility !== 'object') state.settings.dashboardVisibility = {};
  if (!Array.isArray(state.settings.primaryNavOrder)) state.settings.primaryNavOrder = DEFAULT_NAV_ORDER.slice();
  const valid = state.settings.primaryNavOrder.filter((id, index, list) => DEFAULT_NAV_ORDER.includes(id) && list.indexOf(id) === index);
  state.settings.primaryNavOrder = [...valid, ...DEFAULT_NAV_ORDER.filter(id => !valid.includes(id))];
  return state.settings;
}
function persist() {
  const saved = saveDataToLocalStorage();
  const status = document.getElementById('kajo-customization-status');
  if (status) status.textContent = saved ? 'Deine Anpassungen wurden gespeichert.' : 'Die Anpassungen konnten nicht gespeichert werden. Bitte prüfe deine Verbindung und deinen Speicher.';
  return saved;
}
function applyDashboardVisibility() {
  const settings = preferences();
  DASHBOARD_ITEMS.forEach(item => {
    const visible = settings.dashboardVisibility[item.id] !== false;
    document.querySelectorAll(item.selector).forEach(element => {
      element.classList.toggle('hidden', !visible);
      element.setAttribute('aria-hidden', String(!visible));
    });
  });
}
function applyPrimaryNavOrder() {
  const order = preferences().primaryNavOrder;
  ['app-navigation .kajo-primary-nav', '.kajo-mobile-nav'].forEach(selector => {
    const nav = document.querySelector(selector);
    if (!nav) return;
    order.forEach(id => {
      const button = nav.querySelector('#' + (selector.includes('mobile') ? 'mobile-nav-' : 'nav-') + id);
      if (button) nav.appendChild(button);
    });
  });
}
function renderDashboardOptions() {
  const root = document.getElementById('kajo-dashboard-customization-list');
  if (!root) return;
  const settings = preferences();
  root.innerHTML = DASHBOARD_ITEMS.map(item => {
    const checked = settings.dashboardVisibility[item.id] !== false;
    return '<label class="flex items-center justify-between gap-3 border-b border-slate-800 py-3 text-sm text-slate-200"><span>' + item.label + '</span><input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleDashboardSection(\'' + item.id + '\', this.checked)" class="h-4 w-4 accent-cyan-500"></label>';
  }).join('');
}
function renderNavigationOptions() {
  const root = document.getElementById('kajo-nav-customization-list');
  if (!root) return;
  const order = preferences().primaryNavOrder;
  root.innerHTML = order.map((id, index) => {
    const item = NAV_ITEMS.find(entry => entry.id === id);
    return '<div class="flex items-center justify-between gap-3 border-b border-slate-800 py-3"><span class="text-sm text-slate-200">' + item.label + '</span><span class="flex items-center gap-2"><span class="text-xs text-slate-500">' + (index + 1) + '</span><button type="button" onclick="movePrimaryNav(\'' + id + '\', -1)" ' + (index === 0 ? 'disabled' : '') + ' aria-label="' + item.label + ' nach oben" class="kajo-settings-secondary px-3 py-1">↑</button><button type="button" onclick="movePrimaryNav(\'' + id + '\', 1)" ' + (index === order.length - 1 ? 'disabled' : '') + ' aria-label="' + item.label + ' nach unten" class="kajo-settings-secondary px-3 py-1">↓</button></span></div>';
  }).join('');
}
export function initializeCustomization() {
  preferences();
  applyDashboardVisibility();
  applyPrimaryNavOrder();
  renderDashboardOptions();
  renderNavigationOptions();
}
export function toggleDashboardSection(id, visible) {
  if (!DASHBOARD_ITEMS.some(item => item.id === id)) return;
  preferences().dashboardVisibility[id] = visible === true;
  applyDashboardVisibility();
  persist();
  renderDashboardOptions();
}
export function movePrimaryNav(id, direction) {
  const settings = preferences();
  const index = settings.primaryNavOrder.indexOf(id);
  const next = index + Number(direction);
  if (index < 0 || !Number.isInteger(next) || next < 0 || next >= settings.primaryNavOrder.length) return;
  [settings.primaryNavOrder[index], settings.primaryNavOrder[next]] = [settings.primaryNavOrder[next], settings.primaryNavOrder[index]];
  applyPrimaryNavOrder();
  renderNavigationOptions();
  persist();
}
export function resetCustomization() {
  const settings = preferences();
  settings.dashboardVisibility = {};
  settings.primaryNavOrder = DEFAULT_NAV_ORDER.slice();
  applyDashboardVisibility();
  applyPrimaryNavOrder();
  renderDashboardOptions();
  renderNavigationOptions();
  persist();
}

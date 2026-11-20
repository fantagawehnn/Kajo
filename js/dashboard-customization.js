import { loadPersonalPreferences, savePersonalPreferences } from './personal-preferences.js?v=1';

export const DASHBOARD_SECTIONS = [
    { id: 'status', label: 'Dein Status', elementId: 'home-status-section' },
    { id: 'daily', label: 'Training heute', elementId: 'home-daily-overview' },
    { id: 'recommendation', label: 'Trainingsempfehlung', elementId: 'home-training-recommendation-card' },
    { id: 'wearables', label: 'Gesundheit & Self-Monitoring', elementId: 'home-wearables-section' },
    { id: 'race', label: 'Nächster Wettkampf', elementId: 'home-next-race-card' },
    { id: 'week', label: 'Trainingswoche', elementId: 'home-training-week' }
];

export function normalizeDashboardLayout(value) {
    const defaults = DASHBOARD_SECTIONS.map(section => section.id);
    const candidate = Array.isArray(value?.order) ? value.order : [];
    const order = [...new Set(candidate.filter(id => defaults.includes(id))), ...defaults.filter(id => !candidate.includes(id))];
    const visible = {};
    for (const id of defaults) visible[id] = value?.visible?.[id] !== false;
    return { order, visible };
}

function readLayout() {
    const preferences = loadPersonalPreferences();
    return normalizeDashboardLayout(preferences.dashboard);
}

function writeLayout(layout) {
    const preferences = loadPersonalPreferences();
    preferences.dashboard = normalizeDashboardLayout(layout);
    savePersonalPreferences(preferences);
    return preferences.dashboard;
}

export function applyDashboardCustomization() {
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    const layout = readLayout();
    const byId = new Map(DASHBOARD_SECTIONS.map(section => [section.id, section]));
    const anchor = document.getElementById('kpi-cards-grid');
    layout.order.forEach((id, index) => {
        const section = byId.get(id);
        const element = section && document.getElementById(section.elementId);
        if (!element) return;
        element.classList.toggle('hidden', !layout.visible[id]);
        element.dataset.dashboardOrder = String(index);
        if (anchor && element.parentElement === root) root.insertBefore(element, anchor);
    });
}

function renderEditor() {
    const list = document.getElementById('dashboard-customization-list');
    if (!list) return;
    const layout = readLayout();
    const labels = new Map(DASHBOARD_SECTIONS.map(section => [section.id, section.label]));
    list.innerHTML = layout.order.map((id, index) => {
        const checked = layout.visible[id] ? 'checked' : '';
        const label = labels.get(id);
        return `<li class="kajo-dashboard-custom-row" data-dashboard-custom-row="${id}">
            <label><input type="checkbox" data-dashboard-visible="${id}" ${checked}><span>${label}</span></label>
            <span class="kajo-dashboard-custom-actions">
                <button type="button" data-dashboard-move="up" data-dashboard-id="${id}" aria-label="${label} nach oben verschieben" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" data-dashboard-move="down" data-dashboard-id="${id}" aria-label="${label} nach unten verschieben" ${index === layout.order.length - 1 ? 'disabled' : ''}>↓</button>
            </span>
        </li>`;
    }).join('');
}

export function openDashboardCustomization() {
    renderEditor();
    const modal = document.getElementById('dashboard-customization-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

export function closeDashboardCustomization() {
    const modal = document.getElementById('dashboard-customization-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}

export function saveDashboardCustomization() {
    const list = document.getElementById('dashboard-customization-list');
    if (!list) return;
    const order = [...list.querySelectorAll('[data-dashboard-custom-row]')].map(row => row.dataset.dashboardCustomRow);
    const visible = {};
    for (const section of DASHBOARD_SECTIONS) {
        const checkbox = list.querySelector(`[data-dashboard-visible="${section.id}"]`);
        visible[section.id] = checkbox ? checkbox.checked : true;
    }
    writeLayout({ order, visible });
    applyDashboardCustomization();
    closeDashboardCustomization();
}

export function resetDashboardCustomization() {
    writeLayout({});
    applyDashboardCustomization();
    renderEditor();
}

export function initializeDashboardCustomization() {
    const list = document.getElementById('dashboard-customization-list');
    if (!list || list.dataset.initialized === 'true') return;
    list.dataset.initialized = 'true';
    list.addEventListener('click', event => {
        const button = event.target.closest('[data-dashboard-move]');
        if (!button || button.disabled) return;
        const row = button.closest('[data-dashboard-custom-row]');
        const sibling = button.dataset.dashboardMove === 'up' ? row?.previousElementSibling : row?.nextElementSibling;
        if (!row || !sibling) return;
        if (button.dataset.dashboardMove === 'up') list.insertBefore(row, sibling);
        else list.insertBefore(sibling, row);
        renderEditor();
    });
}

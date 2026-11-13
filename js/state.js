/* ============================================================
 * state.js – Zentraler Anwendungszustand
 *
 * Im Original waren dies lose `let`-Variablen im globalen Scope.
 * ES-Module dürfen importierte Variablen nicht neu zuweisen
 * (`rawActivities = rawActivities.filter(...)` geht nur im eigenen Modul),
 * deshalb liegen alle veränderlichen Werte als Eigenschaften in EINEM
 * gemeinsamen Objekt: `state.rawActivities`, `state.races`, ...
 *
 * Die Startwerte werden in storage.js (loadStateFromStorage) aus dem
 * localStorage gelesen – die Speicherschlüssel sind unverändert.
 * ============================================================ */

export const state = {
    // --- Persistente Daten (werden in storage.js gespeichert/geladen) ---
    rawActivities: [],
    plannedActivities: [],
    dailyCheckins: {},
    healthLogs: {},
    races: [],
    strengthLogs: [],
    strengthPBs: [],
    supplements: [],
    profile: {},
    settings: { sports: {}, categories: {}, heartRateZones: {} },

    // --- Berechnete Daten (nicht gespeichert) ---
    dailyTimeline: [],

    // --- Chart.js-Instanzen (zum Zerstören vor dem Neuzeichnen) ---
    mainChartInstance: null,
    pieChartInstance: null,
    canoeVolumeChartInstance: null,
    telemetryChartInstance: null,
    raceTimelineChartInstance: null,
    zoneChartInstance: null,

    // --- Ansichts-Zustand ---
    selectedDashboardDate: null,
    activeTimeframe: '3m',
    activeCalendarFormat: 'week',
    calendarDisplayMode: null,
    currentCalendarDate: new Date(),
    selectedActivityForModal: null
};

/* ------------------------------------------------------------
 * Refresh-Hook
 * Viele Module müssen nach einer Datenänderung die komplette Oberfläche
 * neu aufbauen (im Original: initEngine()). Damit diese Module main.js
 * nicht importieren müssen (→ zirkuläre Abhängigkeit), registriert
 * main.js seine initEngine-Funktion hier einmalig.
 * ------------------------------------------------------------ */
let refreshHandler = null;

export function setRefreshHandler(fn) {
    refreshHandler = fn;
}

export function refreshAll() {
    if (typeof refreshHandler !== 'function') {
        console.error('refreshAll(): kein Refresh-Handler registriert (siehe main.js).');
        return;
    }
    refreshHandler();
}

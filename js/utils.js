import { state } from './state.js';
/* ============================================================
 * utils.js – Allgemeine Konstanten und Hilfsfunktionen
 * Keine Abhängigkeiten zu anderen Modulen (Blatt im Abhängigkeitsbaum).
 * ============================================================ */

export const sportsCatalog = {
    'Kayaking': { label: 'K1', color: '#1E88E5' },
    'C1': { label: 'C1', color: '#1E88E5' },
    'C2': { label: 'C2', color: '#1E88E5' },
    'PaddleErgo': { label: 'Paddelergometer', color: '#1E88E5' },
    'Run': { label: 'Laufen', color: '#14B8A6' },
    'Ride': { label: 'Radfahren', color: '#F97316' },
    'Swim': { label: 'Schwimmen', color: '#EC4899' },
    'WeightTraining': { label: 'Krafttraining', color: '#8B5CF6' },
    'Workout': { label: 'Allg. Fitness', color: '#3949AB' }
};

export const typeColorMap = {
    race: { bg: 'bg-rose-950', text: 'text-rose-400', border: 'border-rose-800', bar: 'bg-rose-500', label: 'Wettkampf', color: '#f43f5e' },
    ga: { bg: 'bg-emerald-950', text: 'text-emerald-400', border: 'border-emerald-800', bar: 'bg-emerald-500', label: 'GA Ausdauer', color: '#10b981' },
    interval: { bg: 'bg-amber-950', text: 'text-amber-400', border: 'border-amber-800', bar: 'bg-amber-500', label: 'Intervalle', color: '#f59e0b' },
    reg: { bg: 'bg-blue-950', text: 'text-blue-400', border: 'border-blue-800', bar: 'bg-blue-500', label: 'Regeneration', color: '#3b82f6' },
    strength: { bg: 'bg-purple-950', text: 'text-purple-400', border: 'border-purple-800', bar: 'bg-purple-500', label: 'Kraft', color: '#8b5cf6' },
    tech: { bg: 'bg-cyan-950', text: 'text-cyan-400', border: 'border-cyan-800', bar: 'bg-cyan-500', label: 'Technik', color: '#06b6d4' },
    'diagnostic-lactate': { bg: 'bg-rose-950', text: 'text-rose-300', border: 'border-rose-800', bar: 'bg-rose-500', label: 'Laktattest', color: '#f43f5e' },
    'diagnostic-strength': { bg: 'bg-purple-950', text: 'text-purple-300', border: 'border-purple-800', bar: 'bg-purple-500', label: 'Krafttest', color: '#a855f7' }
};

export function formatDateDDMMYY(dateStr) {
    if (!dateStr || dateStr.length < 10) return dateStr;
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0].slice(2)}`;
    }
    return dateStr;
}


/** Lokales ISO-Datum (YYYY-MM-DD), ohne UTC-Verschiebung. */
export function toLocalDateString(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** HTML-Escaping für Werte aus Importdateien und Benutzereingaben. */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
    })[char]);
}

/** Datumsstring ohne implizite UTC-Interpretation parsen. */
export function parseLocalDate(dateString) {
    const [year, month, day] = String(dateString || '').slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return new Date(NaN);
    return new Date(year, month - 1, day);
}

/** Nutzerdefinierte Sportarten und Trainingskategorien ergänzen den Grundkatalog. */
export function getSportsCatalog() {
    const saved = { ...(state.settings?.sports || {}) };
    // Diese vier Einträge wurden durch einen früheren KAJO-Palettenversuch
    // ergänzt und gehören nicht zum ursprünglichen Sportarten-Katalog.
    ['RunningTrail', 'Cardio', 'CrossTraining', 'Outdoor'].forEach(key => delete saved[key]);
    // Der frühere Palettenversuch hat den ursprünglichen Namen überschrieben.
    if (saved.Workout) saved.Workout = { ...saved.Workout, label: 'Allg. Fitness' };
    return { ...sportsCatalog, ...saved };
}
export function getEnabledSportsCatalog() {
    const sports = getSportsCatalog();
    const selected = state.settings?.enabledSports;
    if (!Array.isArray(selected)) return sports; // Migration: bisherige Sportarten bleiben zunächst aktiv.
    const enabled = new Set(selected);
    return Object.fromEntries(Object.entries(sports).filter(([key]) => enabled.has(key)));
}
export function getTypeColorMap() { return { ...typeColorMap, ...(state.settings?.categories || {}) }; }
export function formatKm(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : '—'; }


let kajoUndoToastTimer = null;
export function showUndoToast(message, undo, duration = 10000) {
    if (typeof document === 'undefined' || typeof undo !== 'function') return;
    let toast = document.getElementById('kajo-undo-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'kajo-undo-toast';
        toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[2147483601] flex items-center gap-4 rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-xs text-white shadow-2xl';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    if (kajoUndoToastTimer) clearTimeout(kajoUndoToastTimer);
    toast.replaceChildren();
    const label = document.createElement('span');
    label.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Rückgängig';
    button.className = 'font-bold text-cyan-300 underline underline-offset-2';
    button.addEventListener('click', async () => {
        if (kajoUndoToastTimer) clearTimeout(kajoUndoToastTimer);
        try { await undo(); toast.remove(); }
        catch (error) { label.textContent = 'Rückgängig fehlgeschlagen: ' + (error?.message || 'Bitte erneut versuchen.'); }
    }, { once: true });
    toast.append(label, button);
    toast.classList.remove('hidden');
    kajoUndoToastTimer = setTimeout(() => { toast.remove(); kajoUndoToastTimer = null; }, duration);
}

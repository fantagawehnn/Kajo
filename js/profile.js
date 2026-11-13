import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { saveDataToLocalStorage } from './storage.js';

const sections = [
  {
    id: 'personal', title: 'Persönliche Daten', subtitle: 'Deine grundlegenden Angaben', icon: 'user-round',
    fields: [
      { key: 'name', label: 'Name', type: 'text', max: 80 },
      { key: 'birthDate', label: 'Geburtsdatum', type: 'date' },
      { key: 'gender', label: 'Geschlecht', type: 'select', options: [['','Keine Angabe'],['female','Weiblich'],['male','Männlich'],['diverse','Divers']] },
      { key: 'heightCm', label: 'Körpergröße (cm)', type: 'number', min: 100, max: 250, step: 0.1 }
    ]
  },
  {
    id: 'sport', title: 'Sportliches Profil', subtitle: 'Sportart, Disziplinen und sportlicher Hintergrund', icon: 'medal',
    fields: [
      { key: 'sport', label: 'Hauptsportart', type: 'text', max: 80 },
      { key: 'discipline', label: 'Hauptdisziplin', type: 'text', max: 100 },
      { key: 'additionalDisciplines', label: 'Weitere Disziplinen', type: 'text', max: 250, placeholder: 'Mehrere Disziplinen durch Komma trennen' },
      { key: 'level', label: 'Leistungsniveau', type: 'select', options: [['','Keine Angabe'],['recreational','Freizeitsport'],['competitive','Wettkampfsport'],['elite','Leistungssport / Elite']] },
      { key: 'club', label: 'Verein', type: 'text', max: 120 },
      { key: 'trainingGroup', label: 'Trainingsgruppe', type: 'text', max: 120 },
      { key: 'coach', label: 'Trainer / Trainerin', type: 'text', max: 120 },
      { key: 'athleticBackground', label: 'Sportlicher Hintergrund', type: 'textarea', max: 1000, wide: true, placeholder: 'Optional: bisherige Erfahrungen, wichtige Stationen …' }
    ]
  },
  {
    id: 'performance', title: 'Leistungsdiagnostik', subtitle: 'Individuelle Referenz- und Testwerte', icon: 'activity',
    fields: [
      { key: 'maxHr', label: 'Maximale Herzfrequenz (bpm)', type: 'number', min: 80, max: 240, step: 1 },
      { key: 'thresholdHr', label: 'Schwellenherzfrequenz (bpm)', type: 'number', min: 60, max: 220, step: 1 },
      { key: 'vo2max', label: 'VO₂max (ml/kg/min)', type: 'number', min: 10, max: 100, step: 0.1 },
      { key: 'vo2maxDate', label: 'Datum der VO₂max-Messung', type: 'date' },
      { key: 'thresholdPower', label: 'Schwellenleistung (Watt)', type: 'number', min: 1, max: 3000, step: 1 },
      { key: 'thresholdPace', label: 'Schwellentempo', type: 'text', max: 40, placeholder: 'z. B. 4:20 min/km' },
      { key: 'testSource', label: 'Quelle / Testverfahren', type: 'text', max: 160, wide: true, placeholder: 'z. B. Spiroergometrie, Feldtest, Leistungsdiagnostik' }
    ]
  },
  {
    id: 'training', title: 'Trainingsbedingungen', subtitle: 'Deine üblichen Möglichkeiten und Rahmenbedingungen', icon: 'dumbbell',
    fields: [
      { key: 'trainingDaysPerWeek', label: 'Übliche Trainingstage pro Woche', type: 'number', min: 1, max: 7, step: 1 },
      { key: 'sessionsPerDay', label: 'Übliche Einheiten pro Tag', type: 'number', min: 1, max: 5, step: 1 },
      { key: 'gymAccess', label: 'Zugang zu einem Fitnessstudio', type: 'checkbox' },
      { key: 'equipment', label: 'Verfügbare Trainingsgeräte', type: 'textarea', max: 700, placeholder: 'z. B. Hanteln, Ergometer, Therabänder …' },
      { key: 'facilities', label: 'Trainingsstätten und Infrastruktur', type: 'textarea', max: 700, placeholder: 'z. B. Schwimmbad, Laufbahn, Wasserzugang …' },
      { key: 'trainingAvailability', label: 'Zeitliche Verfügbarkeit', type: 'textarea', max: 700, placeholder: 'z. B. werktags abends, am Wochenende flexibel …' },
      { key: 'trainingConstraints', label: 'Regelmäßige Einschränkungen', type: 'textarea', max: 700, placeholder: 'Optional: wiederkehrende Einschränkungen der Trainingsmöglichkeiten …' }
    ]
  },
  {
    id: 'goals', title: 'Ziele und Saisonplanung', subtitle: 'Deine aktuellen Schwerpunkte und Saisonhöhepunkte', icon: 'target',
    fields: [
      { key: 'season', label: 'Saison / Zeitraum', type: 'text', max: 80, placeholder: 'z. B. Saison 2027' },
      { key: 'mainGoal', label: 'Übergeordnetes Saisonziel', type: 'textarea', max: 700, wide: true },
      { key: 'seasonHighlights', label: 'Saisonhöhepunkte / wichtige Wettkämpfe', type: 'textarea', max: 1000, wide: true, placeholder: 'Wichtige Termine und Prioritäten …' },
      { key: 'trainingFocus', label: 'Aktuelle Trainingsschwerpunkte', type: 'textarea', max: 1000, wide: true, placeholder: 'Woran möchtest du aktuell arbeiten?' },
      { key: 'developmentAreas', label: 'Persönliche Entwicklungsbereiche', type: 'textarea', max: 1000, wide: true, placeholder: 'Welche Fähigkeiten möchtest du verbessern?' }
    ]
  },
  {
    id: 'health', title: 'Gesundheit und Besonderheiten', subtitle: 'Freiwillige, trainingsrelevante Hinweise', icon: 'heart-pulse',
    fields: [
      { key: 'trainingNotes', label: 'Individuelle Hinweise für die Trainingssteuerung', type: 'textarea', max: 1000, wide: true, placeholder: 'Nur Angaben, die bei der Trainingsplanung berücksichtigt werden sollen …' },
      { key: 'knownLimitations', label: 'Bekannte trainingsrelevante Einschränkungen', type: 'textarea', max: 1000, wide: true, placeholder: 'Freiwillige Angabe …' },
      { key: 'cycleTrackingEnabled', label: 'Zyklus-Tracking im täglichen Check-in aktivieren', type: 'checkbox', femaleOnly: true }
    ]
  }
];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function displayValue(field, value) {
  if (field.type === 'checkbox') return value === true ? 'Aktiviert' : 'Nicht aktiviert';
  if (value === null || value === undefined || value === '') return '';
  if (field.key === 'gender') return ({ female: 'Weiblich', male: 'Männlich', diverse: 'Divers' })[value] || value;
  if (field.key === 'level') return ({ recreational: 'Freizeitsport', competitive: 'Wettkampfsport', elite: 'Leistungssport / Elite' })[value] || value;
  if (field.type === 'date') {
    const date = new Date(String(value) + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('de-DE');
  }
  if (field.key === 'heightCm') return value + ' cm';
  if (field.key === 'maxHr' || field.key === 'thresholdHr') return value + ' bpm';
  if (field.key === 'vo2max') return value + ' ml/kg/min';
  if (field.key === 'thresholdPower') return value + ' W';
  return String(value);
}

function profileAge(birthDate) {
  if (!birthDate) return '–';
  const date = new Date(String(birthDate) + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return '–';
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age--;
  return age >= 0 ? String(age) : '–';
}

function fieldControl(field, profile) {
  const value = profile[field.key];
  const common = `data-profile-key="${field.key}" class="kajo-profile-input"`;
  if (field.type === 'checkbox') {
    return `<label class="kajo-profile-check"><input type="checkbox" ${common} ${value === true ? 'checked' : ''}><span>${escapeHtml(field.label)}</span></label>`;
  }
  if (field.type === 'textarea') {
    return `<label class="kajo-profile-field ${field.wide ? 'is-wide' : ''}"><span>${escapeHtml(field.label)}</span><textarea ${common} maxlength="${field.max || 1200}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(value)}</textarea></label>`;
  }
  if (field.type === 'select') {
    const options = field.options.map(([optionValue, label]) => `<option value="${escapeHtml(optionValue)}" ${String(value ?? '') === optionValue ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
    return `<label class="kajo-profile-field"><span>${escapeHtml(field.label)}</span><select ${common}>${options}</select></label>`;
  }
  return `<label class="kajo-profile-field"><span>${escapeHtml(field.label)}</span><input ${common} type="${field.type}" value="${escapeHtml(value)}" ${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''} ${field.step ? `step="${field.step}"` : ''} ${field.max && field.type === 'text' ? `maxlength="${field.max}"` : ''} placeholder="${escapeHtml(field.placeholder || '')}"></label>`;
}

function sectionMarkup(section, profile) {
  const fields = section.fields.filter(field => !field.femaleOnly || profile.gender === 'female');
  const filled = fields.filter(field => {
    const value = profile[field.key];
    return field.type === 'checkbox' ? value === true : value !== null && value !== undefined && value !== '';
  }).length;
  const display = fields.map(field => {
    const value = displayValue(field, profile[field.key]);
    return `<div class="kajo-profile-value"><dt>${escapeHtml(field.label)}</dt><dd class="${value ? '' : 'is-empty'}">${value ? escapeHtml(value).replace(/\n/g, '<br>') : 'Noch nicht hinterlegt'}</dd></div>`;
  }).join('');
  return `<section class="kajo-profile-card" id="profile-section-${section.id}">
    <div class="kajo-profile-card-head">
      <div class="kajo-profile-section-title"><span class="kajo-profile-section-icon"><i data-lucide="${section.icon}"></i></span><div><h2>${section.title}</h2><p>${section.subtitle}</p></div></div>
      <button type="button" class="kajo-profile-edit" onclick="editAthleteProfileSection('${section.id}')"><i data-lucide="pencil"></i><span>Bearbeiten</span></button>
    </div>
    <div class="kajo-profile-readonly"><dl class="kajo-profile-values">${display}</dl><p class="kajo-profile-completeness">${filled} von ${fields.length} Angaben hinterlegt</p></div>
    <form class="kajo-profile-editor hidden" onsubmit="saveAthleteProfileSection(event,'${section.id}')">
      <div class="kajo-profile-form-grid">${fields.map(field => fieldControl(field, profile)).join('')}</div>
      <p class="kajo-profile-form-message" role="status"></p>
      <div class="kajo-profile-form-actions"><button type="button" class="kajo-profile-cancel" onclick="cancelAthleteProfileEdit('${section.id}')">Abbrechen</button><button type="submit" class="kajo-profile-save"><i data-lucide="save"></i><span>Änderungen speichern</span></button></div>
    </form>
  </section>`;
}

export function renderAthleteProfile() {
  const root = document.getElementById('athlete-profile-content');
  if (!root) return;
  const profile = state.profile && typeof state.profile === 'object' ? state.profile : {};
  const filledCount = sections.reduce((sum, section) => sum + section.fields.filter(field => {
    if (field.femaleOnly && profile.gender !== 'female') return false;
    const value = profile[field.key];
    return field.type === 'checkbox' ? value === true : value !== null && value !== undefined && value !== '';
  }).length, 0);
  const initials = String(profile.name || 'Athlet').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const level = displayValue({ key: 'level' }, profile.level) || 'Leistungsniveau offen';
  const sportLine = [profile.sport, profile.discipline].filter(Boolean).join(' · ') || 'Sportart noch nicht hinterlegt';
  root.innerHTML = `
    <header class="kajo-profile-hero">
      <div class="kajo-profile-hero-top"><div><p class="kajo-eyebrow">DEINE PERSÖNLICHE TRAININGSBASIS</p><h1 id="athlete-profile-page-title">Athletenprofil</h1><p>Alle wichtigen Angaben an einem Ort – übersichtlich und jederzeit gezielt bearbeitbar.</p></div><button type="button" class="kajo-profile-back" onclick="closeProfileModal()"><i data-lucide="arrow-left"></i><span>Zurück</span></button></div>
      <div class="kajo-profile-identity"><div class="kajo-profile-avatar">${escapeHtml(initials || 'A')}</div><div class="kajo-profile-identity-text"><h2>${escapeHtml(profile.name || 'Dein Athletenprofil')}</h2><p>${escapeHtml(sportLine)}</p><span>${escapeHtml(level)}</span></div></div>
      <div class="kajo-profile-quickstats">
        <div><span>Alter</span><strong>${profileAge(profile.birthDate)}</strong><small>Jahre</small></div>
        <div><span>Körpergröße</span><strong>${profile.heightCm ? escapeHtml(profile.heightCm) : '–'}</strong><small>${profile.heightCm ? 'cm' : 'Nicht hinterlegt'}</small></div>
        <div><span>Angaben</span><strong>${filledCount}</strong><small>hinterlegt</small></div>
      </div>
    </header>
    <div class="kajo-profile-section-grid">${sections.map(section => sectionMarkup(section, profile)).join('')}</div>
    <p class="kajo-profile-footnote">Alle Angaben sind freiwillig, soweit sie nicht für eine konkrete Funktion benötigt werden. Nicht hinterlegte Werte werden von KAJO nicht geschätzt. Änderungen werden in deinem Profil gespeichert.</p>
  `;
  try { globalThis.lucide?.createIcons?.(); } catch (error) { console.warn('Profil-Icons konnten nicht geladen werden.', error); }
}

export function editAthleteProfileSection(sectionId) {
  const card = document.getElementById('profile-section-' + sectionId);
  if (!card) return;
  card.querySelector('.kajo-profile-readonly')?.classList.add('hidden');
  card.querySelector('.kajo-profile-editor')?.classList.remove('hidden');
  try { globalThis.lucide?.createIcons?.(); } catch {}
}

export function cancelAthleteProfileEdit(sectionId) {
  renderAthleteProfile();
  const card = document.getElementById('profile-section-' + sectionId);
  card?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

export async function saveAthleteProfileSection(event, sectionId) {
  event?.preventDefault?.();
  const section = sections.find(item => item.id === sectionId);
  const card = document.getElementById('profile-section-' + sectionId);
  if (!section || !card) return;
  const message = card.querySelector('.kajo-profile-form-message');
  const nextProfile = { ...(state.profile || {}) };
  for (const field of section.fields) {
    if (field.femaleOnly && nextProfile.gender !== 'female') continue;
    const input = card.querySelector(`[data-profile-key="${field.key}"]`);
    if (!input) continue;
    if (field.type === 'checkbox') nextProfile[field.key] = input.checked;
    else if (field.type === 'number') nextProfile[field.key] = input.value.trim() === '' ? null : Number(input.value);
    else nextProfile[field.key] = input.value.trim();
  }
  if (sectionId === 'personal' && nextProfile.gender !== 'female') nextProfile.cycleTrackingEnabled = false;
  if (nextProfile.birthDate && new Date(nextProfile.birthDate + 'T12:00:00') > new Date()) {
    if (message) message.textContent = 'Das Geburtsdatum darf nicht in der Zukunft liegen.';
    return;
  }
  if (nextProfile.maxHr != null && nextProfile.thresholdHr != null && Number(nextProfile.thresholdHr) > Number(nextProfile.maxHr)) {
    if (message) message.textContent = 'Die Schwellenherzfrequenz kann nicht über der maximalen Herzfrequenz liegen.';
    return;
  }
  state.profile = nextProfile;
  saveDataToLocalStorage();
  if (message) message.textContent = 'Lokal gespeichert. Cloud-Synchronisierung wird geprüft …';
  try {
    if (supabase) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        const { error } = await supabase.from('user_profiles')
          .upsert({ user_id: userId, profile: nextProfile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
      }
    }
    renderAthleteProfile();
    const updatedCard = document.getElementById('profile-section-' + sectionId);
    updatedCard?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error('Athletenprofil konnte nicht vollständig synchronisiert werden:', error);
    if (message) message.textContent = 'Lokal gespeichert, Cloud-Synchronisierung fehlgeschlagen. Bitte später erneut versuchen.';
  }
}

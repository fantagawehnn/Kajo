import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { saveDataToLocalStorage } from './storage.js?v=8';

const sections = [
  {
    id: 'personal', title: 'Persönliche Daten', subtitle: 'Deine grundlegenden Angaben', icon: 'user-round',
    fields: [
      { key: 'name', label: 'Name', type: 'text', max: 80 },
      { key: 'birthDate', label: 'Geburtsdatum', type: 'date' },
      { key: 'gender', label: 'Geschlecht', type: 'select', options: [['','Keine Angabe'],['female','Weiblich'],['male','Männlich'],['diverse','Divers']] },
      { key: 'heightCm', label: 'Körpergröße (cm)', type: 'number', min: 100, max: 250, step: 0.1 },
      { key: 'photoUrl', label: 'Profilbild-URL', type: 'url', max: 500, placeholder: 'https://…' }
    ]
  },
  {
    id: 'sport', title: 'Sportliches Profil', subtitle: 'Sportart, Disziplinen und sportliches Umfeld', icon: 'medal',
    fields: [
      { key: 'sport', label: 'Hauptsportart', type: 'text', max: 80 },
      { key: 'discipline', label: 'Hauptdisziplin', type: 'text', max: 100 },
      { key: 'additionalDisciplines', label: 'Weitere Disziplinen', type: 'text', max: 250, placeholder: 'Mehrere Disziplinen durch Komma trennen' },
      { key: 'competitionFormats', label: 'Wettkampfformate', type: 'text', max: 250, placeholder: 'z. B. Classic, Sprint, Einzel, Team' },
      { key: 'level', label: 'Leistungsniveau', type: 'select', options: [['','Keine Angabe'],['recreational','Freizeitsport'],['competitive','Wettkampfsport'],['elite','Leistungssport / Elite']] },
      { key: 'club', label: 'Verein', type: 'text', max: 120 },
      { key: 'country', label: 'Land', type: 'text', max: 80 },
      { key: 'federation', label: 'Verband', type: 'text', max: 120 },
      { key: 'trainingGroup', label: 'Trainingsgruppe', type: 'text', max: 120 },
      { key: 'coach', label: 'Trainer / Trainerin', type: 'text', max: 120 },
      { key: 'trainingLocation', label: 'Trainingsstandort', type: 'text', max: 160 },
      { key: 'athleticBackground', label: 'Sportlicher Hintergrund', type: 'textarea', max: 1000, wide: true, placeholder: 'Bisherige Erfahrungen und wichtige Stationen …' }
    ]
  },
  {
    id: 'performance', title: 'Leistungsprofil', subtitle: 'Referenzwerte, Stärken und Entwicklungsfelder', icon: 'activity',
    fields: [
      { key: 'maxHr', label: 'Maximale Herzfrequenz (bpm)', type: 'number', min: 100, max: 240, step: 1 },
      { key: 'restingHr', label: 'Ruheherzfrequenz – Profil-Fallback (bpm)', type: 'number', min: 30, max: 120, step: 1 },
      { key: 'thresholdHr', label: 'Schwellenherzfrequenz (bpm)', type: 'number', min: 60, max: 220, step: 1 },
      { key: 'vo2max', label: 'VO₂max (ml/kg/min)', type: 'number', min: 10, max: 100, step: 0.1 },
      { key: 'vo2maxDate', label: 'Datum der VO₂max-Messung', type: 'date' },
      { key: 'thresholdPower', label: 'Schwellenleistung (Watt)', type: 'number', min: 1, max: 3000, step: 1 },
      { key: 'thresholdPace', label: 'Schwellentempo', type: 'text', max: 40, placeholder: 'z. B. 4:20 min/km' },
      { key: 'testSource', label: 'Quelle / Testverfahren', type: 'text', max: 160, wide: true, placeholder: 'z. B. Spiroergometrie, Feldtest' },
      { key: 'strengths', label: 'Sportliche Stärken', type: 'textarea', max: 1000, wide: true, placeholder: 'Welche Fähigkeiten zeichnen dich aus?' },
      { key: 'developmentAreas', label: 'Entwicklungsbereiche', type: 'textarea', max: 1000, wide: true, placeholder: 'Welche Fähigkeiten möchtest du gezielt verbessern?' }
    ]
  },
  {
    id: 'training', title: 'Trainingsbedingungen', subtitle: 'Möglichkeiten und Rahmenbedingungen', icon: 'dumbbell',
    fields: [
      { key: 'trainingDaysPerWeek', label: 'Übliche Trainingstage pro Woche', type: 'number', min: 1, max: 7, step: 1 },
      { key: 'sessionsPerDay', label: 'Übliche Einheiten pro Tag', type: 'number', min: 1, max: 5, step: 1 },
      { key: 'gymAccess', label: 'Zugang zu einem Fitnessstudio', type: 'checkbox' },
      { key: 'equipment', label: 'Verfügbare Trainingsgeräte', type: 'textarea', max: 700, placeholder: 'z. B. Hanteln, Ergometer, Therabänder …' },
      { key: 'facilities', label: 'Trainingsstätten und Infrastruktur', type: 'textarea', max: 700, placeholder: 'z. B. Schwimmbad, Laufbahn, Wasserzugang …' },
      { key: 'trainingAvailability', label: 'Zeitliche Verfügbarkeit', type: 'textarea', max: 700, placeholder: 'z. B. werktags abends, am Wochenende flexibel …' },
      { key: 'trainingConstraints', label: 'Regelmäßige Einschränkungen', type: 'textarea', max: 700, placeholder: 'Wiederkehrende Einschränkungen der Trainingsmöglichkeiten …' }
    ]
  },
  {
    id: 'goals', title: 'Ziele und Saisonplanung', subtitle: 'Saisonziele, Prioritäten und Schwerpunkte', icon: 'target',
    fields: [
      { key: 'season', label: 'Saison / Zeitraum', type: 'text', max: 80, placeholder: 'z. B. Saison 2027' },
      { key: 'mainGoal', label: 'Übergeordnetes Saisonziel', type: 'textarea', max: 700, wide: true },
      { key: 'seasonHighlights', label: 'Saisonhöhepunkte / wichtige Wettkämpfe', type: 'textarea', max: 1000, wide: true, placeholder: 'Wichtige Termine und Prioritäten …' },
      { key: 'trainingFocus', label: 'Aktuelle Trainingsschwerpunkte', type: 'textarea', max: 1000, wide: true, placeholder: 'Woran möchtest du aktuell arbeiten?' }
    ]
  },
  {
    id: 'achievements', title: 'Erfolge und Bestleistungen', subtitle: 'Wettkampfergebnisse, Titel und persönliche Rekorde', icon: 'trophy',
    fields: [
      { key: 'nationalTitles', label: 'Titel und besondere Erfolge', type: 'textarea', max: 1200, wide: true, placeholder: 'Ein Erfolg pro Zeile – möglichst mit Jahr und Wettbewerb' },
      { key: 'competitionHistory', label: 'Wettkampfgeschichte', type: 'textarea', max: 2000, wide: true, placeholder: 'Wettkampf, Jahr, Disziplin, Format und Ergebnis – ein Eintrag pro Zeile' },
      { key: 'personalRecords', label: 'Persönliche Bestleistungen', type: 'textarea', max: 1200, wide: true, placeholder: 'Bestleistung, Disziplin, Wert und Datum – ein Eintrag pro Zeile' }
    ]
  },
  {
    id: 'career', title: 'Sportlicher Werdegang', subtitle: 'Stationen, Entwicklung und wichtige Meilensteine', icon: 'route',
    fields: [
      { key: 'careerHistory', label: 'Sportliche Laufbahn', type: 'textarea', max: 2500, wide: true, placeholder: 'Eine Station pro Zeile, idealerweise mit Jahr, Verein/Kader und kurzer Beschreibung' },
      { key: 'careerNotes', label: 'Weitere wichtige Erfahrungen', type: 'textarea', max: 1200, wide: true, placeholder: 'z. B. Auslandsaufenthalte, Trainerwechsel oder besondere Erfahrungen' }
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

let activeProfileSection = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function displayValue(field, value) {
  if (field.type === 'checkbox') return value === true ? 'Aktiviert' : '';
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

function sectionFields(section, profile) {
  return section.fields.filter(field => !field.femaleOnly || profile.gender === 'female');
}

function sectionProgress(section, profile) {
  const fields = sectionFields(section, profile);
  const filled = fields.filter(field => {
    const value = profile[field.key];
    return field.type === 'checkbox' ? value === true : value !== null && value !== undefined && String(value).trim() !== '';
  }).length;
  return { filled, total: fields.length };
}

function fieldControl(field, profile) {
  const value = profile[field.key];
  const common = 'data-profile-key="' + field.key + '" class="kajo-profile-input"';
  if (field.type === 'checkbox') {
    return '<label class="kajo-profile-check"><input type="checkbox" ' + common + (value === true ? ' checked' : '') + '><span>' + escapeHtml(field.label) + '</span></label>';
  }
  if (field.type === 'textarea') {
    return '<label class="kajo-profile-field ' + (field.wide ? 'is-wide' : '') + '"><span>' + escapeHtml(field.label) + '</span><textarea ' + common + ' maxlength="' + (field.max || 1200) + '" rows="3" placeholder="' + escapeHtml(field.placeholder || '') + '">' + escapeHtml(value) + '</textarea></label>';
  }
  if (field.type === 'select') {
    const options = field.options.map(([optionValue, label]) => '<option value="' + escapeHtml(optionValue) + '"' + (String(value ?? '') === optionValue ? ' selected' : '') + '>' + escapeHtml(label) + '</option>').join('');
    return '<label class="kajo-profile-field"><span>' + escapeHtml(field.label) + '</span><select ' + common + '>' + options + '</select></label>';
  }
  return '<label class="kajo-profile-field"><span>' + escapeHtml(field.label) + '</span><input ' + common + ' type="' + field.type + '" value="' + escapeHtml(value) + '"' +
    (field.min != null ? ' min="' + field.min + '"' : '') + (field.max != null ? ' max="' + field.max + '"' : '') +
    (field.step ? ' step="' + field.step + '"' : '') + (field.max && ['text', 'url'].includes(field.type) ? ' maxlength="' + field.max + '"' : '') +
    ' placeholder="' + escapeHtml(field.placeholder || '') + '"></label>';
}

function formatProfileValue(field, value) {
  const safeValue = escapeHtml(value);
  const listFields = ['nationalTitles', 'competitionHistory', 'personalRecords'];
  if (field.key === 'careerHistory') {
    const entries = String(value).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    return entries.length ? '<ol class="kajo-profile-timeline">' + entries.map(item => '<li><span>' + escapeHtml(item) + '</span></li>').join('') + '</ol>' : safeValue;
  }
  if (listFields.includes(field.key)) {
    const entries = String(value).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    return entries.length ? '<ul class="kajo-profile-history-list">' + entries.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>' : safeValue;
  }
  return safeValue.replace(/\n/g, '<br>');
}

function isSafeImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function sectionMarkup(section, profile) {
  const fields = sectionFields(section, profile);
  const progress = sectionProgress(section, profile);
  const display = fields.map(field => {
    const value = displayValue(field, profile[field.key]);
    if (!value) return '';
    return '<div class="kajo-profile-value"><dt>' + escapeHtml(field.label) + '</dt><dd>' + formatProfileValue(field, value) + '</dd></div>';
  }).join('');
  return '<section class="kajo-profile-detail-card" id="profile-section-' + section.id + '">' +
    '<div class="kajo-profile-card-head"><div class="kajo-profile-section-title"><span class="kajo-profile-section-icon"><i data-lucide="' + section.icon + '"></i></span><div><h2>' + section.title + '</h2><p>' + section.subtitle + '</p></div></div>' +
    '<button type="button" class="kajo-profile-edit" onclick="editAthleteProfileSection(\'' + section.id + '\')" aria-label="' + section.title + ' bearbeiten"><i data-lucide="pencil"></i><span>Bearbeiten</span></button></div>' +
    '<div class="kajo-profile-readonly"><dl class="kajo-profile-values">' + (display || '<p class="kajo-profile-empty">Noch keine Angaben hinterlegt.</p>') + '</dl><p class="kajo-profile-completeness">' + progress.filled + ' von ' + progress.total + ' Angaben hinterlegt</p></div>' +
    '<form class="kajo-profile-editor hidden" onsubmit="saveAthleteProfileSection(event,\'' + section.id + '\')"><div class="kajo-profile-form-grid">' + fields.map(field => fieldControl(field, profile)).join('') + '</div>' +
    '<p class="kajo-profile-form-message" role="status"></p><div class="kajo-profile-form-actions"><button type="button" class="kajo-profile-cancel" onclick="cancelAthleteProfileEdit(\'' + section.id + '\')">Abbrechen</button><button type="submit" class="kajo-profile-save"><i data-lucide="save"></i><span>Änderungen speichern</span></button></div></form></section>';
}

function renderProfileOverview(profile, progress) {
  const age = profileAge(profile.birthDate);
  const facts = [
    ['Alter', age !== '–' ? age + ' Jahre' : null],
    ['Sportart', profile.sport],
    ['Hauptdisziplin', profile.discipline],
    ['Verein', profile.club],
    ['Land', profile.country],
    ['Saison', profile.season]
  ].filter(([, value]) => value);
  const seasonGoal = profile.mainGoal ? '<section class="kajo-profile-goal"><div><p class="kajo-profile-eyebrow">SAISONZIEL' + (profile.season ? ' · ' + escapeHtml(profile.season) : '') + '</p><strong>' + escapeHtml(profile.mainGoal).replace(/\n/g, '<br>') + '</strong></div></section>' : '';
  const rows = sections.map(section => {
    const item = sectionProgress(section, profile);
    return '<button type="button" class="kajo-profile-nav-row" onclick="openAthleteProfileSection(\'' + section.id + '\')"><span class="kajo-profile-section-icon"><i data-lucide="' + section.icon + '"></i></span><span class="kajo-profile-nav-copy"><strong>' + section.title + '</strong><small>' + section.subtitle + '</small></span><span class="kajo-profile-nav-count">' + item.filled + '/' + item.total + '</span><span class="kajo-profile-row-indicator" aria-hidden="true"><i data-lucide="chevron-right"></i></span></button>';
  }).join('');
  const avatar = isSafeImageUrl(profile.photoUrl) ? '<img class="kajo-profile-avatar-image" src="' + escapeHtml(profile.photoUrl) + '" alt="Profilbild">' : '<div class="kajo-profile-avatar">' + escapeHtml(String(profile.name || 'Athlet').trim().split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase() || 'A') + '</div>';
  return '<header class="kajo-profile-hero"><div class="kajo-profile-identity">' + avatar +
    '<div class="kajo-profile-identity-text"><p class="kajo-profile-eyebrow">DEIN ATHLETENPROFIL</p><h1>' + escapeHtml(profile.name || 'Dein Profil') + '</h1><span>' + escapeHtml(displayValue({key:'level'}, profile.level) || 'Leistungsniveau offen') + '</span></div>' +
    '<div class="kajo-profile-completion" style="--profile-progress:' + progress.percent + '%" role="img" aria-label="Profil zu ' + progress.percent + ' Prozent ausgefüllt"><div><strong>' + progress.percent + '%</strong><small>Profil</small></div></div><button type="button" class="kajo-profile-back kajo-profile-overview-back" onclick="closeProfileModal()" aria-label="Profil schließen"><i data-lucide="arrow-left"></i></button></div>' +
    '<div class="kajo-profile-facts">' + (facts.length ? facts.map(([label,value]) => '<div><span>' + label + '</span><strong>' + escapeHtml(value) + '</strong></div>').join('') : '<p>Ergänze dein Sportprofil, um hier deine wichtigsten Angaben zu sehen.</p>') + '</div>' +
    '</header>' + seasonGoal + '<section class="kajo-profile-overview"><div class="kajo-profile-overview-heading"><div><p class="kajo-profile-eyebrow">PROFILBEREICHE</p><h2>Deine sportliche Basis</h2></div><span>' + sections.length + ' Bereiche</span></div><div class="kajo-profile-nav-list">' + rows + '</div></section>' +
    '<p class="kajo-profile-footnote">Dein Profil ist privat und nur deinem angemeldeten Konto zugeordnet. Nicht hinterlegte Werte werden von KAJO nicht geschätzt.</p>';
}

export function renderAthleteProfile(sectionId = activeProfileSection) {
  const root = document.getElementById('athlete-profile-content');
  if (!root) return;
  const profile = state.profile && typeof state.profile === 'object' ? state.profile : {};
  const eligible = sections.flatMap(section => sectionFields(section, profile));
  const filledCount = eligible.filter(field => {
    const value = profile[field.key];
    return field.type === 'checkbox' ? value === true : value !== null && value !== undefined && String(value).trim() !== '';
  }).length;
  const progress = { filled: filledCount, total: eligible.length, percent: eligible.length ? Math.round(filledCount / eligible.length * 100) : 0 };
  activeProfileSection = sectionId || null;
  if (!activeProfileSection) {
    root.innerHTML = renderProfileOverview(profile, progress);
  } else {
    const section = sections.find(item => item.id === activeProfileSection);
    if (!section) {
      activeProfileSection = null;
      root.innerHTML = renderProfileOverview(profile, progress);
    } else {
      root.innerHTML = '<div class="kajo-profile-detail-top"><button type="button" class="kajo-profile-back" onclick="closeAthleteProfileSection()"><i data-lucide="arrow-left"></i><span>Profilübersicht</span></button><span class="kajo-profile-detail-label">ATHLETENPROFIL</span></div>' + sectionMarkup(section, profile);
    }
  }
  try { globalThis.lucide?.createIcons?.(); } catch (error) { console.warn('Profil-Icons konnten nicht geladen werden.', error); }
}

export function openAthleteProfileSection(sectionId) {
  if (!sections.some(section => section.id === sectionId)) return;
  renderAthleteProfile(sectionId);
  document.getElementById('view-profile')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export function closeAthleteProfileSection() {
  renderAthleteProfile(null);
  document.getElementById('view-profile')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export function editAthleteProfileSection(sectionId) {
  const card = document.getElementById('profile-section-' + sectionId);
  if (!card) return;
  card.querySelector('.kajo-profile-readonly')?.classList.add('hidden');
  card.querySelector('.kajo-profile-editor')?.classList.remove('hidden');
  try { globalThis.lucide?.createIcons?.(); } catch {}
}

export function cancelAthleteProfileEdit(sectionId) {
  renderAthleteProfile(sectionId);
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
    const input = card.querySelector('[data-profile-key="' + field.key + '"]');
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
    renderAthleteProfile(sectionId);
    const updatedCard = document.getElementById('profile-section-' + sectionId);
    updatedCard?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error('Athletenprofil konnte nicht vollständig synchronisiert werden:', error);
    if (message) message.textContent = 'Lokal gespeichert, Cloud-Synchronisierung fehlgeschlagen. Bitte später erneut versuchen.';
  }
}

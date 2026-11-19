const THEME_KEY = 'kajo-theme-preference';
const THEMES = ['system', 'dark', 'light'];
const ACCENT_KEY = 'kajo-accent-color';
const DEFAULT_ACCENT = '#22D3EE';
function validAccentColor(value) { return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value); }
export function getKajoAccentColor() {
  try { const saved = localStorage.getItem(ACCENT_KEY); return validAccentColor(saved) ? saved.toUpperCase() : DEFAULT_ACCENT; }
  catch { return DEFAULT_ACCENT; }
}
export function applyKajoAccentColor(color = getKajoAccentColor()) {
  const selected = validAccentColor(color) ? color.toUpperCase() : DEFAULT_ACCENT;
  const root = document.documentElement;
  const red = parseInt(selected.slice(1, 3), 16), green = parseInt(selected.slice(3, 5), 16), blue = parseInt(selected.slice(5, 7), 16);
  root.style.setProperty('--kajo-accent', selected);
  root.style.setProperty('--kajo-accent-rgb', red + ', ' + green + ', ' + blue);
  const linear = channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4); };
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  root.style.setProperty('--kajo-accent-contrast', luminance > 0.179 ? '#07111D' : '#FFFFFF');
  const input = document.getElementById('kajo-accent-color');
  if (input && input.value.toUpperCase() !== selected) input.value = selected;
  return selected;
}
export function setKajoAccentColor(color) {
  const selected = validAccentColor(color) ? color.toUpperCase() : DEFAULT_ACCENT;
  try { localStorage.setItem(ACCENT_KEY, selected); }
  catch (error) { console.warn('KAJO-Akzentfarbe konnte nicht gespeichert werden:', error); }
  return applyKajoAccentColor(selected);
}

function preferredSystemTheme() {
  return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getKajoThemePreference() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function applyKajoTheme(preference = getKajoThemePreference()) {
  const selected = THEMES.includes(preference) ? preference : 'system';
  const effective = selected === 'system' ? preferredSystemTheme() : selected;
  const root = document.documentElement;
  root.dataset.theme = effective;
  root.dataset.themePreference = selected;
  root.style.colorScheme = effective;
  applyKajoAccentColor();
  const selector = document.getElementById('kajo-theme-select');
  if (selector && selector.value !== selected) selector.value = selected;
  return effective;
}

export function setKajoTheme(preference) {
  const selected = THEMES.includes(preference) ? preference : 'system';
  try {
    localStorage.setItem(THEME_KEY, selected);
  } catch (error) {
    console.warn('KAJO-Designpräferenz konnte nicht gespeichert werden:', error);
  }
  applyKajoTheme(selected);
}

export function initializeKajoTheme() {
  applyKajoTheme();
  const selector = document.getElementById('kajo-theme-select');
  selector?.addEventListener('change', event => setKajoTheme(event.currentTarget.value));
  const accent = document.getElementById('kajo-accent-color');
  accent?.addEventListener('input', event => setKajoAccentColor(event.currentTarget.value));
  globalThis.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (getKajoThemePreference() === 'system') applyKajoTheme('system');
  });
}

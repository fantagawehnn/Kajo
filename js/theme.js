const THEME_KEY = 'kajo-theme-preference';
const THEMES = ['system', 'dark', 'light'];

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
  globalThis.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (getKajoThemePreference() === 'system') applyKajoTheme('system');
  });
}

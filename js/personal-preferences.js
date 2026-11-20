import { getUserLocalSetting, setUserLocalSetting } from './storage.js?v=5';

export const PERSONAL_PREFERENCES_KEY = 'personal_preferences_v1';
export const PERSONAL_PREFERENCES_VERSION = 1;

export function createDefaultPersonalPreferences() {
    return {
        version: PERSONAL_PREFERENCES_VERSION,
        dashboard: {},
        analysis: {},
        views: {},
        appearance: {}
    };
}

export function normalizePersonalPreferences(value) {
    const defaults = createDefaultPersonalPreferences();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
    if (value.version !== PERSONAL_PREFERENCES_VERSION) return defaults;

    const result = { ...defaults };
    for (const section of ['dashboard', 'analysis', 'views', 'appearance']) {
        const candidate = value[section];
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            result[section] = candidate;
        }
    }
    return result;
}

export function createPersonalPreferencesStore(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        throw new TypeError('Ein benutzergebundener Speicher mit getItem() und setItem() ist erforderlich.');
    }

    return {
        load() {
            const raw = storage.getItem(PERSONAL_PREFERENCES_KEY);
            if (typeof raw !== 'string' || !raw) return createDefaultPersonalPreferences();
            try {
                return normalizePersonalPreferences(JSON.parse(raw));
            } catch {
                return createDefaultPersonalPreferences();
            }
        },
        save(value) {
            const normalized = normalizePersonalPreferences({
                ...value,
                version: PERSONAL_PREFERENCES_VERSION
            });
            storage.setItem(PERSONAL_PREFERENCES_KEY, JSON.stringify(normalized));
            return normalized;
        },
        reset() {
            const defaults = createDefaultPersonalPreferences();
            storage.setItem(PERSONAL_PREFERENCES_KEY, JSON.stringify(defaults));
            return defaults;
        }
    };
}

const accountStorage = {
    getItem: key => getUserLocalSetting(key),
    setItem: (key, value) => setUserLocalSetting(key, value)
};

const preferencesStore = createPersonalPreferencesStore(accountStorage);

export function loadPersonalPreferences() {
    return preferencesStore.load();
}

export function savePersonalPreferences(value) {
    return preferencesStore.save(value);
}

export function resetPersonalPreferences() {
    return preferencesStore.reset();
}

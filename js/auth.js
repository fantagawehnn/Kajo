import { supabase } from './supabase-client.js';
import { getActivationUiState } from './activation-ui-state.js?v=1';

const authScreen = document.getElementById('auth-screen');
const authBootScreen = document.getElementById('auth-boot-screen');
const appNavigation = document.getElementById('app-navigation');
const appMain = document.getElementById('app-main');
const userBar = document.getElementById('auth-userbar');
const userEmail = document.getElementById('auth-user-email');
const form = document.getElementById('auth-form');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const submitButton = document.getElementById('auth-submit');
const modeToggle = document.getElementById('auth-mode-toggle');
const resetButton = document.getElementById('auth-reset');
const message = document.getElementById('auth-message');
const logoutButton = document.getElementById('auth-logout');

let isSignUp = false;
let currentAuthUserId = null;
let localReadyUserId = null;
let readyUserId = null;

const mobileHeader = document.querySelector('.kajo-mobile-header');
const activationNotice = document.createElement('div');
activationNotice.id = 'auth-local-sync-notice';
activationNotice.className = 'hidden mb-4 rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-3 text-sm text-sky-100';
activationNotice.setAttribute('role', 'status');
activationNotice.setAttribute('aria-live', 'polite');
activationNotice.textContent = 'Lokale Daten sind verfügbar. Änderungen werden sofort lokal gespeichert; der Cloud-Abgleich läuft im Hintergrund.';
appMain.prepend(activationNotice);

function withAuthTimeout(promise, label, timeoutMs = 20000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(label + ' dauert zu lange. Bitte prüfe deine Internetverbindung und versuche es erneut.')), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function setMessage(text, isError = false) {
    message.textContent = text;
    message.className = `text-xs min-h-10 ${isError ? 'text-rose-300' : 'text-emerald-300'}`;
}

function handleAuthCheckError(error) {
    // Die Sitzung bleibt im lokalen Speicher erhalten; wir melden den Nutzer nicht ab.
    showApp(null);
    setMessage('Supabase ist momentan nicht erreichbar. Deine gespeicherten Daten und deine vorhandene Sitzung wurden nicht gelöscht. Bitte versuche die Anmeldung erneut, sobald die Verbindung wieder verfügbar ist.', true);
    console.error('KAJO: Anmeldestatus konnte nicht geprüft werden:', error);
}

function showApp(session) {
    const signedIn = Boolean(session?.user);
    const nextUserId = session?.user?.id || null;
    if (!nextUserId || (currentAuthUserId && nextUserId !== currentAuthUserId)) {
        localReadyUserId = null;
        readyUserId = null;
    }
    currentAuthUserId = nextUserId;
    const { visible, readOnly, syncing } = getActivationUiState(
        currentAuthUserId,
        localReadyUserId,
        readyUserId
    );

    // Lokale Daten dürfen früh erscheinen, bleiben bis zum abgeschlossenen
    // Cloud-Abgleich aber vollständig schreibgeschützt.
    authScreen.classList.toggle('hidden', signedIn);
    authBootScreen?.classList.toggle('hidden', !signedIn || visible);
    appNavigation.classList.toggle('hidden', !visible);
    appMain.classList.toggle('hidden', !visible);
    userBar.classList.toggle('hidden', !visible);
    appNavigation.inert = readOnly;
    appMain.inert = readOnly;
    if (mobileHeader) mobileHeader.inert = readOnly;
    appMain.setAttribute('aria-busy', String(readOnly));
    activationNotice.classList.toggle('hidden', !syncing);
    if (signedIn) userEmail.textContent = session.user.email || 'Angemeldet';
}

window.addEventListener('endurance:user-load-error', (event) => {
    const detail = event.detail || {};
    // Verspätete Fehler eines vorherigen Kontos dürfen die aktuelle Ansicht
    // nicht schließen oder den Status des inzwischen angemeldeten Kontos ändern.
    if (detail.userId && detail.userId !== currentAuthUserId) return;

    localReadyUserId = null;
    readyUserId = null;
    authBootScreen?.classList.add('hidden');
    authScreen.classList.remove('hidden');
    appNavigation.classList.add('hidden');
    appMain.classList.add('hidden');
    appNavigation.inert = false;
    appMain.inert = false;
    if (mobileHeader) mobileHeader.inert = true;
    appMain.setAttribute('aria-busy', 'false');
    activationNotice.classList.add('hidden');
    // Die Abmeldung bleibt auch nach einem fehlgeschlagenen Cloud-Abgleich erreichbar.
    userBar.classList.remove('hidden');
    setMessage('Deine Kontodaten konnten nicht sicher abgeglichen werden: ' + (detail.message || 'Unbekannter Fehler') + ' Bitte lade die Seite neu. Deine lokalen Daten wurden nicht gelöscht.', true);
});

window.addEventListener('endurance:user-local-ready', (event) => {
    const userId = event.detail?.userId;
    if (!userId || (currentAuthUserId && userId !== currentAuthUserId)) return;
    localReadyUserId = userId;
    if (userId === currentAuthUserId) {
        showApp({ user: { id: userId, email: userEmail.textContent } });
    }
});

window.addEventListener('endurance:user-ready', (event) => {
    const userId = event.detail?.userId;
    if (!userId || (currentAuthUserId && userId !== currentAuthUserId)) return;
    localReadyUserId = userId;
    readyUserId = userId;
    if (userId === currentAuthUserId) {
        showApp({ user: { id: userId, email: userEmail.textContent } });
    }
});

function setMode(signUp) {
    isSignUp = signUp;
    submitButton.textContent = signUp ? 'Account erstellen' : 'Anmelden';
    modeToggle.textContent = signUp ? 'Zurück zur Anmeldung' : 'Neuen Account erstellen';
    passwordInput.autocomplete = signUp ? 'new-password' : 'current-password';
    resetButton.classList.toggle('hidden', signUp);
    setMessage(signUp
        ? 'Erstelle hier später auch einen separaten Coach-Zugang. Coach-Rechte werden unabhängig davon durch dich vergeben.'
        : '');
}

if (!supabase) {
    showApp(null);
    setMessage('Die Supabase-Verbindung ist noch nicht konfiguriert. Bitte trage Project URL und anon/public key in js/supabase-config.js ein. Verwende niemals den service_role-Schlüssel.', true);
} else {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        submitButton.disabled = true;
        submitButton.textContent = 'Bitte warten …';
        try {
            if (isSignUp) {
                const { data, error } = await withAuthTimeout(supabase.auth.signUp({
                    email, password,
                    options: { emailRedirectTo: window.location.href.split('#')[0] }
                }), 'Die Registrierung', 20000);
                if (error) throw error;
                if (data.session) {
                    setMessage('Account erstellt und angemeldet.');
                } else {
                    setMessage('Registrierung gestartet. Bitte bestätige deine E-Mail-Adresse über den zugesandten Link und melde dich anschließend an.');
                    setMode(false);
                }
            } else {
                const { error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }), 'Die Anmeldung', 20000);
                if (error) throw error;
            }
        } catch (error) {
            setMessage(error.message || 'Anmeldung fehlgeschlagen.', true);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = isSignUp ? 'Account erstellen' : 'Anmelden';
        }
    });

    modeToggle.addEventListener('click', () => setMode(!isSignUp));

    resetButton.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) {
            setMessage('Bitte gib zuerst deine E-Mail-Adresse ein.', true);
            emailInput.focus();
            return;
        }
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.href.split('#')[0]
            });
            if (error) throw error;
            setMessage('Wenn ein Account zu dieser Adresse existiert, wurde eine E-Mail zum Zurücksetzen des Passworts versendet.');
        } catch (error) {
            setMessage(error.message || 'Passwort-Reset konnte nicht gestartet werden.', true);
        }
    });

    logoutButton.addEventListener('click', async () => {
        logoutButton.disabled = true;
        const { error } = await supabase.auth.signOut();
        logoutButton.disabled = false;
        if (error) setMessage(error.message || 'Abmeldung fehlgeschlagen.', true);
    });

    supabase.auth.onAuthStateChange((_event, session) => showApp(session));
    supabase.auth.getSession().then(({ data, error }) => {
        if (error) {
            handleAuthCheckError(error);
            return;
        }
        showApp(data?.session || null);
    }).catch(handleAuthCheckError);

    // Auch Fehler der parallelen Sitzungsprüfung in main.js beenden den endlosen Startbildschirm.
    window.addEventListener('endurance:auth-check-error', (event) => {
        handleAuthCheckError(event.detail?.error || new Error('Die Anmeldung konnte nicht überprüft werden.'));
    });
}

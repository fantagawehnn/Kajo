/**
 * Creates a reusable guard for asynchronous work tied to one activation.
 * Call it after every awaited boundary and immediately before side effects.
 */
export function createActivationGuard(isCurrent, message = 'Die Kontoaktivierung ist nicht mehr aktuell.') {
    if (typeof isCurrent !== 'function') {
        throw new TypeError('isCurrent muss eine Funktion sein.');
    }
    return function ensureActivationCurrent() {
        if (!isCurrent()) throw new Error(message);
    };
}

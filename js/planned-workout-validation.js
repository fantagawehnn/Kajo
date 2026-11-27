/** Parse an optional non-negative integer used by a planned workout field. */
export function parseOptionalPlanInteger(raw, label, { min = 0, max = null } = {}) {
    const value = String(raw ?? '').trim();
    if (value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || (max !== null && number > max)) {
        const range = max === null ? `mindestens ${min}` : `zwischen ${min} und ${max}`;
        throw new Error(`${label} muss eine ganze Zahl ${range} sein.`);
    }
    return number;
}

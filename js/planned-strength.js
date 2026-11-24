const MAX_EXERCISES = 40;

export function createPlannedStrengthExercise(input = {}) {
    const name = String(input.name ?? '').trim().slice(0, 80);
    const sets = Number(input.sets);
    const reps = Number(input.reps);
    const weightRaw = String(input.weight ?? '').trim();
    const weight = weightRaw === '' ? null : Number(weightRaw);

    if (!name) throw new Error('Bitte gib einen Übungsnamen ein.');
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) throw new Error('Bitte gib 1 bis 20 Sätze an.');
    if (!Number.isInteger(reps) || reps < 1 || reps > 100) throw new Error('Bitte gib 1 bis 100 Wiederholungen pro Satz an.');
    if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) throw new Error('Das Zielgewicht muss zwischen 0 und 1000 kg liegen.');

    return { name, sets, reps, weight };
}

export function normalizePlannedStrengthExercises(exercises) {
    if (!Array.isArray(exercises)) return [];
    return exercises.slice(0, MAX_EXERCISES).flatMap(item => {
        try {
            return [createPlannedStrengthExercise(item)];
        } catch (_) {
            return [];
        }
    });
}

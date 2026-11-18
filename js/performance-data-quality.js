/**
 * Sport classification for paddling-specific performance analysis.
 * These values match the canonical sport keys in utils.js. Unknown/custom
 * activities are deliberately excluded until their sport mapping is explicit.
 */
const PADDLING_ACTIVITY_TYPES = new Set(['Kayaking', 'C1', 'C2', 'PaddleErgo']);

export function isPaddlingPerformanceActivity(activity) {
    return PADDLING_ACTIVITY_TYPES.has(activity?.type);
}

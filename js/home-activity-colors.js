/**
 * Resolves the color used by the Home/Today activity cards.
 * Keep this aligned with the calendar's Sportart/Trainingsart color mode.
 */
export function getActivityDisplayColor(activity, mode, sportsCatalog, categories) {
    if (mode === 'training') {
        const category = activity?.category;
        const categoryColor = category
            ? categories?.[category]?.color
            : categories?.ga?.color;
        return categoryColor
            || sportsCatalog?.[activity?.type]?.color
            || '#64748b';
    }
    return sportsCatalog?.[activity?.type]?.color || '#64748b';
}

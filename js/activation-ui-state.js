export function getActivationUiState(userId, localReadyUserId, readyUserId) {
    const signedIn = typeof userId === 'string' && userId.length > 0;
    const localReady = signedIn && localReadyUserId === userId;
    const ready = signedIn && readyUserId === userId;
    return {
        visible: localReady || ready,
        // The account-scoped local state is the editable working copy.
        // Reconciliation is guarded against concurrent local changes.
        readOnly: false,
        syncing: localReady && !ready
    };
}

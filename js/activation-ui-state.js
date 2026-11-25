export function getActivationUiState(userId, localReadyUserId, readyUserId) {
    const signedIn = typeof userId === 'string' && userId.length > 0;
    const localReady = signedIn && localReadyUserId === userId;
    const ready = signedIn && readyUserId === userId;
    return {
        visible: localReady || ready,
        // A loaded local cache is sufficient for editing. Cloud reconciliation
        // continues in the background and must not make the local app inert.
        readOnly: false,
        syncing: localReady && !ready
    };
}

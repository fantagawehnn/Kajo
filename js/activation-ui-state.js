export function getActivationUiState(userId, localReadyUserId, readyUserId) {
    const signedIn = typeof userId === 'string' && userId.length > 0;
    const localReady = signedIn && localReadyUserId === userId;
    const ready = signedIn && readyUserId === userId;
    return {
        visible: localReady || ready,
        readOnly: localReady && !ready
    };
}

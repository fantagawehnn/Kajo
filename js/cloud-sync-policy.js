/**
 * Automatic uploads are allowed only after a cloud snapshot already exists
 * or the user has explicitly completed the first upload.
 */
export function canAutomaticallySyncCloudSnapshot(initialTransferState) {
    return initialTransferState === 'exists' || initialTransferState === 'uploaded';
}

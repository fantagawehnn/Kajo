import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const sourcePath = fileURLToPath(new URL('../js/cloud-sync.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8')
    .replace("import { supabase } from './supabase-client.js';", '')
    .replace(/export async function/g, 'async function')
    + '\nmodule.exports = { saveCloudSnapshotPatch, saveCloudSnapshot };';

function loadModule(supabase) {
    const sandbox = { supabase, module: { exports: {} } };
    vm.runInNewContext(source, sandbox, { filename: 'cloud-sync.js' });
    return sandbox.module.exports;
}

test('sends only the supplied patch with the expected version and account guard', async () => {
    const calls = [];
    const supabase = {
        auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; } },
        async rpc(name, args) {
            calls.push({ name, args });
            return { data: [{ saved: true, current_version: 8, current_updated_at: '2026-11-25T12:00:00Z' }], error: null };
        }
    };
    const { saveCloudSnapshotPatch } = loadModule(supabase);
    const patch = { planned: [{ id: 'p1' }] };
    const result = await saveCloudSnapshotPatch(patch, 7, 'user-1');

    assert.equal(result.saved, true);
    assert.equal(result.currentVersion, 8);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
        name: 'patch_user_data',
        args: { p_patch: patch, p_expected_version: 7 }
    }]);
});

test('does not call the patch RPC when the authenticated account changed', async () => {
    let rpcCalled = false;
    const supabase = {
        auth: { async getUser() { return { data: { user: { id: 'other-user' } }, error: null }; } },
        async rpc() { rpcCalled = true; return { data: null, error: null }; }
    };
    const { saveCloudSnapshotPatch } = loadModule(supabase);
    await assert.rejects(
        () => saveCloudSnapshotPatch({ planned: [] }, 4, 'user-1'),
        /angemeldete Konto hat sich geändert/
    );
    assert.equal(rpcCalled, false);
});

test('returns a version conflict without overwriting the cloud snapshot', async () => {
    const supabase = {
        auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; } },
        async rpc() {
            return { data: [{ saved: false, current_version: 9, current_updated_at: '2026-11-25T12:01:00Z' }], error: null };
        }
    };
    const { saveCloudSnapshotPatch } = loadModule(supabase);
    const result = await saveCloudSnapshotPatch({ profile: { name: 'A' } }, 8, 'user-1');
    assert.equal(result.saved, false);
    assert.equal(result.conflict, true);
    assert.equal(result.currentVersion, 9);
});

test('rejects empty patches and invalid versions before any network call', async () => {
    let rpcCalled = false;
    const supabase = {
        auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; } },
        async rpc() { rpcCalled = true; return { data: null, error: null }; }
    };
    const { saveCloudSnapshotPatch } = loadModule(supabase);
    await assert.rejects(() => saveCloudSnapshotPatch({}, 2, 'user-1'), /leerer Cloud-Patch/);
    await assert.rejects(() => saveCloudSnapshotPatch({ planned: [] }, 0, 'user-1'), /bestehende Version/);
    assert.equal(rpcCalled, false);
});


test('uses the existing full snapshot RPC for a new account at version zero', async () => {
    const calls = [];
    const supabase = {
        auth: { async getUser() { return { data: { user: { id: 'new-user' } }, error: null }; } },
        async rpc(name, args) {
            calls.push({ name, args });
            return { data: [{ saved: true, current_version: 1, current_updated_at: '2026-11-25T12:00:00Z' }], error: null };
        }
    };
    const { saveCloudSnapshot } = loadModule(supabase);
    const snapshot = { planned: [], checkins: {}, profile: { name: 'Neu' } };
    const result = await saveCloudSnapshot(snapshot, 0, 'new-user');

    assert.equal(result.saved, true);
    assert.equal(result.currentVersion, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
        name: 'save_user_data',
        args: { p_data: snapshot, p_expected_version: 0 }
    }]);
});

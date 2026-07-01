import { createSignal, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { store, BookStore } from '../store/books.ts';
import { testSMB } from '../lib/api.ts';
import type { SMBConfig } from '@polka/shared';

export function SettingsPage() {
  const navigate = useNavigate();
  const existing = store.smb;

  const [ip, setIp] = createSignal(existing?.ip ?? '');
  const [port, setPort] = createSignal(String(existing?.port ?? 445));
  const [username, setUsername] = createSignal(existing?.username ?? '');
  const [password, setPassword] = createSignal('');
  const [share, setShare] = createSignal(existing?.share ?? '');
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal<'idle' | 'ok' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = createSignal('');

  function buildConfig(): SMBConfig {
    return {
      ip: ip().trim(),
      port: Number(port()) || 445,
      username: username().trim(),
      password: password(),
      share: share().trim(),
    };
  }

  async function handleTest() {
    setBusy(true);
    setStatus('idle');
    try {
      await testSMB(buildConfig());
      setStatus('ok');
      setStatusMsg('Connection successful');
    } catch (e) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    const config = buildConfig();
    if (!config.password && existing?.password) {
      config.password = existing.password;
    }
    BookStore.saveSMBConfig(config);
    navigate('/');
  }

  function handleClear() {
    BookStore.deleteSMBConfig();
    navigate('/');
  }

  return (
    <div class="page">
      <div class="page-header">
        <button class="icon-btn" onClick={() => navigate('/')} title="Back">←</button>
        <h1 class="page-title">NAS Settings</h1>
        <div style={{ width: '40px' }} />
      </div>

      <div class="settings-form">
        <div class="field">
          <label>IP Address</label>
          <input
            type="text"
            inputmode="url"
            placeholder="192.168.1.100"
            value={ip()}
            onInput={(e) => setIp(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>Port</label>
          <input
            type="number"
            inputmode="numeric"
            placeholder="445"
            value={port()}
            onInput={(e) => setPort(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>Username</label>
          <input
            type="text"
            autocomplete="username"
            placeholder="username"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>Password</label>
          <input
            type="password"
            autocomplete="current-password"
            placeholder={existing ? '(re-enter to update)' : 'password'}
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>Share Name</label>
          <input
            type="text"
            placeholder="books"
            value={share()}
            onInput={(e) => setShare(e.currentTarget.value)}
          />
        </div>

        <Show when={status() !== 'idle'}>
          <div class={`status-msg ${status() === 'ok' ? 'status-ok' : 'status-error'}`}>
            {statusMsg()}
          </div>
        </Show>

        <div class="settings-actions">
          <button class="btn-secondary" onClick={() => void handleTest()} disabled={busy()}>
            {busy() ? 'Testing…' : 'Test Connection'}
          </button>
          <button class="btn" onClick={handleSave}>Save</button>
          <Show when={existing}>
            <button class="btn-danger" onClick={handleClear}>Disconnect NAS</button>
          </Show>
        </div>
      </div>
    </div>
  );
}

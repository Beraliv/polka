import { createSignal, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { store, BookStore } from '../../store/books.ts';
import { testSMB, fetchSMBConfig } from '../../lib/api';
import type { SMBConfig, SMBConfigSummary } from '@polka/shared';
import { i18n } from '../../i18n';

export function NasConfigurationSettings() {
  const navigate = useNavigate();

  const [existing, setExisting] = createSignal<SMBConfigSummary | null>(null);
  const [serverUrl, setServerUrl] = createSignal(store.serverUrl ?? '');
  const [ip, setIp] = createSignal('');
  const [port, setPort] = createSignal('445');
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [share, setShare] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal<'idle' | 'ok' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = createSignal('');

  onMount(() => {
    void (async () => {
      const summary = await fetchSMBConfig();
      setExisting(summary);
      if (summary) {
        setIp(summary.ip);
        setPort(String(summary.port));
        setUsername(summary.username);
        setShare(summary.share);
      }
    })();
  });

  function buildConfig(): Partial<SMBConfig> {
    const config: Partial<SMBConfig> = {
      ip: ip().trim(),
      port: Number(port()) || 445,
      username: username().trim(),
      share: share().trim(),
    };
    if (password()) {
      config.password = password();
    }
    return config;
  }

  async function handleTest() {
    setBusy(true);
    setStatus('idle');
    try {
      await testSMB({ config: buildConfig(), serverUrl: serverUrl().trim().replace(/\/+$/, '') });
      setStatus('ok');
      setStatusMessage(i18n('settings.connectionSuccessful'));
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const url = serverUrl();
    if (url.trim()) {
      BookStore.saveServerUrl(url);
    } else {
      BookStore.deleteServerUrl();
    }
    await BookStore.saveSMBConfig(buildConfig());
    navigate('/');
  }

  async function handleClear() {
    await BookStore.deleteSMBConfig();
    navigate('/');
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void handleSave();
  }

  return (
    // Using form with name/id/autocomplete on every field to be recognised by
    // password managers for autofill
    <form id="nas-config-form" autocomplete="on" onSubmit={handleSubmit}>
      <div class="field">
        <label for="server-url">{i18n('settings.serverUrlLabel')}</label>
        <input
          id="server-url"
          name="server-url"
          type="url"
          inputmode="url"
          autocomplete="url"
          placeholder={i18n('settings.serverUrlPlaceholder')}
          value={serverUrl()}
          onInput={(event) => setServerUrl(event.currentTarget.value)}
        />
        <p class="field-hint">{i18n('settings.serverUrlHint')}</p>
      </div>
      <div class="field">
        <label for="nas-ip-address">{i18n('settings.ipAddressLabel')}</label>
        <input
          id="nas-ip-address"
          name="ip-address"
          type="text"
          inputmode="url"
          autocomplete="on"
          placeholder={i18n('settings.ipAddressPlaceholder')}
          value={ip()}
          onInput={(event) => setIp(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="nas-port">{i18n('settings.portLabel')}</label>
        <input
          id="nas-port"
          name="port"
          type="number"
          inputmode="numeric"
          autocomplete="on"
          placeholder={i18n('settings.portPlaceholder')}
          value={port()}
          onInput={(event) => setPort(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="nas-username">{i18n('settings.usernameLabel')}</label>
        <input
          id="nas-username"
          name="username"
          type="text"
          autocomplete="username"
          placeholder={i18n('settings.usernamePlaceholder')}
          value={username()}
          onInput={(event) => setUsername(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="nas-password">{i18n('settings.passwordLabel')}</label>
        <input
          id="nas-password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder={
            existing()
              ? i18n('settings.passwordUpdatePlaceholder')
              : i18n('settings.passwordPlaceholder')
          }
          value={password()}
          onInput={(event) => setPassword(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="nas-share-name">{i18n('settings.shareNameLabel')}</label>
        <input
          id="nas-share-name"
          name="share"
          type="text"
          autocomplete="on"
          placeholder={i18n('settings.shareNamePlaceholder')}
          value={share()}
          onInput={(event) => setShare(event.currentTarget.value)}
        />
      </div>

      <Show when={status() !== 'idle'}>
        <div class={`status-msg ${status() === 'ok' ? 'status-ok' : 'status-error'}`}>
          {statusMessage()}
        </div>
      </Show>

      <div class="settings-actions">
        <button
          type="button"
          class="btn-secondary"
          onClick={() => void handleTest()}
          disabled={busy()}
        >
          {busy() ? i18n('settings.testingButton') : i18n('settings.testConnectionButton')}
        </button>
        <button type="submit" class="btn">
          {i18n('settings.saveButton')}
        </button>
        <Show when={existing()}>
          <button type="button" class="btn-danger" onClick={() => void handleClear()}>
            {i18n('settings.disconnectNasButton')}
          </button>
        </Show>
      </div>
    </form>
  );
}

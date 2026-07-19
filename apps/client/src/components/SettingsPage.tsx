import { createSignal, onMount, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ChevronLeftIcon } from './ChevronLeftIcon.tsx';
import { HeartIcon } from './HeartIcon.tsx';
import { store, BookStore } from '../store/books.ts';
import { testSMB, fetchServerVersion } from '../lib/api';
import type { SMBConfig } from '@polka/shared';
import { i18n } from '../i18n';

export function SettingsPage() {
  const navigate = useNavigate();
  const existing = store.smb;

  const [serverVersion, setServerVersion] = createSignal<string | null>(null);
  onMount(() => {
    void fetchServerVersion().then(setServerVersion);
  });

  const [serverUrl, setServerUrl] = createSignal(store.serverUrl ?? '');
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
      await testSMB({ config: buildConfig(), serverUrl: serverUrl().trim().replace(/\/+$/, '') });
      setStatus('ok');
      setStatusMsg(i18n('settings.connectionSuccessful'));
    } catch (e) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    const url = serverUrl();
    if (url.trim()) {
      BookStore.saveServerUrl(url);
    } else {
      BookStore.deleteServerUrl();
    }
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
        <button
          class="icon-btn"
          onClick={() => navigate('/')}
          title={i18n('settings.backTooltip')}
          aria-label={i18n('settings.backTooltip')}
        >
          <ChevronLeftIcon />
        </button>
        <h1 class="page-title">{i18n('settings.title')}</h1>
        <div style={{ width: '40px' }} />
      </div>

      <div class="settings-form">
        <div class="field">
          <label>{i18n('settings.serverUrlLabel')}</label>
          <input
            type="url"
            inputmode="url"
            placeholder={i18n('settings.serverUrlPlaceholder')}
            value={serverUrl()}
            onInput={(e) => setServerUrl(e.currentTarget.value)}
          />
          <p class="field-hint">{i18n('settings.serverUrlHint')}</p>
        </div>
        <div class="field">
          <label>{i18n('settings.ipAddressLabel')}</label>
          <input
            type="text"
            inputmode="url"
            placeholder={i18n('settings.ipAddressPlaceholder')}
            value={ip()}
            onInput={(e) => setIp(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>{i18n('settings.portLabel')}</label>
          <input
            type="number"
            inputmode="numeric"
            placeholder={i18n('settings.portPlaceholder')}
            value={port()}
            onInput={(e) => setPort(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>{i18n('settings.usernameLabel')}</label>
          <input
            type="text"
            autocomplete="username"
            placeholder={i18n('settings.usernamePlaceholder')}
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>{i18n('settings.passwordLabel')}</label>
          <input
            type="password"
            autocomplete="current-password"
            placeholder={existing ? i18n('settings.passwordUpdatePlaceholder') : i18n('settings.passwordPlaceholder')}
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label>{i18n('settings.shareNameLabel')}</label>
          <input
            type="text"
            placeholder={i18n('settings.shareNamePlaceholder')}
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
            {busy() ? i18n('settings.testingButton') : i18n('settings.testConnectionButton')}
          </button>
          <button class="btn" onClick={handleSave}>{i18n('settings.saveButton')}</button>
          <Show when={existing}>
            <button class="btn-danger" onClick={handleClear}>{i18n('settings.disconnectNasButton')}</button>
          </Show>
        </div>

        <p class="app-version">
          {i18n('settings.clientVersion', { version: __APP_VERSION__ })}
          {serverVersion() ? ' · ' + i18n('settings.serverVersion', { version: serverVersion()! }) : ''}
        </p>
        <p class="app-credit">
          {i18n('settings.developedWith')} <HeartIcon /> {i18n('settings.developedBy')}
        </p>
        <p class="app-credit">
          <a
            class="app-credit-link"
            href="https://github.com/Beraliv/polka"
            target="_blank"
            rel="noopener noreferrer"
          >
            {i18n('settings.githubLinkLabel')}
          </a>
        </p>
      </div>
    </div>
  );
}

import { createEffect, createMemo, createSignal, onMount, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useNavigate, useParams } from '@solidjs/router';
import { ChevronLeftIcon } from './ChevronLeftIcon.tsx';
import { HeartIcon } from './HeartIcon.tsx';
import { SettingsMenu } from './SettingsMenu.tsx';
import { resolveSettingsPath, settingsNodePath, settingsRoot } from '../settings/tree.ts';
import { fetchServerVersion } from '../lib/api';
import { i18n } from '../i18n';

export function SettingsPage() {
  const navigate = useNavigate();
  const params = useParams<{ path: string }>();

  const segments = createMemo(() => params.path.split('/').filter(Boolean));
  const chain = createMemo(() => resolveSettingsPath(segments()));

  // An unresolvable path (bad bookmark, typo, or segments past a leaf page)
  // falls back to the settings root; redirect so the URL bar matches.
  createEffect(() => {
    if (!chain()) {
      navigate('/settings', { replace: true });
    }
  });

  const resolvedChain = createMemo(() => chain() ?? [settingsRoot]);
  const currentNode = createMemo(() => resolvedChain().at(-1) ?? settingsRoot);
  const groupNode = createMemo(() => {
    const node = currentNode();
    return node.type === 'group' ? node : null;
  });
  const pageNode = createMemo(() => {
    const node = currentNode();
    return node.type === 'page' ? node : null;
  });
  const isRoot = () => (chain()?.length ?? 0) <= 1;

  function goBack() {
    const nodes = chain();
    navigate(!nodes || nodes.length <= 1 ? '/' : settingsNodePath(nodes.slice(0, -1)));
  }

  const [serverVersion, setServerVersion] = createSignal<string | null>(null);
  onMount(() => {
    void fetchServerVersion().then(setServerVersion);
  });

  return (
    <div class="page">
      <div class="page-header">
        <button
          class="icon-btn"
          onClick={goBack}
          title={i18n('settings.backTooltip')}
          aria-label={i18n('settings.backTooltip')}
        >
          <ChevronLeftIcon />
        </button>
        <h1 class="page-title">{i18n(currentNode().labelKey)}</h1>
        <div style={{ width: '40px' }} />
      </div>

      <div class="settings-form">
        <Show when={groupNode()}>
          {(node) => <SettingsMenu node={node()} parentPath={settingsNodePath(resolvedChain())} />}
        </Show>
        <Show when={pageNode()}>{(node) => <Dynamic component={node().component} />}</Show>

        <Show when={isRoot()}>
          <p class="app-version">
            {i18n('settings.clientVersion', { version: __APP_VERSION__ })}
            {serverVersion()
              ? ' · ' + i18n('settings.serverVersion', { version: serverVersion()! })
              : ''}
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
        </Show>
      </div>
    </div>
  );
}

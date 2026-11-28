import { For } from 'solid-js';
import { AI_PROVIDERS } from '@polka/shared';
import { store, BookStore } from '../../store/books.ts';
import { i18n } from '../../i18n';

export function AiProviderSettings() {
  return (
    <>
      <p class="field-hint">{i18n('settings.aiProviderHint')}</p>
      <ul class="settings-menu" role="radiogroup" aria-label={i18n('settings.aiProviderLabel')}>
        <For each={AI_PROVIDERS}>
          {(provider) => (
            <li>
              <label class="settings-menu-item settings-option">
                <span>{provider.name}</span>
                <input
                  type="radio"
                  name="ai-provider"
                  value={provider.code}
                  checked={store.aiProvider === provider.code}
                  onChange={() => BookStore.saveAiProvider(provider.code)}
                />
              </label>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}

import { For } from 'solid-js';
import { EXPLANATION_LANGUAGES } from '@polka/shared';
import { store, BookStore } from '../../store/books.ts';
import { i18n } from '../../i18n';

export function ExplanationSettings() {
  return (
    <>
      <p class="field-hint">{i18n('settings.explanationLanguageHint')}</p>
      <ul class="settings-menu" role="radiogroup" aria-label={i18n('settings.explanationLabel')}>
        <For each={EXPLANATION_LANGUAGES}>
          {(language) => (
            <li>
              <label class="settings-menu-item settings-option" lang={language.code}>
                <span>{language.nativeName}</span>
                <input
                  type="radio"
                  name="explanation-language"
                  value={language.code}
                  checked={store.explanationLanguage === language.code}
                  onChange={() => BookStore.saveExplanationLanguage(language.code)}
                />
              </label>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}

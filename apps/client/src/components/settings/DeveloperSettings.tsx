import { i18n } from '../../i18n';

function handleForceRestart() {
  window.location.reload();
}

export function DeveloperSettings() {
  return (
    <>
      <p class="field-hint">{i18n('settings.forceRestartHint')}</p>
      <div class="settings-actions">
        <button class="btn" onClick={handleForceRestart}>
          {i18n('settings.forceRestartButton')}
        </button>
      </div>
    </>
  );
}

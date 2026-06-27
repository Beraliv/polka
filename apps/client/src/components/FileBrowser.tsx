import { createSignal, For, Show, onMount } from 'solid-js';
import type { SMBConfig, FileEntry } from '@polka/shared';
import { listSMBFiles } from '../lib/api.ts';

type Props = {
  config: SMBConfig;
  onClose: () => void;
  onSelect: (path: string, filename: string) => void;
};

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileBrowser(props: Props) {
  const [currentPath, setCurrentPath] = createSignal('');
  const [entries, setEntries] = createSignal<FileEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

  async function loadDir(path: string) {
    setLoading(true);
    setError('');
    try {
      const files = await listSMBFiles(props.config, path);
      setEntries(
        [...files].sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
      );
      setCurrentPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  onMount(() => { void loadDir(''); });

  function handleEntry(entry: FileEntry) {
    if (entry.isDirectory) {
      void loadDir(entry.path);
    } else if (/\.(epub|fb2)$/i.test(entry.name)) {
      props.onSelect(entry.path, entry.name);
    }
  }

  function goUp() {
    const p = currentPath();
    const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
    void loadDir(idx > 0 ? p.slice(0, idx) : '');
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) props.onClose();
  }

  return (
    <div class="modal-overlay" onClick={handleOverlayClick}>
      <div class="modal">
        <div class="modal-header">
          <Show when={currentPath()}>
            <button class="icon-btn" onClick={goUp} title="Go up">←</button>
          </Show>
          <span class="modal-title">{currentPath() || '/'}</span>
          <button class="icon-btn" onClick={props.onClose} title="Close">✕</button>
        </div>

        <Show when={loading()}>
          <div class="loading-center"><span class="spinner" /></div>
        </Show>

        <Show when={error()}>
          <p class="error-text">{error()}</p>
        </Show>

        <div class="file-list">
          <For each={entries()}>
            {(entry) => {
              const isBook = !entry.isDirectory && /\.(epub|fb2)$/i.test(entry.name);
              const icon = entry.isDirectory ? '📁' : isBook ? '📖' : '📄';
              const dimmed = !entry.isDirectory && !isBook;
              return (
                <div
                  class="file-entry"
                  style={dimmed ? { opacity: '0.35', cursor: 'default' } : {}}
                  onClick={() => handleEntry(entry)}
                >
                  <span class="file-icon">{icon}</span>
                  <span class="file-name">{entry.name}</span>
                  <Show when={entry.size}>
                    <span class="file-size">{formatSize(entry.size)}</span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}

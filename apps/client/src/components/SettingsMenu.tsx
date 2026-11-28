import { createMemo, For } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRightIcon } from './ChevronRightIcon.tsx';
import { isSettingsNodeListed, type SettingsGroupNode } from '../settings/tree.ts';
import { i18n } from '../i18n';

export function SettingsMenu(props: { node: SettingsGroupNode; parentPath: string }) {
  // Memoised so that a page's availability changing (once the server answers)
  // updates the menu.
  const listedChildren = createMemo(() => props.node.children.filter(isSettingsNodeListed));
  return (
    <ul class="settings-menu">
      <For each={listedChildren()}>
        {(child) => (
          <li>
            <A class="settings-menu-item" href={`${props.parentPath}/${child.id}`}>
              <span>{i18n(child.labelKey)}</span>
              <ChevronRightIcon />
            </A>
          </li>
        )}
      </For>
    </ul>
  );
}

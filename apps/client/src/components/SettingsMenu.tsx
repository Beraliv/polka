import { For } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRightIcon } from './ChevronRightIcon.tsx';
import type { SettingsGroupNode } from '../settings/tree.ts';
import { i18n } from '../i18n';

export function SettingsMenu(props: { node: SettingsGroupNode; parentPath: string }) {
  return (
    <ul class="settings-menu">
      <For each={props.node.children}>
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

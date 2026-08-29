import type { Component } from 'solid-js';
import type { KeyWithoutPlaceholders } from '../i18n';
import { NasConfigurationSettings } from '../components/settings/NasConfigurationSettings.tsx';
import { DeveloperSettings } from '../components/settings/DeveloperSettings.tsx';

interface SettingsNodeBase {
  id: string;
  labelKey: KeyWithoutPlaceholders;
}

// A group renders as a list of links to its children. Any child can itself
// be a group, so settings can nest to any depth without touching routing.
export interface SettingsGroupNode extends SettingsNodeBase {
  type: 'group';
  children: SettingsNode[];
}

// A page renders its own component and is always a leaf.
export interface SettingsPageNode extends SettingsNodeBase {
  type: 'page';
  component: Component;
}

export type SettingsNode = SettingsGroupNode | SettingsPageNode;

export const settingsRoot: SettingsGroupNode = {
  type: 'group',
  id: '',
  labelKey: 'settings.title',
  children: [
    {
      type: 'page',
      id: 'nas',
      labelKey: 'settings.nasConfigLabel',
      component: NasConfigurationSettings,
    },
    {
      type: 'page',
      id: 'developer',
      labelKey: 'settings.developerLabel',
      component: DeveloperSettings,
    },
  ],
};

/**
 * Resolves URL path segments (e.g. ['developer']) against the tree, from the
 * root down to the target node. Returns null if any segment doesn't match a
 * child, or if segments continue past a leaf page.
 */
export function resolveSettingsPath(segments: string[]): SettingsNode[] | null {
  const chain: SettingsNode[] = [settingsRoot];
  let current: SettingsNode = settingsRoot;
  for (const segment of segments) {
    if (current.type !== 'group') {
      return null;
    }
    const next: SettingsNode | undefined = current.children.find((child) => child.id === segment);
    if (!next) {
      return null;
    }
    chain.push(next);
    current = next;
  }
  return chain;
}

/** Builds the URL for a chain of nodes from the root, e.g. '/settings/developer'. */
export function settingsNodePath(chain: SettingsNode[]): string {
  const segments = chain.slice(1).map((node) => node.id);
  return ['/settings', ...segments].join('/');
}

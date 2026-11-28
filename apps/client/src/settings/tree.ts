import type { Component } from 'solid-js';
import type { KeyWithoutPlaceholders } from '../i18n';
import { store } from '../store/books.ts';
import { NasConfigurationSettings } from '../components/settings/NasConfigurationSettings.tsx';
import { DeveloperSettings } from '../components/settings/DeveloperSettings.tsx';
import { AiProviderSettings } from '../components/settings/AiProviderSettings.tsx';
import { ExplanationSettings } from '../components/settings/ExplanationSettings.tsx';

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
  // Whether the page is offered: true, false, or null while still unknown.
  // Absent means always offered.
  isAvailable?: () => boolean | null;
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
      id: 'ai-provider',
      labelKey: 'settings.aiProviderLabel',
      component: AiProviderSettings,
      // A choice needs at least two providers; with fewer there is nothing to choose.
      isAvailable: aiProviderCountAvailability(2),
    },
    {
      type: 'page',
      id: 'explanation',
      labelKey: 'settings.explanationLabel',
      component: ExplanationSettings,
      // The language only matters to Explain, which needs an AI provider.
      isAvailable: aiProviderCountAvailability(1),
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
 * Availability of a page that needs at least `minimumCount` AI providers.
 * Null while the server's list is unknown, so the page is not offered yet.
 */
function aiProviderCountAvailability(minimumCount: number): () => boolean | null {
  return () => {
    const providers = store.availableAiProviders;
    return providers === null ? null : providers.length >= minimumCount;
  };
}

function availabilityOf(node: SettingsNode): boolean | null {
  return node.type === 'page' && node.isAvailable ? node.isAvailable() : true;
}

/** Listed in the menu only when known to be available, so an unknown page is not offered. */
export function isSettingsNodeListed(node: SettingsNode): boolean {
  return availabilityOf(node) === true;
}

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
    // Only a page known to be unavailable is refused. An unknown one resolves,
    // so a bookmark still works while the startup fetch is in flight.
    if (!next || availabilityOf(next) === false) {
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

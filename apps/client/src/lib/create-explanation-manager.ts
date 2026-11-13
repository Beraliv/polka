import { createSignal, onCleanup } from 'solid-js';
import { ExplanationManager } from './explanation-manager.ts';

/**
 * Solid binding for ExplanationManager: mirrors its explanation into a signal
 * and, when the owning component unmounts, unsubscribes and cancels any
 * request still streaming.
 */
export function createExplanationManager() {
  const manager = new ExplanationManager();
  const [explanation, setExplanation] = createSignal(manager.explanation);

  const unsubscribe = manager.subscribe(setExplanation);
  onCleanup(() => {
    unsubscribe();
    manager.close();
  });

  return {
    explanation,
    closeExplanation: manager.close.bind(manager),
    explain: manager.explain.bind(manager),
  };
}

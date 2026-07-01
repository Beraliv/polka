import { render } from 'solid-js/web';
import { Router } from '@solidjs/router';
import { App } from './App.tsx';
import { initProgress } from './lib/progress.ts';
import './styles.css';

const root = document.getElementById('app')!;

initProgress().then(() => {
  render(() => <Router><App /></Router>, root);
});

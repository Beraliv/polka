import { render } from 'solid-js/web';
import { Router } from '@solidjs/router';
import { App } from './App.tsx';
import './styles.css';

const root = document.getElementById('app')!;
render(() => <Router><App /></Router>, root);

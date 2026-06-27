import { Route } from '@solidjs/router';
import { HomePage } from './components/HomePage.tsx';
import { ReaderPage } from './components/ReaderPage.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';

export function App() {
  return (
    <>
      <Route path="/" component={HomePage} />
      <Route path="/reader/:id" component={ReaderPage} />
      <Route path="/settings" component={SettingsPage} />
    </>
  );
}

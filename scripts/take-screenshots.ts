// Regenerates the README screenshots in docs/screenshots. See
// docs/screenshots.md for setup and usage.
//
// Every /api request is answered in the browser with made-up data, so no
// server, NAS, credentials or Anthropic API key is involved, and nothing
// private can end up in an image.

import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page, type Route } from 'playwright';

const repoRoot = join(import.meta.dirname, '..');
const screenshotsDir = join(repoRoot, 'docs', 'screenshots');
// Public-domain books committed with the script; see books/README.md for
// where they come from.
const booksDir = join(import.meta.dirname, 'books');
const fb2BookPath = join(booksDir, 'anna-karenina.fb2');
const epubBookPath = join(booksDir, 'pride-and-prejudice.epub');

const devServerPort = 5199;
const appUrl = `http://localhost:${devServerPort}`;

// iPhone 12–15 viewport at 3x, matching earlier screenshots (1170×2532).
const phoneViewport = { width: 390, height: 844 };
const phoneScale = 3;

const fakeNasConfig = { ip: '192.168.1.20', port: 445, username: 'reader', share: 'books' };

const fakeNasFolders: Record<string, { name: string; isDirectory: boolean; size?: number }[]> = {
  '': [
    { name: 'en', isDirectory: true },
    { name: 'ru', isDirectory: true },
  ],
};

const chatQuestion = 'Translate "Все счастливые семьи похожи друг на друга" into English';
const chatReply =
  'All happy families are alike; each unhappy family is unhappy in its own way. ' +
  "It's the opening line of Anna Karenina by Leo Tolstoy.";

async function readVersion(app: 'client' | 'server'): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'apps', app, 'package.json'), 'utf-8'),
  ) as { version: string };
  return packageJson.version;
}

function toServerSentEvents(events: object[]): string {
  return events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join('');
}

async function answerApiRequest(route: Route, serverVersion: string) {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();

  if (path === '/api/version') {
    return route.fulfill({ json: { version: serverVersion } });
  }
  if (path === '/api/smb/config' && method === 'GET') {
    return route.fulfill({ json: fakeNasConfig });
  }
  if (path === '/api/smb/files') {
    const { path: folderPath } = (request.postDataJSON() ?? {}) as { path?: string };
    const entries = (fakeNasFolders[folderPath ?? ''] ?? []).map((entry) => ({
      ...entry,
      path: folderPath ? `${folderPath}/${entry.name}` : entry.name,
    }));
    return route.fulfill({ json: entries });
  }
  if (path.startsWith('/api/progress')) {
    return method === 'POST'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 404, json: { error: 'not found' } });
  }
  if (path === '/api/chat') {
    return route.fulfill({
      headers: { 'Content-Type': 'text/event-stream' },
      body: toServerSentEvents([
        { type: 'block_start', block: { type: 'text', text: '' } },
        { type: 'text_delta', text: chatReply },
        { type: 'message_end', stopReason: 'end_turn' },
      ]),
    });
  }
  return route.fulfill({ status: 404, json: { error: `No fake response for ${method} ${path}` } });
}

async function startDevServer(): Promise<ChildProcess> {
  const devServer = spawn(
    'pnpm',
    ['exec', 'vite', '--port', String(devServerPort), '--strictPort'],
    { cwd: join(repoRoot, 'apps', 'client'), stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(appUrl);
      return devServer;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  devServer.kill();
  throw new Error(`Dev server did not start on ${appUrl}`);
}

// Fonts, cover images and page layout settle a moment after the DOM does.
// After a scripted click the mouse stays where it clicked, leaving a hover
// highlight (e.g. on a NAS folder), and the clicked button keeps a focus ring.
// A person tapping a phone sees neither, so both are cleared.
async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function capture({ page, name }: { page: Page; name: string }) {
  await settle(page);
  const clientVersion = await readVersion('client');
  const filePath = join(screenshotsDir, `${name}-${clientVersion}.png`);
  await page.screenshot({ path: filePath });
  console.log(`saved ${filePath}`);
}

async function addBookFromDevice({ page, bookPath }: { page: Page; bookPath: string }) {
  await page.goto(appUrl);
  await page.locator('input[type="file"]').setInputFiles(bookPath);
  await page.waitForURL(/\/reader\//);
  await page.locator('.reader-page-info').waitFor();
}

// Jumps to a fixed chapter so every run shows the same page. Chapter titles can
// repeat when each part restarts its numbering, so the first match wins.
async function jumpToChapter({ page, title }: { page: Page; title: RegExp }) {
  await page.getByRole('button', { name: 'Table of contents' }).click();
  // Matched on the title alone: the entry's full text also ends with its page
  // number.
  await page
    .locator('.toc-entry')
    .filter({ has: page.locator('.toc-entry-title', { hasText: title }) })
    .first()
    .click();
  await page.locator('.toc-overlay').waitFor({ state: 'detached' });
}

// Footnote links render with zero height, so Playwright's visibility checks
// treat them as hidden; their position on screen is used instead.
async function findOnScreenFootnoteIndex(page: Page): Promise<number> {
  return page.locator('.footnote-ref').evaluateAll((links) =>
    links.findIndex((link) => {
      const rect = link.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth &&
        rect.top >= 0 &&
        rect.top <= window.innerHeight
      );
    }),
  );
}

async function openFootnoteOnCurrentOrLaterPage(page: Page) {
  for (let turnedPages = 0; turnedPages < 50; turnedPages += 1) {
    const footnoteIndex = await findOnScreenFootnoteIndex(page);
    if (footnoteIndex !== -1) {
      // A real click needs a non-empty box to aim at, so the click event is
      // dispatched directly.
      await page.locator('.footnote-ref').nth(footnoteIndex).dispatchEvent('click');
      return;
    }
    await page.keyboard.press('ArrowRight');
  }
  throw new Error('No footnote found within 50 pages');
}

async function main() {
  const serverVersion = await readVersion('server');
  const devServer = await startDevServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: phoneViewport,
      deviceScaleFactor: phoneScale,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'dark',
    });
    // Matched on the path prefix rather than a `**/api/**` glob, which would
    // also catch the dev server's source modules under src/lib/api/.
    await context.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => answerApiRequest(route, serverVersion),
    );
    const page = await context.newPage();

    await page.goto(appUrl);
    await page.locator('.empty-state').waitFor();
    await capture({ page, name: 'HomePage' });

    await addBookFromDevice({ page, bookPath: epubBookPath });
    // In this edition the title starts with an illustration caption:
    // "“Protested he must be entirely mistaken.” CHAPTER XXIII."
    await jumpToChapter({ page, title: /\bCHAPTER XXIII\.$/ });
    await capture({ page, name: 'ReaderPage-epub' });

    await addBookFromDevice({ page, bookPath: fb2BookPath });
    // Part 1, Chapter X, which has footnotes translating French phrases.
    await jumpToChapter({ page, title: /^X\.$/ });
    await capture({ page, name: 'ReaderPage-fb2' });

    await page.getByRole('button', { name: 'Table of contents' }).click();
    await page.locator('.toc-entry.active').waitFor();
    await capture({ page, name: 'ReaderPageWithContents-fb2' });
    await page.keyboard.press('Escape');

    await openFootnoteOnCurrentOrLaterPage(page);
    await capture({ page, name: 'ReaderPageWithFootnote-fb2' });
    await page.keyboard.press('Escape');

    await page.goto(appUrl);
    await page.locator('.shelf').first().waitFor();
    await capture({ page, name: 'HomePageWithFiles' });

    await page.getByRole('button', { name: 'Add from NAS' }).click();
    await page.getByText('ru', { exact: true }).waitFor();
    await capture({ page, name: 'HomePageWithNasNavigation' });

    for (const settingsPath of ['', 'nas', 'developer']) {
      await page.goto(`${appUrl}/settings/${settingsPath}`);
      await page.locator('.page-title').waitFor();
      await capture({ page, name: `SettingsPage-${settingsPath || 'root'}` });
    }

    await page.goto(`${appUrl}/chat`);
    await page.locator('.chat-textarea').fill(chatQuestion);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText(chatReply).waitFor();
    await capture({ page, name: 'ChatPage' });
  } finally {
    await browser.close();
    devServer.kill();
  }
}

await main();

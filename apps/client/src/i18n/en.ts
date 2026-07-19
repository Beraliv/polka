/**
 * Every user-facing phrase in the client, grouped by the page or component
 * that renders it. This is the single source for copy: components must not
 * contain hard-coded user-facing strings.
 *
 * All values are plain strings. `$name` placeholders (e.g. `$currentPage`)
 * are substituted by `i18n(key, options)` from the options object, so each
 * language controls its own word order.
 *
 * Keys used exclusively as `aria-label`s carry an `aria` prefix.
 */
export const en = {
  home: {
    appTitle: 'Polka',
    settingsTooltip: 'Settings',
    emptyStateText: 'No books yet — tap "$addFromDevice" or "$addFromNas" to add one',
    readingShelfHeading: 'Reading',
    finishedShelfHeading: 'Finished',
    addFromNasButton: 'Add from NAS',
    addFromDeviceButton: 'Add from device',
    unsupportedFormatError: 'Only EPUB and FB2 files are supported',
    missingSmbConfigError:
      'No SMB configuration found. Add your NAS credentials in Settings and re-open this book to continue reading',
    missingSmbPathError: 'Re-open this book using "$addFromDevice" or "$addFromNas" to continue reading',
  },
  bookCard: {
    redownloadTooltip: 'Tap to re-download from NAS',
    removeTooltip: 'Remove',
    finished: 'Finished',
    pageOfTotal: 'Page $currentPage of $totalPages',
    totalPages: '$totalPages pages',
  },
  icons: {
    ariaHeartLabel: 'love',
  },
  fileBrowser: {
    goUpTooltip: 'Go up',
    closeTooltip: 'Close',
    sizeKilobytes: '$kilobytes KB',
    sizeMegabytes: '$megabytes MB',
  },
  reader: {
    backTooltip: 'Back',
    goToPageTooltip: 'Go to page',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    closeTooltip: 'Close',
    ariaCloseFullscreenImage: 'Close full screen image',
    ariaCloseNote: 'Close footnote',
  },
  settings: {
    title: 'NAS Settings',
    backTooltip: 'Back',
    serverUrlLabel: 'Server URL',
    serverUrlPlaceholder: 'http://192.168.1.100:3000',
    serverUrlHint:
      'Address of your self-hosted Polka server. Leave blank when the app is served from the same server.',
    ipAddressLabel: 'IP Address',
    ipAddressPlaceholder: '192.168.1.100',
    portLabel: 'Port',
    portPlaceholder: '445',
    usernameLabel: 'Username',
    usernamePlaceholder: 'username',
    passwordLabel: 'Password',
    passwordPlaceholder: 'password',
    passwordUpdatePlaceholder: '(re-enter to update)',
    shareNameLabel: 'Share Name',
    shareNamePlaceholder: 'books',
    connectionSuccessful: 'Connection successful',
    testConnectionButton: 'Test Connection',
    testingButton: 'Testing…',
    saveButton: 'Save',
    disconnectNasButton: 'Disconnect NAS',
    clientVersion: 'Polka client v$version',
    serverVersion: 'server v$version',
    developedWith: 'developed with',
    developedBy: 'by Alexey',
    githubLinkLabel: 'GitHub',
  },
} as const;

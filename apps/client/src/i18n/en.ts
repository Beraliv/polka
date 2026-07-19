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
    addFromDeviceButton: 'Add from device',
    addFromNasButton: 'Add from NAS',
    appTitle: 'Polka',
    emptyStateText: 'No books yet — tap "$addFromDevice" or "$addFromNas" to add one',
    finishedShelfHeading: 'Finished',
    missingSmbConfigError: 'No SMB configuration found. Add your NAS credentials in Settings and re-open this book to continue reading',
    missingSmbPathError: 'Re-open this book using "$addFromDevice" or "$addFromNas" to continue reading',
    readingShelfHeading: 'Reading',
    settingsTooltip: 'Settings',
    unsupportedFormatError: 'Only EPUB and FB2 files are supported',
  },
  bookCard: {
    coverAlt: 'Cover of $bookName',
    finished: 'Finished',
    pageOfTotal: 'Page $currentPage of $totalPages',
    redownloadTooltip: 'Tap to re-download from NAS',
    removeTooltip: 'Remove',
    totalPages: '$totalPages pages',
  },
  icons: {
    ariaHeartLabel: 'love',
  },
  fileBrowser: {
    closeTooltip: 'Close',
    goUpTooltip: 'Go up',
    sizeKilobytes: '$kilobytes KB',
    sizeMegabytes: '$megabytes MB',
  },
  reader: {
    ariaCloseFullscreenImage: 'Close full screen image',
    ariaCloseNote: 'Close footnote',
    ariaCloseToc: 'Close table of contents',
    backTooltip: 'Back',
    closeTooltip: 'Close',
    nextPage: 'Next page',
    pageSliderLabel: 'Go to page',
    previousPage: 'Previous page',
    tocTitle: 'Contents',
    tocTooltip: 'Table of contents',
  },
  settings: {
    backTooltip: 'Back',
    clientVersion: 'Polka client v$version',
    connectionSuccessful: 'Connection successful',
    developedBy: 'by Alexey',
    developedWith: 'developed with',
    disconnectNasButton: 'Disconnect NAS',
    githubLinkLabel: 'GitHub',
    ipAddressLabel: 'IP Address',
    ipAddressPlaceholder: '192.168.1.100',
    passwordLabel: 'Password',
    passwordPlaceholder: 'password',
    passwordUpdatePlaceholder: '(re-enter to update)',
    portLabel: 'Port',
    portPlaceholder: '445',
    saveButton: 'Save',
    serverUrlHint: 'Address of your self-hosted Polka server. Leave blank when the app is served from the same server.',
    serverUrlLabel: 'Server URL',
    serverUrlPlaceholder: 'http://192.168.1.100:3000',
    serverVersion: 'server v$version',
    shareNameLabel: 'Share Name',
    shareNamePlaceholder: 'books',
    testConnectionButton: 'Test Connection',
    testingButton: 'Testing…',
    title: 'NAS Settings',
    usernameLabel: 'Username',
    usernamePlaceholder: 'username',
  },
} as const;

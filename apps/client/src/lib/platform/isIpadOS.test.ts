// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { isIpadOS, NavigatorLike } from './';
import { GOOGLE_PIXEL_CHROME, IPAD_OS_SAFARI, IPHONE_SAFARI, IPOD_SAFARI, MACOS_SAFARI } from './userAgents'

type TestCase = {
  description: string;
  navigator: NavigatorLike;
  expected: boolean;
};

const testCases: TestCase[] = [
  {
    description: 'returns true for iPadOS Safari (reports as a desktop Mac, but has touch support)',
    navigator: IPAD_OS_SAFARI,
    expected: true,
  },
  {
    description: 'returns false for iOS Safari on iPhone',
    navigator: IPHONE_SAFARI,
    expected: false,
  },
  {
    description: 'returns false for iOS Safari on iPod',
    navigator: IPOD_SAFARI,
    expected: false,
  },
  {
    description: 'returns false for macOS Safari on a desktop without touch support',
    navigator: MACOS_SAFARI,
    expected: false,
  },
  {
    description: 'returns false for Android Chrome',
    navigator: GOOGLE_PIXEL_CHROME,
    expected: false,
  },
];

describe('isIpadOS', () => {
  for (const testCase of testCases) {
    it(testCase.description, () => {
      const actual = isIpadOS(testCase.navigator);
      expect(actual).toBe(testCase.expected);
    });
  }
});

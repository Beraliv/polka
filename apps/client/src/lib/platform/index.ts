export type NavigatorLike = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>;

export function isIpadOS(nav: NavigatorLike = navigator): boolean {
  return /iPad/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

export function isIOS(nav: NavigatorLike = navigator): boolean {
  return /iPhone|iPod/.test(nav.userAgent);
}
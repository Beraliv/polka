import { NavigatorLike } from ".";

export const IPAD_OS_SAFARI: NavigatorLike = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
};

export const IPHONE_SAFARI: NavigatorLike = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
};

export const IPOD_SAFARI: NavigatorLike = {
    userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 10_3_2 like Mac OS X) AppleWebKit/603.2.4 (KHTML, like Gecko) Version/10.0 Mobile/14F89 Safari/602.1',
    platform: 'iPod',
    maxTouchPoints: 5,
};

export const MACOS_SAFARI: NavigatorLike = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 0,
};

export const GOOGLE_PIXEL_CHROME: NavigatorLike = {
    userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/CP1A.260505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.7871.124 Mobile Safari/537.36',
    platform: '',
    maxTouchPoints: 5,
};
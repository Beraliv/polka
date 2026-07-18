import { en } from './en.ts';

/**
 * Structural type every language dictionary must match: the same groups and
 * keys as the English source, every value a string. English is the source of
 * truth for `$name` placeholders, so translated phrases must reuse the same
 * placeholder names.
 */
type DictionaryShape<Dictionary> = {
  [Group in keyof Dictionary]: {
    [Key in keyof Dictionary[Group]]: string;
  };
};

export type Translations = DictionaryShape<typeof en>;

/** Union of all dotted paths to a phrase, e.g. 'home.appTitle'. */
export type TranslationKey = {
  [Group in keyof typeof en & string]: `${Group}.${keyof (typeof en)[Group] & string}`;
}[keyof typeof en & string];

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/**
 * True for letters and digits — the characters a placeholder name is made of.
 * A letter is a character that changes between Uppercase and Lowercase. The
 * explicit Digit union is needed because `' ' extends `${number}`` is true
 * (whitespace strings are assignable to `${number}`).
 */
type IsWordCharacter<Character extends string> =
  Character extends Digit
    ? true
    : Uppercase<Character> extends Lowercase<Character>
      ? false
      : true;

/** Splits Text into its leading run of word characters and the rest. */
type SplitLeadingWord<Text extends string, Name extends string = ''> =
  Text extends `${infer Character}${infer Rest}`
    ? IsWordCharacter<Character> extends true
      ? SplitLeadingWord<Rest, `${Name}${Character}`>
      : [Name, Text]
    : [Name, Text];

/** Union of `$name` placeholder names in Template; never when there are none. */
type PlaceholderNames<Template extends string> =
  Template extends `${string}$${infer AfterDollar}`
    ? SplitLeadingWord<AfterDollar> extends [infer Name extends string, infer Rest extends string]
      ? (Name extends '' ? never : Name) | PlaceholderNames<Rest>
      : never
    : never;

/** The English template text behind a dotted key */
type TemplateOf<Key extends TranslationKey> =
  Key extends `${infer Group}.${infer Name}`
    ? Group extends keyof typeof en
      ? Name extends keyof (typeof en)[Group]
        ? (typeof en)[Group][Name] & string
        : never
      : never
    : never;

/** Keys whose template contains at least one `$name` placeholder. */
type KeyWithPlaceholders = {
  [Key in TranslationKey]: [PlaceholderNames<TemplateOf<Key>>] extends [never] ? never : Key;
}[TranslationKey];

type KeyWithoutPlaceholders = Exclude<TranslationKey, KeyWithPlaceholders>;

export type TranslationOptions<Key extends KeyWithPlaceholders> = {
  [Name in PlaceholderNames<TemplateOf<Key>>]: string | number;
};

/**
 * The dictionary the app renders. Only English is supported for now; to add
 * a language later, create a sibling dictionary file typed as `Translations`
 * and select it here (e.g. from a language setting or `navigator.language`).
 */
const activeDictionary: Record<string, Record<string, string>> = en;

const PLACEHOLDER_PATTERN = /\$([A-Za-z][A-Za-z0-9]*)/g;

/**
 * Looks up a phrase by its dotted key and substitutes `$name` placeholders
 * from `options`. Keys whose template has placeholders require the matching
 * options object; keys without placeholders forbid it. An unknown key falls
 * back to the key itself.
 */
export function i18n<Key extends KeyWithoutPlaceholders>(key: Key): string;
export function i18n<Key extends KeyWithPlaceholders>(key: Key, options: TranslationOptions<Key>): string;
export function i18n(key: string, options?: Record<string, string | number>): string {
  const [groupName, phraseName] = key.split('.');
  const template = activeDictionary[groupName ?? '']?.[phraseName ?? ''];
  if (template === undefined) return key;
  if (!options) return template;
  return template.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) =>
    name in options ? String(options[name]) : placeholder,
  );
}

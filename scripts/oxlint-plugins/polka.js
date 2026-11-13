// Project-specific lint rules, loaded through `jsPlugins` in .oxlintrc.json.
// Oxlint runs ESLint-compatible plugins, so each rule is a standard ESLint
// rule object.

// Class members that can carry TypeScript's `accessibility` modifier.
const MEMBER_NODE_TYPES = [
  'PropertyDefinition',
  'MethodDefinition',
  'AccessorProperty',
  'TSParameterProperty',
  'TSAbstractPropertyDefinition',
  'TSAbstractMethodDefinition',
  'TSAbstractAccessorProperty',
];

const noPrivateKeyword = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow TypeScript's `private` modifier in favour of JavaScript #private members",
    },
    messages: {
      usePrivateField:
        'Use a JavaScript #private member instead of the TypeScript `private` modifier — see specs/javascript-typescript.md.',
    },
    schema: [],
  },
  create(context) {
    function reportIfPrivate(node) {
      if (node.accessibility === 'private') {
        context.report({ node, messageId: 'usePrivateField' });
      }
    }
    return Object.fromEntries(MEMBER_NODE_TYPES.map((nodeType) => [nodeType, reportIfPrivate]));
  },
};

export default {
  meta: { name: 'polka' },
  rules: { 'no-private-keyword': noPrivateKeyword },
};

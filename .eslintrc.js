const rules = require('./.eslintrc.rules.js')

module.exports = {
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    'standard' // Out of the box StandardJS rules
  ],
  parserOptions: {
    ecmaVersion: 2018,  // Allows for the parsing of modern ECMAScript features
    sourceType: 'module',  // Allows for the use of imports
    project: './tsconfig.json', // Required to have rules that rely on Types.
    tsconfigRootDir: './'
  },
  plugins: [
    '@typescript-eslint' // Let's us override rules below.
  ],
  rules,
};

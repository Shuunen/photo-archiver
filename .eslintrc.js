const rules = require('./.eslintrc.rules.js')

module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'plugin:unicorn/recommended',
    'standard-with-typescript',
  ],
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['unicorn'],
  rules,
}

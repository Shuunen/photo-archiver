const rules = require('./.eslintrc.rules.js')

module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'standard-with-typescript',
  ],
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: [],
  rules,
}

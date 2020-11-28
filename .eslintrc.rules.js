/*
  Custom rules for this project
*/
module.exports = {
  '@typescript-eslint/no-use-before-define': 'off', // Allows us to hoist variables and functions which I am a fan of, functions not variables that is.
  '@typescript-eslint/member-delimiter-style': ['error', { // Prevents us from using any delimiter for interface properties.
    multiline: {
      delimiter: 'none',
      requireLast: false,
    },
    singleline: {
      delimiter: 'comma',
      requireLast: false,
    },
  }],
  '@typescript-eslint/indent': 'off', // This is the job of StandardJS, they are competing rules so we turn off the Typescript one.
  'no-unused-vars': 'off', // On the fence about using this one, sometimes we import a package that is never used directly.
  'node/no-unsupported-features/es-syntax': 'off', // Allows us to use Import and Export keywords
  'no-console': 'off',
  'comma-dangle': ['error', 'always-multiline'],
}

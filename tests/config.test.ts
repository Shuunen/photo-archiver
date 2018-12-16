import Config, { defaults } from '../src/config'

test('should get default config', () => {
  expect(Config.compress).toBe(defaults.compress)
  expect(Config.forceSsim).toBe(defaults.forceSsim)
  expect(Config.marker).toBe(defaults.marker)
  expect(Config.overwrite).toBe(defaults.overwrite)
  expect(Config.path).toBe(defaults.path)
  expect(Config.processOne).toBe(defaults.processOne)
  expect(Config.questions).toBe(defaults.questions)
  expect(Config.verbose).toBe(defaults.verbose)
})

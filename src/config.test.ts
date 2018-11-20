import Config, { defaults } from './config'

test('should get only defaults without params', () => {
  const conf = new Config()
  expect(conf.compress).toBe(defaults.compress)
  expect(conf.forceSsim).toBe(defaults.forceSsim)
  expect(conf.marker).toBe(defaults.marker)
  expect(conf.overwrite).toBe(defaults.overwrite)
  expect(conf.path).toBe(defaults.path)
  expect(conf.processOne).toBe(defaults.processOne)
  expect(conf.questions).toBe(defaults.questions)
  expect(conf.verbose).toBe(defaults.verbose)
})

test('should get only defaults and params', () => {
  const conf = new Config(['--verbose'])
  expect(conf.compress).toBe(defaults.compress)
  expect(conf.forceSsim).toBe(defaults.forceSsim)
  expect(conf.marker).toBe(defaults.marker)
  expect(conf.overwrite).toBe(defaults.overwrite)
  expect(conf.path).toBe(defaults.path)
  expect(conf.processOne).toBe(defaults.processOne)
  expect(conf.questions).toBe(defaults.questions)
  // passing --verbose is like verbose=true
  expect(conf.verbose).toBe(true)
})

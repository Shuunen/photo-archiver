/* global describe, test, expect, beforeEach */

import Config, { defaults } from '../src/config'

describe('default config', () => {
  test('should get default values', () => {
    expect(Config.compress).toBe(defaults.compress)
    expect(Config.forceSsim).toBe(defaults.forceSsim)
    expect(Config.marker).toBe(defaults.marker)
    expect(Config.overwrite).toBe(defaults.overwrite)
    expect(Config.path).toBe(defaults.path)
    expect(Config.processOne).toBe(defaults.processOne)
    expect(Config.questions).toBe(defaults.questions)
    expect(Config.reArchive).toBe(defaults.reArchive)
    expect(Config.silent).toBe(defaults.silent)
    expect(Config.verbose).toBe(defaults.verbose)
  })
})

describe('custom config', () => {
  beforeEach(() => {
    Config.set({ overwrite: true })
  })

  test('should edit values', () => {
    expect(Config.overwrite).toBe(true)
  })
})

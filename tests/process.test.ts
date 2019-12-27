/* global beforeEach, jest, test, expect */

import Config from '../src/config'
import Stats from '../src/stats'
import { startProcess } from '../src'

beforeEach(() => {
  jest.setTimeout(30000)
  Config.set({ overwrite: false, reArchive: true, silent: true })
  return startProcess()
})

test('tests photos should always be processed the same way', () => {
  expect(Config.reArchive).toBe(true)

  expect(Stats.photoProcess.success).toBe(9)
  expect(Stats.photoProcess.skip).toBe(0)
  expect(Stats.photoProcess.fail).toBe(0)

  expect(Stats.compress.success).toBe(5)
  expect(Stats.compress.skip).toBe(2)
  expect(Stats.compress.fail).toBe(2)

  expect(Stats.dateFix1.success).toBe(7)
  expect(Stats.dateFix1.skip).toBe(2)
  expect(Stats.dateFix1.fail).toBe(0)

  expect(Stats.dateFix2.success).toBe(0)
  expect(Stats.dateFix2.skip).toBe(9)
  expect(Stats.dateFix2.fail).toBe(0)

  expect(Stats.exifRepair1.success).toBe(6)
  expect(Stats.exifRepair1.skip).toBe(2)
  expect(Stats.exifRepair1.fail).toBe(1)

  expect(Stats.exifRepair2.success).toBe(0)
  expect(Stats.exifRepair2.skip).toBe(9)
  expect(Stats.exifRepair2.fail).toBe(0)

  expect(Stats.readDir.success).toBe(2)
  expect(Stats.readDir.skip).toBe(0)
  expect(Stats.readDir.fail).toBe(1)
})

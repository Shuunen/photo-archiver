/* global beforeEach, jest, test, expect */

import { startProcess } from '../src'
import Config from '../src/config'
import Stats from '../src/stats'

beforeEach(async () => {
  jest.setTimeout(20000)
  Config.set({ overwrite: false, reArchive: true, silent: true })
  return await startProcess()
})

test('tests photos should always be processed the same way', () => {
  const windows = process.platform === 'win32'
  expect(Config.reArchive).toBe(true)

  if (windows) {
    expect(Stats.photoProcess.success).toBe(9)
    expect(Stats.photoProcess.skip).toBe(0)
    expect(Stats.photoProcess.fail).toBe(0)
  } else {
    expect(Stats.photoProcess.success).toBe(6)
    expect(Stats.photoProcess.skip).toBe(0)
    expect(Stats.photoProcess.fail).toBe(0)
  }

  if (windows) {
    expect(Stats.compress.success).toBe(4)
    expect(Stats.compress.skip).toBe(2)
    expect(Stats.compress.fail).toBe(3)
  } else {
    expect(Stats.compress.success).toBe(3)
    expect(Stats.compress.skip).toBe(1)
    expect(Stats.compress.fail).toBe(2)
  }

  if (windows) {
    expect(Stats.dateFix1.success).toBe(6)
    expect(Stats.dateFix1.skip).toBe(3)
    expect(Stats.dateFix1.fail).toBe(0)
  } else {
    expect(Stats.dateFix1.success).toBe(5)
    expect(Stats.dateFix1.skip).toBe(0)
    expect(Stats.dateFix1.fail).toBe(1)
  }

  if (windows) {
    expect(Stats.dateFix2.success).toBe(0)
    expect(Stats.dateFix2.skip).toBe(9)
    expect(Stats.dateFix2.fail).toBe(0)
  } else {
    expect(Stats.dateFix2.success).toBe(0)
    expect(Stats.dateFix2.skip).toBe(5)
    expect(Stats.dateFix2.fail).toBe(1)
  }

  if (windows) {
    expect(Stats.exifRepair1.success).toBe(5)
    expect(Stats.exifRepair1.skip).toBe(2)
    expect(Stats.exifRepair1.fail).toBe(2)
  } else {
    expect(Stats.exifRepair1.success).toBe(0)
    expect(Stats.exifRepair1.skip).toBe(6)
    expect(Stats.exifRepair1.fail).toBe(0)
  }

  if (windows) {
    expect(Stats.exifRepair2.success).toBe(0)
    expect(Stats.exifRepair2.skip).toBe(9)
    expect(Stats.exifRepair2.fail).toBe(0)
  } else {
    expect(Stats.exifRepair2.success).toBe(0)
    expect(Stats.exifRepair2.skip).toBe(6)
    expect(Stats.exifRepair2.fail).toBe(0)
  }

  if (windows) {
    expect(Stats.readDir.success).toBe(2)
    expect(Stats.readDir.skip).toBe(0)
    expect(Stats.readDir.fail).toBe(1)
  } else {
    expect(Stats.readDir.success).toBe(2)
    expect(Stats.readDir.skip).toBe(0)
    expect(Stats.readDir.fail).toBe(0)
  }
})

import { exec } from 'child_process'
import * as ExifTool from 'exiftool-vendored'
import { readdirSync, statSync } from 'fs'
import * as globby from 'globby'
import { basename, posix, resolve as pathResolve } from 'path'
import * as ProgressBar from 'progress'
import { dateToIsoString } from 'shuutils'
import Config from './config'
import Logger from './logger'
import Stat from './stat' // eslint-disable-line no-unused-vars
import Stats from './stats'
import { DirInfos, PhotoPath, PhotoSet } from './types' // eslint-disable-line no-unused-vars
import Utils from './utils'

const exiftoolExe = pathResolve('node_modules/exiftool-vendored.exe/bin/exiftool')
const jpegRecompress = pathResolve('bin/jpeg-recompress')
const dirs: PhotoSet = []

function getDirectories (path: string): PhotoSet {
  return readdirSync(path).filter((file) => {
    return statSync(path + '/' + file).isDirectory()
  })
}

function getDirs (): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!Config.path) {
      reject(new Error('No path found in config'))
    }
    const path = Config.path || '.'
    getDirectories(path).map((dir) => {
      // dir will be successively 2013, 2014,...
      const subDir = posix.join(path, dir)
      Logger.info('dir', dir)
      Logger.info('subDir', subDir)
      if (dir.length === 4) {
        // like a year 2018 that contains sub-folders
        getDirectories(subDir).forEach((sub) => dirs.push(posix.join(subDir, sub)))
      } else {
        dirs.push(subDir)
      }
    })
    // if no sub-dir, just process input dir
    if (!dirs.length) {
      dirs.push(path)
    }
    Logger.info('found dir(s)', Utils.readableDirs(dirs, Config.path))
    resolve('success')
  })
}

function markFilepath (filepath: PhotoPath): PhotoPath {
  return filepath.replace(/(?<filepathWithoutExt>.*)\.(?<fileExt>[a-zA-Z]{2,4})$/, (...args) => {
    const { filepathWithoutExt, fileExt } = args[args.length - 1]
    return `${filepathWithoutExt}${Config.marker}.${fileExt}`
  })
}

function compress (prefix: string, photo: PhotoPath, method = 'ssim', failAlreadyCount = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!Config.compress) {
      Stats.compress.skip++
      return resolve('avoiding compression (config)')
    }
    let methodToUse = method
    if (Config.forceSsim) {
      methodToUse = 'ssim'
    }
    let message = 'compressing via ' + methodToUse
    Logger.info({ prefix, message })
    const command = jpegRecompress + ` --method ${methodToUse} "${photo}" "${photo}"`
    // Logger.info('executing command :', command)
    exec(command, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        if (!failAlreadyCount) {
          Stats.compress.fail++
          Stats.compress.failedPaths.push(photo)
        }
        reject(err)
      } else {
        // the *entire* stdout and stderr (buffered)
        // Logger.info({ prefix, message : `stdout: ${stdout}`})
        // Logger.info({ prefix, message : `stderr: ${stderr}`})
        if (stderr.toString().indexOf('already processed') !== -1) {
          Stats.compress.skip++
          message = 'success (already processed)'
          Logger.info({ prefix, message })
        } else if (stderr.toString().indexOf('would be larger') !== -1) {
          Stats.compress.skip++
          message = 'aborted (output file would be larger than input)'
          Logger.info({ prefix, message })
        } else {
          Stats.compress.success++
          if (failAlreadyCount) {
            // if previous compression failed and this one worked out
            // remove last failed metric
            Stats.compress.fail--
            Stats.compress.failedPaths.pop()
          }
          message = 'success, compressed'
          Logger.success({ prefix, message })
        }
        resolve(message)
      }
    })
  })
}

function zeroIfNeeded (date: number | string): string {
  let dateStr = date + ''
  if (dateStr.length === 1) {
    dateStr = '0' + dateStr
  }
  return dateStr
}

function getDateFromTags (prefix: string, tags: ExifTool.Tags): Date | null {
  // to avoid errors from ExifTool.Tags class instance
  const data = JSON.parse(JSON.stringify(tags))
  /*
  Logger.info('  ModifyDate :', data.ModifyDate)
  Logger.info('  CreateDate :', data.CreateDate)
  Logger.info('  DateCreated :', data.DateCreated)
  Logger.info('  TimeCreated :', data.TimeCreated)
  Logger.info('  DateTime :', data.DateTime)
  Logger.info('  DateTimeCreated :', data.DateTimeCreated)
  Logger.info('  DateTimeUTC :', data.DateTimeUTC)
  Logger.info('  DateTimeOriginal :', data.DateTimeOriginal)
  */
  const date = (data.CreateDate || tags.ModifyDate || tags.DateTimeOriginal)
  if (date) {
    const month = zeroIfNeeded(date.month)
    const day = zeroIfNeeded(date.day)
    const hour = zeroIfNeeded(date.hour)
    const minute = zeroIfNeeded(date.minute)
    return new Date(date.year + '-' + month + '-' + day + 'T' + hour + ':' + minute)
  }
  Logger.warn({ prefix, message: 'failed at finding original date in exif tags' })
  return null
}

async function deleteFile (filepath: PhotoPath): Promise<void> {
  return Utils.deleteFile(filepath).catch(err => {
    Stats.fileDeletion.fail++
    Stats.fileDeletion.failedPaths.push(filepath)
    Logger.error(err)
  })
}

function repairExif (prefix: string, filepath: PhotoPath, exifRepairStat: Stat): Promise<string> {
  return new Promise((resolve, reject) => {
    let message = ''
    const windows = process.platform === 'win32'
    if (windows) {
      const command = exiftoolExe + ` -all= -tagsfromfile @ -all:all -unsafe -icc_profile "${filepath}"`
      // Logger.info('executing command :', command)
      exec(command, async (err) => {
        if (err) {
          // node couldn't execute the command
          exifRepairStat.fail++
          exifRepairStat.failedPaths.push(filepath)
          message = 'failed at executing command, ' + err.message
          Logger.info({ prefix, message })
          reject(message)
        } else {
          // if repair successful, delete _original file backup created by exif-tool
          deleteFile(filepath + '_original')
          exifRepairStat.success++
          message = 'success, all tags fixed !'
          Logger.success({ prefix, message })
          resolve(message)
        }
      })
    } else {
      exifRepairStat.skip++
      message = 'non-windows systems are not yet ready to repair exif'
      Logger.info({ prefix, message })
      resolve('success, ' + message)
    }
  })
}

function fixExifDate (prefix: string, filepath: PhotoPath, dir: DirInfos, dateFixStat: Stat, exiftool: ExifTool.ExifTool): Promise<string> {
  return new Promise((resolve, reject) => {
    if (dir.year === -1 || dir.month === -1) {
      dateFixStat.skip++
      return resolve('cannot fix exif date without year and month')
    }
    exiftool.read(filepath)
      .then((tags: ExifTool.Tags) => getDateFromTags(prefix, tags))
      .then(async (originalDate) => {
        const newDate = new Date(originalDate || '')
        const year = newDate.getFullYear()
        const month = newDate.getMonth() + 1
        let doRewrite = false
        if (originalDate) {
          Logger.info({ prefix, message: 'original date found : ' + dateToIsoString(originalDate, true).split('T')[0] })
          if (year !== dir.year) {
            Logger.warn({ prefix, message: 'fixing photo year "' + year + '" => "' + dir.year + '"' })
            newDate.setFullYear(dir.year)
            newDate.setFullYear(dir.year) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
          if (month !== dir.month) {
            Logger.warn({ prefix, message: 'fixing photo month "' + month + '" => "' + dir.month + '"' })
            newDate.setMonth(dir.month - 1)
            newDate.setMonth(dir.month - 1) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
        } else {
          doRewrite = true
          if (dir.year !== -1) {
            newDate.setFullYear(dir.year)
            newDate.setFullYear(dir.year) // this is intended, see bug 1 at the bottom of this file
          }
          if (dir.month !== -1) {
            newDate.setMonth(dir.month - 1)
            newDate.setMonth(dir.month - 1) // this is intended, see bug 1 at the bottom of this file
          }
        }
        if (!doRewrite) {
          dateFixStat.skip++
          return resolve('success, date is good')
        }
        const newDateStr = dateToIsoString(newDate, true)
        // Logger.warn({ prefix, message: 'USING mock date for testing purpose' })
        // const newDateStr = '2016-02-06T16:56:00'
        Logger.info({ prefix, message: 'new date will be : ' + newDateStr })
        if (originalDate) {
          Logger.info({ prefix, message: 'instead of       : ' + dateToIsoString(originalDate, true) })
        }
        await exiftool.write(filepath, { AllDates: newDateStr }).catch(() => { throw new Error('failed at writing exif') })
        deleteFile(filepath + '_original') // avoid awaiting file deletion because it's not critical
        dateFixStat.success++
        const message = 'success, updated photo date'
        Logger.info({ prefix, message })
        resolve(message)
      })
      .catch((err: Error) => {
        dateFixStat.fail++
        dateFixStat.failedPaths.push(filepath)
        Logger.error(err)
        reject(err)
      })
  })
}

async function createCopy (filepath: PhotoPath, finalPhotoPath: PhotoPath): Promise<boolean> {
  return Utils.copyFile(filepath, finalPhotoPath, true)
    .then(() => {
      Stats.fileCopy.success++
      return true
    })
    .catch(err => {
      Stats.fileCopy.fail++
      Stats.fileCopy.failedPaths.push(filepath)
      Logger.error(err)
      return false
    })
}

async function checkPhotos (photos: PhotoSet, dir: DirInfos, exiftool: ExifTool.ExifTool): Promise<string> {
  let count = photos.length
  if (count > 1) {
    Logger.info('found', count, 'photos in dir "' + dir.name + '"')
  }
  if (count < 1) {
    return Promise.resolve('found no photos in dir "' + dir.name + '"')
  }
  if (Config.processOne) {
    Logger.info('will process only one photo as set in config')
    count = 1
  }
  let bar = null
  if (!Config.verbose && !Config.silent) {
    bar = new ProgressBar('[:bar] processing folder : ' + dir.name, {
      complete: '=',
      incomplete: ' ',
      total: count,
      width: 40,
    })
  }
  // Logger.info(photos)
  for (let i = 0; i < count; i++) {
    let photo = photos[i]

    if (!Config.overwrite) {
      const markedPhotoPath = markFilepath(photo)
      const markedPhotoExists = await Utils.fileExists(markedPhotoPath)
      if (markedPhotoExists) {
        // Logger.log('Exists ?', markedPhotoExists, markedPhotoPath)
        if (Config.reArchive) {
          const copySuccess = await createCopy(photo, markedPhotoPath)
          if (copySuccess) {
            photo = markedPhotoPath
          } else {
            Stats.photoProcess.skip++
            Logger.error('No overwrite && re-archive but cannot a new copy, skipping process for this photo...')
            continue
          }
        } else {
          Stats.photoProcess.skip++
          Logger.info('No overwrite && no re-archive && archive exists, skipping process for this photo...')
          continue
        }
      } else {
        const copySuccess = await createCopy(photo, markedPhotoPath)
        if (copySuccess) {
          photo = markedPhotoPath
        } else {
          Stats.photoProcess.skip++
          Logger.error('No overwrite but cannot a new copy, skipping process for this photo...')
          continue
        }
      }
    }

    let name = basename(photo)
    if (name.length > 20) {
      name = name.substr(0, 20) + '...'
    }
    const num = i + 1 + ''
    const prefix = '[photo ' + num + ']'
    if (bar) {
      bar.tick()
    }
    Stats.photoProcess.success++
    Logger.info('processing photo', num, '(' + name + ')')
    await compress(prefix, photo, 'smallfry')
      .catch(error => {
        if (error.message.includes('Command failed')) {
          // sometimes smallfry fail where ssim works
          Logger.info({ prefix, message: 'smallfry compression failed on "' + photo + '", trying ssim...' })
          return compress(prefix, photo, 'ssim', true)
        } else {
          throw error
        }
      })
      .catch(error => {
        const message = 'smallfry && ssim compressions both failed on "' + photo + '" : ' + error.message
        Logger.info(message)
        return message
      })
      .then(message => {
        const notAlreadyProcessed = !message.includes('already processed')
        const notAborted = !message.includes('aborted')
        const notAvoidingCompression = !message.includes('avoiding compression')
        // avoid repairing exif for no reasons
        if (notAlreadyProcessed && notAborted && notAvoidingCompression) {
          return repairExif(prefix, photo, Stats.exifRepair1)
        } else {
          Stats.exifRepair1.skip++
        }
        return message
      })
      .catch(error => {
        Stats.dateFix1.skip++
        throw error
      })
      .then(() => fixExifDate(prefix, photo, dir, Stats.dateFix1, exiftool))
      .then(() => {
        Stats.exifRepair2.skip++
        Stats.dateFix2.skip++
      })
      .catch(message => {
        if (!message.includes || message.includes('failed at writing date exif')) {
          // repair exif of failed date fix files
          Logger.info({ prefix, message: 'exif fix failed, repairing exif & try again' })
          return repairExif(prefix, photo, Stats.exifRepair2)
            .then(() => fixExifDate(prefix, photo, dir, Stats.dateFix2, exiftool))
            .catch(err => Logger.error({ prefix, message: err }))
        } else {
          Stats.exifRepair2.skip++
          Stats.dateFix2.skip++
        }
        return message
      })
      .then(message => {
        Logger.info({ prefix, message })
        return true
      })
      .catch(err => Logger.error({ prefix, message: err }))
  }
  return Promise.resolve('check photos done in dir "' + dir.name + '"')
}

async function checkNextDir (exiftool: ExifTool.ExifTool): Promise<string> {
  if (!dirs.length) {
    return 'no more directories to check'
  }
  // extract first
  // full path
  const dir = dirs.shift() || ''
  // directory/folder name
  const dirName = basename(dir)
  const oDir: DirInfos = { name: dirName, year: -1, month: -1 }
  Logger.info('reading dir "' + dirName + '"')
  const dateMatches = dirName.match(/(\d{4})-(\d{2})/)
  let year = null
  let month = null
  if (!dateMatches || !dateMatches.length || dateMatches.length !== 3) {
    Stats.readDir.fail++
    Stats.readDir.failedPaths.push(dir)
    Logger.warn('failed at detecting year & month in "' + dir + '"')
  } else {
    year = parseInt(dateMatches[1], 10)
    if (year < 1000 || year > 3000) { // too old or too futuristic :p
      Logger.info('detected year out of range : "' + year + '"')
      year = -1
      Stats.readDir.fail++
      Stats.readDir.failedPaths.push(dir)
    } else {
      Logger.info('detected year "' + year + '"')
    }
    month = parseInt(dateMatches[2], 10)
    if (month < 0 || month > 12) {
      Logger.info('detected month out of range : "' + month + '"')
      month = -1
      if (year !== -1) { // avoiding duplicate records
        Stats.readDir.fail++
        Stats.readDir.failedPaths.push(dir)
      }
    } else {
      Logger.info('detected month "' + month + '"')
    }
    if (year !== -1 && month !== -1) {
      Stats.readDir.success++
    }
    oDir.year = year
    oDir.month = month
  }
  const include = posix.join(dir, '**/*.(jpg|jpeg)')
  const exclude = '!' + posix.join(dir, '**/*' + Config.marker + '.(jpg|jpeg)')
  const rules = [include, exclude]
  // Logger.info('search files with rules', rules)
  try {
    const photos = await globby(rules)
    const status = await checkPhotos(photos, oDir, exiftool)
    Logger.info(status)
    if (Config.processOne && Stats.photoProcess.total > 0) {
      return 'success, processed one photo only'
    }
    return checkNextDir(exiftool)
  } catch (err) {
    Logger.error(err)
    return err.message
  }
}

export async function startProcess (): Promise<void> {
  const app = 'Photo Archiver (' + process.platform + ')'
  const exiftool = new ExifTool.ExifTool() // { minorErrorsRegExp: /error|warning/i } shows all errors
  Logger.start(app)
  Stats.start()
  return getDirs()
    .then(() => checkNextDir(exiftool))
    .then(status => Logger.info(status))
    .catch(err => Logger.error(err))
    .then(() => Stats.stop())
    .catch(err => Logger.error(err))
    .then(() => exiftool.end())
    .catch(err => Logger.error(err))
    .then(() => Logger.complete(app))
}

// Bug 1
/*
date = new Date('2018-08-31') // Fri Aug 31 2018 02:00:00 GMT+0200
date.setMonth(1)              // Sat Mar 03 2018 02:00:00 GMT+0100
date.setMonth(1)              // Sat Feb 03 2018 02:00:00 GMT+0100
*/

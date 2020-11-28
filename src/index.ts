import { exec } from 'child_process'
import * as ExifTool from 'exiftool-vendored'
import { readdirSync, statSync } from 'fs'
import * as globby from 'globby'
import { basename, posix, resolve as pathResolve } from 'path'
import * as ProgressBar from 'progress'
import { dateToIsoString } from 'shuutils'
import Config from './config'
import Logger from './logger'
import Stat from './stat'
import Stats from './stats'
import { DirectoryInfos, PhotoPath, PhotoSet } from './types'
import { copyFile, deleteFile, fileExists, readableDirectories } from './utils'

const exiftoolExe = pathResolve('node_modules/exiftool-vendored.exe/bin/exiftool')
const jpegRecompress = pathResolve('bin/jpeg-recompress')
const directories: PhotoSet = []

function getDirectories (path: string): PhotoSet {
  return readdirSync(path).filter((file) => {
    return statSync(path + '/' + file).isDirectory()
  })
}

async function scanDirectories (): Promise<string> {
  return await new Promise((resolve, reject) => {
    if (Config.path === '') {
      reject(new Error('No path found in config'))
    }
    const path = Config.path.length > 0 ? Config.path : '.'
    getDirectories(path).forEach((directory) => {
      // dir will be successively 2013, 2014,...
      const subDirectory = posix.join(path, directory)
      Logger.info('dir', directory)
      Logger.info('subDir', subDirectory)
      if (directory.length === 4) {
        // like a year 2018 that contains sub-folders
        getDirectories(subDirectory).forEach((sub) => directories.push(posix.join(subDirectory, sub)))
      } else {
        directories.push(subDirectory)
      }
    })
    // if no sub-dir, just process input dir
    if (directories.length === 0) {
      directories.push(path)
    }
    Logger.info('found dir(s)', readableDirectories(directories, Config.path))
    resolve('success')
  })
}

function markFilepath (filepath: PhotoPath): PhotoPath {
  return filepath.replace(/(?<filepathWithoutExt>.*)\.(?<fileExt>[A-Za-z]{2,4})$/, (...matches) => {
    const { filepathWithoutExt, fileExt } = matches[matches.length - 1]
    return `${filepathWithoutExt as string}${Config.marker}.${fileExt as string}`
  })
}

async function compress (prefix: string, photo: PhotoPath, method = 'ssim', failAlreadyCount = false): Promise<string> {
  return await new Promise((resolve, reject) => {
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
    exec(command, (error, stdout, stderr) => {
      if (error !== null) {
        // node couldn't execute the command
        if (!failAlreadyCount) {
          Stats.compress.fail++
          Stats.compress.failedPaths.push(photo)
        }
        reject(error)
      } else {
        // the *entire* stdout and stderr (buffered)
        // Logger.info({ prefix, message : `stdout: ${stdout}`})
        // Logger.info({ prefix, message : `stderr: ${stderr}`})
        if (stderr.toString().includes('already processed')) {
          Stats.compress.skip++
          message = 'success (already processed)'
          Logger.info({ prefix, message })
        } else if (stderr.toString().includes('would be larger')) {
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
  let dateString = `${date}`
  if (dateString.length === 1) {
    dateString = '0' + dateString
  }
  return dateString
}

function getDateFromTags (prefix: string, tags: ExifTool.Tags): Date | undefined {
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
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  const date = (data.CreateDate || tags.ModifyDate || tags.DateTimeOriginal)
  if (typeof date === 'object') {
    const month = zeroIfNeeded(date.month)
    const day = zeroIfNeeded(date.day)
    const hour = zeroIfNeeded(date.hour)
    const minute = zeroIfNeeded(date.minute)
    return new Date(`${date.year as string}-${month}-${day}T${hour}:${minute}`)
  }
  Logger.warn({ prefix, message: 'failed at finding original date in exif tags' })
}

async function removeFile (filepath: PhotoPath): Promise<void> {
  return await deleteFile(filepath).catch(error => {
    Stats.fileDeletion.fail++
    Stats.fileDeletion.failedPaths.push(filepath)
    Logger.error(error)
  })
}

async function repairExif (prefix: string, filepath: PhotoPath, exifRepairStat: Stat): Promise<string> {
  return await new Promise((resolve, reject) => {
    let message = ''
    const windows = process.platform === 'win32'
    if (windows) {
      const command = exiftoolExe + ` -all= -tagsfromfile @ -all:all -unsafe -icc_profile "${filepath}"`
      // Logger.info('executing command :', command)
      exec(command, (error): void => {
        if (error !== null) {
          // node couldn't execute the command
          exifRepairStat.fail++
          exifRepairStat.failedPaths.push(filepath)
          message = 'failed at executing command, ' + error.message
          Logger.info({ prefix, message })
          reject(message)
        } else {
          // if repair successful, delete _original file backup created by exif-tool
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          removeFile(filepath + '_original')
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

async function fixExifDate (prefix: string, filepath: PhotoPath, infos: DirectoryInfos, dateFixStat: Stat, exiftool: ExifTool.ExifTool): Promise<string> {
  return await new Promise((resolve, reject) => {
    if (infos.year === -1 || infos.month === -1) {
      dateFixStat.skip++
      return resolve('cannot fix exif date without year and month')
    }
    exiftool.read(filepath)
      .then((tags: ExifTool.Tags) => getDateFromTags(prefix, tags))
      .then(async (originalDate) => {
        const newDate = new Date(originalDate === undefined ? '' : originalDate)
        const year = newDate.getFullYear()
        const month = newDate.getMonth() + 1
        let doRewrite = false
        if (originalDate !== undefined) {
          Logger.info({ prefix, message: 'original date found : ' + dateToIsoString(originalDate, true).split('T')[0] })
          if (year !== infos.year) {
            Logger.warn({ prefix, message: `fixing photo year "${year}" => "${infos.year}"` })
            newDate.setFullYear(infos.year)
            newDate.setFullYear(infos.year) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
          if (month !== infos.month) {
            Logger.warn({ prefix, message: `fixing photo month "${month}" => "${infos.month}"` })
            newDate.setMonth(infos.month - 1)
            newDate.setMonth(infos.month - 1) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
        } else {
          doRewrite = true
          if (infos.year !== -1) {
            newDate.setFullYear(infos.year)
            newDate.setFullYear(infos.year) // this is intended, see bug 1 at the bottom of this file
          }
          if (infos.month !== -1) {
            newDate.setMonth(infos.month - 1)
            newDate.setMonth(infos.month - 1) // this is intended, see bug 1 at the bottom of this file
          }
        }
        if (!doRewrite) {
          dateFixStat.skip++
          return resolve('success, date is good')
        }
        const newDateString = dateToIsoString(newDate, true)
        // Logger.warn({ prefix, message: 'USING mock date for testing purpose' })
        // const newDateStr = '2016-02-06T16:56:00'
        Logger.info({ prefix, message: 'new date will be : ' + newDateString })
        if (originalDate !== undefined) {
          Logger.info({ prefix, message: 'instead of       : ' + dateToIsoString(originalDate, true) })
        }
        await exiftool.write(filepath, { AllDates: newDateString }).catch(() => { throw new Error('failed at writing exif') })
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        removeFile(filepath + '_original') // avoid awaiting file deletion because it's not critical
        dateFixStat.success++
        const message = 'success, updated photo date'
        Logger.info({ prefix, message })
        resolve(message)
      })
      .catch((error: Error) => {
        dateFixStat.fail++
        dateFixStat.failedPaths.push(filepath)
        Logger.error(error)
        reject(error)
      })
  })
}

async function createCopy (filepath: PhotoPath, finalPhotoPath: PhotoPath): Promise<boolean> {
  return await copyFile(filepath, finalPhotoPath, true)
    .then(() => {
      Stats.fileCopy.success++
      return true
    })
    .catch(error => {
      Stats.fileCopy.fail++
      Stats.fileCopy.failedPaths.push(filepath)
      Logger.error(error)
      return false
    })
}

async function checkPhotos (photos: PhotoSet, infos: DirectoryInfos, exiftool: ExifTool.ExifTool): Promise<string> {
  let count = photos.length
  if (count > 1) {
    Logger.info('found', count, 'photos in dir "' + infos.name + '"')
  }
  if (count < 1) {
    return await Promise.resolve('found no photos in dir "' + infos.name + '"')
  }
  if (Config.processOne) {
    Logger.info('will process only one photo as set in config')
    count = 1
  }
  let bar
  if (!Config.verbose && !Config.silent) {
    bar = new ProgressBar('[:bar] processing folder : ' + infos.name, {
      complete: '=',
      incomplete: ' ',
      total: count,
      width: 40,
    })
  }
  // Logger.info(photos)
  for (let index = 0; index < count; index++) {
    let photo = photos[index]

    if (!Config.overwrite) {
      const markedPhotoPath = markFilepath(photo)
      const markedPhotoExists = await fileExists(markedPhotoPath)
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
      name = name.slice(0, 20) + '...'
    }
    const number = `${index + 1}`
    const prefix = '[photo ' + number + ']'
    if (bar !== undefined) {
      bar.tick()
    }
    Stats.photoProcess.success++
    Logger.info('processing photo', number, '(' + name + ')')
    await compress(prefix, photo, 'smallfry')
      .catch(async (error) => {
        if (error.message.includes('Command failed') === true) {
          // sometimes smallfry fail where ssim works
          Logger.info({ prefix, message: 'smallfry compression failed on "' + photo + '", trying ssim...' })
          return await compress(prefix, photo, 'ssim', true)
        } else {
          throw error
        }
      })
      .catch(error => {
        const message = `smallfry && ssim compressions both failed on "${photo}" : ${error.message as string}`
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
      .then(async () => await fixExifDate(prefix, photo, infos, Stats.dateFix1, exiftool))
      .then(() => {
        Stats.exifRepair2.skip++
        Stats.dateFix2.skip++
      })
      .catch(error => {
        if (typeof error.includes !== 'function' || error.includes('failed at writing date exif') === true) {
          // repair exif of failed date fix files
          Logger.info({ prefix, message: 'exif fix failed, repairing exif & try again' })
          return repairExif(prefix, photo, Stats.exifRepair2)
            .then(async () => await fixExifDate(prefix, photo, infos, Stats.dateFix2, exiftool))
            .catch(error_ => Logger.error({ prefix, message: error_ }))
        } else {
          Stats.exifRepair2.skip++
          Stats.dateFix2.skip++
        }
        return error
      })
      .then(message => {
        Logger.info({ prefix, message })
        return true
      })
      .catch(error => Logger.error({ prefix, message: error }))
  }
  return Promise.resolve('check photos done in dir "' + infos.name + '"')
}

async function checkNextDirectory (exiftool: ExifTool.ExifTool): Promise<string> {
  if (directories.length === 0) {
    return 'no more directories to check'
  }
  // extract first
  // full path
  const first = directories.shift()
  const directory = first === undefined ? '' : first
  // directory/folder name
  const name = basename(directory)
  const infos = { name: name, year: -1, month: -1 }
  Logger.info('reading dir "' + name + '"')
  const dateMatches = name.match(/(\d{4})-(\d{2})/)
  let year
  let month
  if (dateMatches === null || dateMatches.length !== 3) {
    Stats.readDir.fail++
    Stats.readDir.failedPaths.push(directory)
    Logger.warn('failed at detecting year & month in "' + directory + '"')
  } else {
    year = Number.parseInt(dateMatches[1], 10)
    if (year < 1000 || year > 3000) { // too old or too futuristic :p
      Logger.info(`detected year out of range : "${year}"`)
      year = -1
      Stats.readDir.fail++
      Stats.readDir.failedPaths.push(directory)
    } else {
      Logger.info(`detected year "${year}"`)
    }
    month = Number.parseInt(dateMatches[2], 10)
    if (month < 0 || month > 12) {
      Logger.info(`detected month out of range : "${month}"`)
      month = -1
      if (year !== -1) { // avoiding duplicate records
        Stats.readDir.fail++
        Stats.readDir.failedPaths.push(directory)
      }
    } else {
      Logger.info(`detected month "${month}"`)
    }
    if (year !== -1 && month !== -1) {
      Stats.readDir.success++
    }
    infos.year = year
    infos.month = month
  }
  const include = posix.join(directory, '**/*.(jpg|jpeg)')
  const exclude = '!' + posix.join(directory, '**/*' + Config.marker + '.(jpg|jpeg)')
  const rules = [include, exclude]
  // Logger.info('search files with rules', rules)
  try {
    const photos = await globby(rules)
    const status = await checkPhotos(photos, infos, exiftool)
    Logger.info(status)
    if (Config.processOne && Stats.photoProcess.total > 0) {
      return 'success, processed one photo only'
    }
    return await checkNextDirectory(exiftool)
  } catch (error) {
    Logger.error(error)
    return error.message
  }
}

export async function startProcess (): Promise<void> {
  const app = 'Photo Archiver (' + process.platform + ')'
  const exiftool = new ExifTool.ExifTool() // { minorErrorsRegExp: /error|warning/i } shows all errors
  Logger.start(app)
  Stats.start()
  return await scanDirectories()
    .then(async () => await checkNextDirectory(exiftool))
    .then(status => Logger.info(status))
    .catch(error => Logger.error(error))
    .then(() => Stats.stop())
    .catch(error => Logger.error(error))
    .then(async () => await exiftool.end())
    .catch(error => Logger.error(error))
    .then(() => Logger.complete(app))
}

// Bug 1
/*
date = new Date('2018-08-31') // Fri Aug 31 2018 02:00:00 GMT+0200
date.setMonth(1)              // Sat Mar 03 2018 02:00:00 GMT+0100
date.setMonth(1)              // Sat Feb 03 2018 02:00:00 GMT+0100
*/

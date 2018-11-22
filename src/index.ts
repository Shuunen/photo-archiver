import { exec } from 'child_process'
import * as ExifTool from 'exiftool-vendored'
import { readdirSync, statSync, unlink } from 'fs'
import * as globby from 'globby'
import { basename, join, resolve as pathResolve } from 'path'
import * as ProgressBar from 'progress'
import { dateToIsoString } from 'shuutils'
import { DirInfos, PhotoPath, PhotoSet } from './types' // eslint-disable-line no-unused-vars
import Config from './config'
import Logger from './logger'
import Stats from './stats'
import Utils from './utils'

const exiftool = new ExifTool.ExifTool() // { minorErrorsRegExp: /error|warning/i } shows all errors
const exiftoolExe = pathResolve('node_modules/exiftool-vendored.exe/bin/exiftool')
const jpegRecompress = pathResolve('bin/jpeg-recompress')
const dirs = []

function getDirectories (path) {
  return readdirSync(path).filter((file) => {
    return statSync(path + '/' + file).isDirectory()
  })
}

function getDirs () {
  return new Promise((resolve, reject) => {
    if (!Config.path) {
      reject(new Error('No path found in config'))
    }
    getDirectories(Config.path).map((dir) => {
      // dir will be succesivly 2013, 2014,...
      const subDir = join(Config.path, dir)
      Logger.info('dir', dir)
      Logger.info('subDir', subDir)
      if (dir.length === 4) {
        // like a year 2018 that contains subfolders
        getDirectories(subDir).forEach((sub) => dirs.push(join(subDir, sub)))
      } else {
        dirs.push(subDir)
      }
    })
    // if no subdir, just process input dir
    if (!dirs.length) {
      dirs.push(Config.path)
    }
    Logger.info('found dir(s)', Utils.readableDirs(dirs, Config.path))
    resolve('success')
  })
}

function getFinalPhotoName (photo) {
  return Config.overwrite ? photo : photo.replace(/(\.j)/i, Config.marker + '$1')
}

function compress (prefix, photo, method = 'ssim', failAlreadyCount = false): Promise<string> {
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
    // photo = photo.replace(/\\/g, '/')
    if (photo.indexOf(Config.marker) !== -1) {
      Stats.compress.skip++
      message = 'success (already processed)'
      Logger.info({ prefix, message })
      return resolve(message)
    }
    Logger.info({ prefix, message })
    const photoIn = photo
    const photoOut = getFinalPhotoName(photo)
    const command = jpegRecompress + ` --method ${methodToUse} "${photoIn}" "${photoOut}"`
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

function zeroIfNeeded (date: number | string) {
  let dateStr = date + ''
  if (dateStr.length === 1) {
    dateStr = '0' + dateStr
  }
  return dateStr
}

function getDateFromTags (prefix, tags): Date {
  // Logger.info('  tags found :', tags)
  /*  Logger.info('  ModifyDate :', tags.ModifyDate)
   Logger.info('  CreateDate :', tags.CreateDate)
   Logger.info('  DateCreated :', tags.DateCreated)
   Logger.info('  TimeCreated :', tags.TimeCreated)
   Logger.info('  DateTime :', tags.DateTime)
   Logger.info('  DateTimeCreated :', tags.DateTimeCreated)
   Logger.info('  DateTimeUTC :', tags.DateTimeUTC)
   Logger.info('  DateTimeOriginal :', tags.DateTimeOriginal) */
  // Logger.info('  FileCreateDate :', (tags as any).FileCreateDate)
  if (tags.CreateDate) {
    return new Date(tags.CreateDate + '')
  }
  const date = (tags as any).FileCreateDate
  if (date) {
    const month = zeroIfNeeded(date.month)
    const day = zeroIfNeeded(date.day)
    const hour = zeroIfNeeded(date.hour)
    const minute = zeroIfNeeded(date.minute)
    return new Date(date.year + '-' + month + '-' + day + 'T' + hour + ':' + minute)
  }
  Logger.warn({ prefix, message: 'failed at finding original date' })
  return null
}

function writeExifDate (prefix, filepath, newDateStr) {
  return new Promise((resolve, reject) => {
    // Logger.info({ prefix, message: 'writing new date : ' + newDateStr })
    // Logger.info({ prefix, message: 'to file : ' + filepath })
    exiftool
      .write(filepath, { AllDates: newDateStr })
      .then(() => {
        // Logger.info('exiftool status after writing :', status) // status is undefined :'(
        // resolve('success, updated photo date to : ' + newDateStr)
        // Logger.success({ prefix, message: 'new date writen :)' })
        Stats.dateFix.success++
        // if write successful, delete _original file backup created by exif-tool
        unlink(filepath + '_original', (err) => {
          if (err) {
            Stats.fileDeletion.fail++
            Stats.fileDeletion.failedPaths.push(filepath + '_original')
            Logger.error(err)
          }
        })
        // because above unlink is async, let it work on is own and resolve now
        resolve('success, updated photo date')
      })
      .catch(err => {
        Logger.error(err)
        Stats.dateFix.fail++
        Stats.dateFix.failedPaths.push(filepath)
        reject(new Error('failed at writing date exif'))
      })
  })
}

function repairExif (prefix: string, filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let message = ''
    if (process.platform === 'win32') {
      const command = exiftoolExe + ` -all= -tagsfromfile @ -all:all -unsafe -icc_profile "${filepath}"`
      // Logger.info('executing command :', command)
      exec(command, (err, stdout, stderr) => {
        if (err) {
          // node couldn't execute the command
          Stats.exifRepair.fail++
          Stats.exifRepair.failedPaths.push(filepath)
          reject(err)
        } else {
          // if repair successful, delete _original file backup created by exif-tool
          unlink(filepath + '_original', (error) => {
            if (error) {
              Logger.error(error)
              Stats.fileDeletion.fail++
              Stats.fileDeletion.failedPaths.push(filepath + '_original')
            }
          })
          Stats.exifRepair.success++
          message = 'success, all tags fixed !'
          Logger.success({ prefix, message })
          resolve(message)
        }
      })
    } else {
      Stats.exifRepair.skip++
      message = 'non-windows systems are not yet ready to repair exif'
      Logger.info({ prefix, message })
      resolve('success, ' + message)
    }
  })
}

function fixExifDate (prefix: string, photo: string, dir: DirInfos): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!dir.year && !dir.month) {
      Stats.dateFix.skip++
      return resolve('cannot fix exif date without year and month')
    }
    const filepath = getFinalPhotoName(photo)
    exiftool.read(filepath)
      .then((tags: ExifTool.Tags) => getDateFromTags(prefix, tags))
      .then(originalDate => {
        const newDate = new Date(originalDate)
        const year = newDate.getFullYear()
        const month = newDate.getMonth() + 1
        let doRewrite = false
        if (originalDate) {
          Stats.readDate.success++
          Logger.info({ prefix, message: 'original date found : ' + dateToIsoString(originalDate, true).split('T')[0] })
          if (dir.year !== null && year !== dir.year) {
            Logger.warn({ prefix, message: 'fixing photo year "' + year + '" => "' + dir.year + '"' })
            newDate.setFullYear(dir.year)
            newDate.setFullYear(dir.year) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
          if (dir.month !== null && month !== dir.month) {
            Logger.warn({ prefix, message: 'fixing photo month "' + month + '" => "' + dir.month + '"' })
            newDate.setMonth(dir.month - 1)
            newDate.setMonth(dir.month - 1) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
        } else {
          Stats.readDate.fail++
          Stats.readDate.failedPaths.push(filepath)
          doRewrite = true
          if (dir.year !== null) {
            newDate.setFullYear(dir.year)
            newDate.setFullYear(dir.year) // this is intended, see bug 1 at the bottom of this file
          }
          if (dir.month !== null) {
            newDate.setMonth(dir.month - 1)
            newDate.setMonth(dir.month - 1) // this is intended, see bug 1 at the bottom of this file
          }
        }
        if (doRewrite) {
          const newDateStr = dateToIsoString(newDate, true)
          // Logger.warn({ prefix, message: 'USING static date for testing purpose' })
          // const newDateStr = '2016-02-06T16:56:00'
          Logger.info({ prefix, message: 'new date will be : ' + newDateStr })
          if (originalDate) {
            Logger.info({ prefix, message: 'instead of       : ' + dateToIsoString(originalDate, true) })
          }
          writeExifDate(prefix, filepath, newDateStr)
            .then(r => resolve(r.toString()))
            .catch(r => reject(r.toString()))
        } else {
          Stats.dateFix.skip++
          resolve('success, date is good')
        }
      })
      .catch(err => {
        Stats.dateFix.fail++
        Stats.dateFix.failedPaths.push(photo)
        Logger.error(err)
        reject(new Error('failed at reading exif'))
      })
  })
}

async function checkPhotos (photos: PhotoSet, dir: DirInfos): Promise<string> {
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
  if (!Config.verbose) {
    bar = new ProgressBar('[:bar] processing folder : ' + dir.name, {
      complete: '=',
      incomplete: ' ',
      total: count,
      width: 40
    })
  }
  // Logger.info(photos)
  for (let i = 0; i < count; i++) {
    const photo = photos[i]
    let name = basename(photo)
    if (name.length > 20) {
      name = name.substr(0, 20) + '...'
    }
    const num = i + 1 + ''
    const prefix = '[photo ' + num + ']'
    if (bar) {
      bar.tick()
    }
    Stats.photoProcess.count++
    Logger.info('processing photo', num, '(' + name + ')')
    await compress(prefix, photo, 'smallfry')
      .catch(error => {
        if (error.message.includes('Command failed')) {
          // sometimes smallfry fail where ssim works
          Logger.warn({ prefix, message: 'smallfry compression failed on "' + photo + '", trying ssim...' })
          return compress(prefix, photo, 'ssim', true)
        } else {
          throw error
        }
      })
      .then(message => {
        const notAlreadyProcessed = !message.includes('already processed')
        const notAborted = !message.includes('aborted')
        const notAvoidingCompression = !message.includes('avoiding compression')
        // avoid repairing exif for no reasons
        if (notAlreadyProcessed && notAborted && notAvoidingCompression) {
          return repairExif(prefix, photo)
        } else {
          Stats.exifRepair.skip++
        }
        return message
      })
      .then(() => fixExifDate(prefix, photo, dir))
      .catch(message => {
        if (!message.includes || message.includes('failed at writing date exif')) {
          // repair exif of failed date fix files
          Logger.info({ prefix, message: 'exif fix failed, repairing exif & try again' })
          return repairExif(prefix, photo)
            .then(() => fixExifDate(prefix, photo, dir))
            .catch(err => Logger.error({ prefix, message: err }))
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

function checkNextDir (): Promise<string> {
  if (!dirs.length) {
    return Promise.resolve('no more directories to check')
  }
  // extract first
  // full path
  const dir = dirs.shift()
  // directory/folder name
  const dirName = basename(dir)
  Logger.info('reading dir "' + dirName + '"')
  const dateMatches = dirName.match(/(\d{4})-(\d{2})/)
  let year = null
  let month = null
  if (!dateMatches || !dateMatches.length || dateMatches.length !== 3) {
    Stats.readDir.fail++
    Stats.readDir.failedPaths.push(dir)
    Logger.warn('failed at detecting year & month in "' + dir + '"')
  } else {
    let failed = false

    year = parseInt(dateMatches[1], 10)
    // too old or too futuristic :p
    if (year < 1000 || year > 3000) {
      Logger.error('detected year out of range : "' + year + '"')
      failed = true
      Stats.readDir.fail++
      Stats.readDir.failedPaths.push(dir)
    } else {
      Logger.info('detected year "' + year + '"')
    }

    month = parseInt(dateMatches[2], 10)
    if (month !== 0) {
      if (month < 0 || month > 12) {
        Logger.error('detected month out of range : "' + month + '"')
        // avoiding duplicate records
        if (!failed) {
          Stats.readDir.fail++
          Stats.readDir.failedPaths.push(dir)
        }
      } else {
        Logger.info('detected month "' + month + '"')
      }
    } else {
      month = null
    }
  }
  const oDir: DirInfos = { name: dirName, year, month }
  const include = join(dir, '**/*.(jpg|jpeg)')
  const exclude = '!' + join(dir, '**/*' + Config.marker + '.(jpg|jpeg)')
  const rules = [include, exclude]
  // Logger.info('search files with rules', rules)
  return globby(rules, { nocase: true })
    .then((photos: PhotoSet) => checkPhotos(photos, oDir))
    .then(status => {
      Logger.info(status)
      if (Config.processOne && Stats.photoProcess.count > 0) {
        return 'success, processed one photo only'
      }
      return checkNextDir()
    })
    .catch(err => {
      Logger.error(err)
      return err.message
    })
}

function killExifTool () {
  Logger.info('killing exif tool instance...')
  exiftool.end()
  return Promise.resolve('success, does not wait for exif-tool killing')
}

function startProcess () {
  Logger.start('Photo Archiver (' + process.platform + ')')
  Stats.start()
  Config.init()
    .then(() => getDirs())
    .then(() => checkNextDir())
    .then(status => Logger.info(status))
    .catch(err => Logger.error(err))
    .then(() => Stats.stop())
    .catch(err => Logger.error(err))
    .then(() => killExifTool())
    .catch(err => Logger.error(err))
    .then(() => Logger.complete('Photo Archiver'))
}

startProcess()

// Bug 1
/*
date = new Date('2018-08-31') // Fri Aug 31 2018 02:00:00 GMT+0200
date.setMonth(1)              // Sat Mar 03 2018 02:00:00 GMT+0100
date.setMonth(1)              // Sat Feb 03 2018 02:00:00 GMT+0100
*/

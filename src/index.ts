// tslint:disable:max-file-line-count
import { exec } from 'child_process'
import * as ExifTool from 'exiftool-vendored'
import { readdirSync, statSync, unlink } from 'fs'
import * as globby from 'globby'
import * as inquirer from 'inquirer'
import * as minimist from 'minimist'
import { basename, join, resolve as pathResolve } from 'path'
import * as log from 'signale'

const exiftool = new ExifTool.ExifTool({ minorErrorsRegExp: /error|warning/i }) // show all errors
const exiftoolExe = pathResolve('node_modules/exiftool-vendored.exe/bin/exiftool')
const argv = minimist(process.argv.slice(2))
const currentPath = process.cwd()
const dirs = []
const jpegRecompress = pathResolve('bin/jpeg-recompress')
let startTime = null
let config = {
  basepath: argv.path || currentPath + '/test',
  forceSsim: false,
  overwrite: true, // true : will replace original photos / false : will use below suffix and create new files
  suffix: '-archived', // my-photo.jpg => my-photo-archived.jpg
  trySsim: false,
}
let photosCompressed = 0
let photosCompressSkipped = 0
let photosDateFixed = 0
let photosDateFixSkipped = 0
const questions = [
  {
    default: config.basepath,
    message: 'Path to photos ?',
    name: 'basepath',
    type: 'input',
  },
  {
    default: config.overwrite,
    message: 'Overwrite photos ?',
    name: 'overwrite',
    type: 'confirm',
  },
]

function getDirectories(path) {
  return readdirSync(path).filter((file) => {
    return statSync(path + '/' + file).isDirectory()
  })
}

function getTimestamp() {
  return Math.round(Date.now() / 1000)
}

function getDirs() {
  return new Promise((resolve, reject) => {
    getDirectories(config.basepath).map((dir) => {
      // dir will be succesivly 2013, 2014,...
      const subDir = join(config.basepath, dir)
      log.info('dir', dir)
      log.info('subDir', subDir)
      if (dir.length === 4) {
        // like a year 2018 that contains subfolders
        getDirectories(subDir).forEach((sub) => dirs.push(join(subDir, sub)))
      } else {
        dirs.push(subDir)
      }
    })
    // if no subdir, just process input dir
    if (!dirs.length) {
      dirs.push(config.basepath)
    }
    log.info('found dir(s)', dirs)
    resolve('success')
  })
}

function getFinalPhotoName(photo) {
  return config.overwrite ? photo : photo.replace(/(\.j)/i, config.suffix + '$1')
}

function compress(prefix, photo, method = 'ssim'): Promise<string> {
  return new Promise((resolve, reject) => {
    let methodToUse = method
    if (config.forceSsim) {
      methodToUse = 'ssim'
    }
    let message = 'compressing via ' + methodToUse
    // photo = photo.replace(/\\/g, '/')
    if (photo.indexOf(config.suffix) !== -1) {
      message = 'success (already processed)'
      log.info({ prefix, message })
      return resolve(message)
    }
    log.info({ prefix, message })
    const photoIn = photo
    const photoOut = getFinalPhotoName(photo)
    const command = jpegRecompress + ` --method ${methodToUse} "${photoIn}" "${photoOut}"`
    // log.info('executing command :', command)
    exec(command, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        reject(err)
      } else {
        // the *entire* stdout and stderr (buffered)
        // log.info({ prefix, message : `stdout: ${stdout}`})
        // log.info({ prefix, message : `stderr: ${stderr}`})
        if (stderr.toString().indexOf('already processed') !== -1) {
          message = 'success (already processed)'
          log.info({ prefix, message })
        } else if (stderr.toString().indexOf('would be larger') !== -1) {
          message = 'aborted (output file would be larger than input)'
          log.info({ prefix, message })
        } else {
          message = 'success, compressed'
          log.success({ prefix, message })
          photosCompressed++
        }
        resolve(message)
      }
    })
  })
}

function dateToIsoStringWithTimezoneHandling(date: Date): string {
  // from https://stackoverflow.com/a/37661393/1317546
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString()
}

function dateToIsoString(date: Date): string {
  let dateStr = dateToIsoStringWithTimezoneHandling(date)
  if (dateStr[dateStr.length - 1].toLowerCase() === 'z') {
    dateStr = dateStr.substr(0, dateStr.length - 1)
  }
  return dateStr
}

function zeroIfNeeded(date: number | string) {
  let dateStr = date + ''
  if (dateStr.length === 1) {
    dateStr = '0' + dateStr
  }
  return dateStr
}

function getDateFromTags(prefix, tags): Date {
  // log.info('  tags found :', tags)
  /*  log.info('  ModifyDate :', tags.ModifyDate)
   log.info('  CreateDate :', tags.CreateDate)
   log.info('  DateCreated :', tags.DateCreated)
   log.info('  TimeCreated :', tags.TimeCreated)
   log.info('  DateTime :', tags.DateTime)
   log.info('  DateTimeCreated :', tags.DateTimeCreated)
   log.info('  DateTimeUTC :', tags.DateTimeUTC)
   log.info('  DateTimeOriginal :', tags.DateTimeOriginal) */
  // tslint:disable-next-line:no-any
  // log.info('  FileCreateDate :', (tags as any).FileCreateDate)
  if (tags.CreateDate) {
    return new Date(tags.CreateDate + '')
  }
  // tslint:disable-next-line:no-any
  const date = (tags as any).FileCreateDate
  if (date) {
    const month = zeroIfNeeded(date.month)
    const day = zeroIfNeeded(date.day)
    const hour = zeroIfNeeded(date.hour)
    const minute = zeroIfNeeded(date.minute)
    return new Date(date.year + '-' + month + '-' + day + 'T' + hour + ':' + minute)
  }

  log.warn({ prefix, message: 'failed at finding original date' })
  return null
}

function writeExifDate(prefix, filepath, newDateStr) {
  return new Promise((resolve, reject) => {
    log.info({ prefix, message: 'writing new date : ' + newDateStr })
    log.info({ prefix, message: 'to file : ' + filepath })
    exiftool
      .write(filepath, { AllDates: newDateStr })
      .then(() => {
        // log.info('exiftool status after writing :', status) // status is undefined :'(
        // resolve('success, updated photo date to : ' + newDateStr)
        log.success({ prefix, message: 'new date writen :)' })
        photosDateFixed++
        // if write successful, delete _original file backup created by exif-tool
        unlink(filepath + '_original', (err) => {
          if (err) {
            log.error(err)
          }
        })
        // because above unlink is async, let it work on is own and resolve now
        resolve('success, updated photo date')
      })
      .catch(err => {
        log.error(err)
        reject('failed at writing date exif')
      })
  })
}

function repairExif(prefix: string, filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let message = ''
    if (process.platform === 'win32') {
      const command = exiftoolExe + ` -all= -tagsfromfile @ -all:all -unsafe -icc_profile "${filepath}"`
      // log.info('executing command :', command)
      exec(command, (err, stdout, stderr) => {
        if (err) {
          // node couldn't execute the command
          reject(err)
        } else {
          // if repair successful, delete _original file backup created by exif-tool
          unlink(filepath + '_original', (error) => {
            if (error) {
              log.error(error)
            }
          })
          message = 'success, all tags fixed !'
          log.success({ prefix, message })
          resolve(message)
        }
      })
    } else {
      message = 'non-windows systems are not yet ready to repair exif'
      log.info({ prefix, message })
      resolve('success, ' + message)
    }
  })
}

function fixExif(prefix: string, photo: string, dir: DirInfos, needConfirm?: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!dir.year && !dir.month) {
      return resolve('cannot fix exif without year and month')
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
          log.info({ prefix, message: 'original date found : ' + dateToIsoString(originalDate).split('T')[0] })
          if (dir.year !== null && year !== dir.year) {
            log.warn({ prefix, message: 'fixing photo year "' + year + '" => "' + dir.year + '"' })
            newDate.setFullYear(dir.year)
            newDate.setFullYear(dir.year) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
          if (dir.month !== null && month !== dir.month) {
            log.warn({ prefix, message: 'fixing photo month "' + month + '" => "' + dir.month + '"' })
            newDate.setMonth(dir.month - 1)
            newDate.setMonth(dir.month - 1) // this is intended, see bug 1 at the bottom of this file
            doRewrite = true
          }
        } else {
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
          const newDateStr = dateToIsoString(newDate)
          // log.warn({ prefix, message: 'USING static date for testing purpose' })
          // const newDateStr = '2016-02-06T16:56:00'
          log.info({ prefix, message: 'new date will be ' + newDateStr })
          if (originalDate) {
            log.info({ prefix, message: 'instead of ' + dateToIsoString(originalDate) })
          }
          if (needConfirm) {
            inquirer.prompt([{
              default: true, message: 'Ok for this ?', name: 'rewrite', type: 'confirm',
            }]).then(answers => {
              // tslint:disable-next-line:no-any
              if ((answers as any).rewrite) {
                log.success({ prefix, message: 'user validated rewrite' })
                writeExifDate(prefix, filepath, newDateStr)
                  .then(r => resolve(r.toString()))
                  .catch(r => reject(r.toString()))
              } else {
                reject('user abort date rewrite')
              }
            })
          } else {
            writeExifDate(prefix, filepath, newDateStr)
              .then(r => resolve(r.toString()))
              .catch(r => reject(r.toString()))
          }
        } else {
          photosDateFixSkipped++
          resolve('success, date is good')
        }
      })
      .catch(err => {
        log.error(err)
        reject('failed at reading exif')
      })
  })
}

async function checkPhotos(photos: PhotoSet, dir: DirInfos) {
  const count = photos.length
  log.info('found', count, 'photos in dir "' + dir.name + '"')
  let needConfirm = false // TODO : put this back to true
  // log.info(photos)
  for (let i = 0; i < count; i++) {
    const photo = photos[i]
    let name = basename(photo)
    if (name.length > 20) {
      name = name.substr(0, 20) + '...'
    }
    const num = i + 1 + ''
    const prefix = '[photo ' + num + ']'
    log.info('processing photo', num, '(' + name + ')')
    await compress(prefix, photo, 'smallfry')
      .catch(error => {
        if (error.message.includes('Command failed')) {
          // sometimes smallfry fail where ssim works
          log.warn({ prefix, message: 'smallfry compression failed, trying ssim...' })
          return compress(prefix, photo, 'ssim')
        } else {
          throw error
        }
      })
      .then(message => {
        if (config.trySsim && message.includes('would be larger')) {
          // if smallfry detected that output file would be larger than input
          log.info({ prefix, message: 'smallfry compression avoided, trying ssim...' })
          return compress(prefix, photo, 'ssim')
        }
        return message
      })
      .then(message => {
        if (!message.includes('already processed') && !message.includes('aborted')) {
          // repair exif of non-already processed files
          return repairExif(prefix, photo)
        } else {
          photosCompressSkipped++
        }
        return message
      })
      .then(() => fixExif(prefix, photo, dir, needConfirm))
      .catch(message => {
        if (message.includes('failed at writing date exif')) {
          // repair exif of failed date fix files
          log.info({ prefix, message: 'exif fix failed, repairing exif & try again' })
          return repairExif(prefix, photo).then(() => fixExif(prefix, photo, dir, needConfirm))
        }
        return message
      })
      .then(message => {
        if (needConfirm && status.includes('updated')) {
          log.success({ prefix, message: 'user validated once, turning off validation for this folder...' })
          needConfirm = false
        }
        log.info({ prefix, message })
        return true
      })
      .catch(err => log.error(err))
  }
  return Promise.resolve('check photos done in dir "' + dir.name + '"')

}

function checkNextDir() {
  if (!dirs.length) {
    return Promise.resolve('no more directories to check')
  }
  // extract first
  const dir = dirs.shift() // full path
  const dirName = basename(dir) // directory/folder name
  log.info('reading dir "' + dirName + '"')
  const dateMatches = dirName.match(/(\d{4})\-(\d{2})/)
  let year = null
  let month = null
  if (!dateMatches || !dateMatches.length || dateMatches.length !== 3) {
    log.warn('failed at detecting year & month')
  } else {
    year = parseInt(dateMatches[1], 10)
    month = parseInt(dateMatches[2], 10)
    log.success('detected year "' + year + '"')
    if (month !== 0) {
      log.success('detected month "' + month + '"')
    } else {
      month = null
    }
  }
  const oDir: DirInfos = { name: dirName, year, month }
  const include = join(dir, '**/*.(jpg|jpeg)')
  const exclude = '!' + join(dir, '**/*' + config.suffix + '.(jpg|jpeg)')
  const rules = [include, exclude]
  // log.info('search files with rules', rules)
  return globby(rules, { nocase: true })
    .then((photos: PhotoSet) => checkPhotos(photos, oDir))
    .then(status => {
      log.info(status)
      return checkNextDir()
    })
    .catch(err => log.error(err))
}

function showMetrics() {
  const timeElapsed = getTimestamp() - startTime
  let timeReadable = timeElapsed + ' seconds'
  if (timeElapsed > 120) {
    timeReadable = Math.round(timeElapsed / 60 * 10) / 10 + ' minutes'
  }
  const operations = photosCompressed + photosCompressSkipped + photosDateFixed + photosDateFixSkipped
  const averageTimePerOperation = (Math.round(timeElapsed / operations * 100) / 100) || 0
  if (operations > 0) {
    log.info('Number of photos :')
    log.info(`- compressed    : ${photosCompressed}`)
    log.info(`- skip compress : ${photosCompressSkipped}`)
    log.info(`- date fixed    : ${photosDateFixed}`)
    log.info(`- skip date fix : ${photosDateFixSkipped}`)
    if (timeElapsed && isFinite(averageTimePerOperation)) {
      log.info(`average of ${averageTimePerOperation} seconds per operation`)
    }
  } else {
    log.info('no photos compressed or date fixed')
  }
}

function killExifTool() {
  log.info('killing exif tool instance...')
  exiftool.end()
  return Promise.resolve('success, does not wait for exif-tool killing')
}

function start() {
  log.start('Photo Archiver (' + process.platform + ')')
  inquirer.prompt(questions).then(answers => {
    config = { ...config, ...answers }
    startTime = getTimestamp()
    getDirs()
      .then(() => checkNextDir())
      .then(status => log.info(status))
      .catch((err) => log.error(err))
      .then(() => showMetrics())
      .then(() => killExifTool())
      .catch((err) => log.error(err))
      .then(() => log.complete('Photo Archiver'))
  })
}

start()

type PhotoPath = string
type PhotoSet = PhotoPath[]

interface DirInfos {
  name: string // folder name
  year: number
  month: number
}

// Bug 1
/*
date = new Date('2018-08-31') // Fri Aug 31 2018 02:00:00 GMT+0200
date.setMonth(1)              // Sat Mar 03 2018 02:00:00 GMT+0100
date.setMonth(1)              // Sat Feb 03 2018 02:00:00 GMT+0100
*/

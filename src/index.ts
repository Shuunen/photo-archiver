// tslint:disable:max-file-line-count
import chalk from 'chalk'
import { exec } from 'child_process'
import * as ExifTool from 'exiftool-vendored'
import { readdirSync, statSync, unlink } from 'fs'
import * as globby from 'globby'
import * as inquirer from 'inquirer'
import * as minimist from 'minimist'
import { basename, join, resolve as pathResolve } from 'path'
import * as prettyMs from 'pretty-ms'
import * as log from 'signale'
import { ColumnConfig, table, TableUserConfig } from 'table'

const exiftool = new ExifTool.ExifTool({ minorErrorsRegExp: /error|warning/i }) // show all errors
const exiftoolExe = pathResolve('node_modules/exiftool-vendored.exe/bin/exiftool')
const jpegRecompress = pathResolve('bin/jpeg-recompress')
const currentPath = process.cwd()
let config: Config = minimist(process.argv.slice(2), {
  default: {
    compress: true,
    forceSsim: false,
    marker: '-archived', // my-photo.jpg => my-photo-archived.jpg
    overwrite: true, // true : will replace original photos / false : will use config marker and create new files
    path: currentPath + '/test',
    processOne: false,
    questions: true,
    verbose: false,
  },
}) as Config
const dirs = []
let startTime = null
const operations = {
  compress: {
    fail: 0,
    failedPaths: [],
    skip: 0,
    success: 0,
  },
  dateFix: {
    fail: 0,
    failedPaths: [],
    skip: 0,
    success: 0,
  },
  exifRepair: {
    fail: 0,
    failedPaths: [],
    skip: 0,
    success: 0,
  },
  fileDeletion: {
    fail: 0,
    failedPaths: [],
    success: 0,
  },
  photoProcess: {
    count: 0,
    fail: 0,
    failedPaths: [],
    skip: 0,
    success: 0,
  },
  readDate: {
    fail: 0,
    failedPaths: [],
    success: 0,
  },
  readDir: {
    fail: 0,
    failedPaths: [],
    success: 0,
  },
}
const questions = [
  {
    default: config.path,
    message: 'Path to photos ?',
    name: 'path',
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

function getTimestampMs() {
  return Math.round(Date.now())
}

function readablePath(path) {
  const regex = /\\+|\/+/gm
  const subst = '\/'
  return path.replace(regex, subst)
}

function readableDirs(directories) {
  return directories.map(dir => {
    return readablePath(dir).replace(readablePath(config.path), '').substr(1)
  }).join(' & ')
}

function getDirs() {
  return new Promise((resolve, reject) => {
    getDirectories(config.path).map((dir) => {
      // dir will be succesivly 2013, 2014,...
      const subDir = join(config.path, dir)
      if (config.verbose) {
        log.info('dir', dir)
        log.info('subDir', subDir)
      }
      if (dir.length === 4) {
        // like a year 2018 that contains subfolders
        getDirectories(subDir).forEach((sub) => dirs.push(join(subDir, sub)))
      } else {
        dirs.push(subDir)
      }
    })
    // if no subdir, just process input dir
    if (!dirs.length) {
      dirs.push(config.path)
    }
    if (config.verbose) {
      log.info('found dir(s)', readableDirs(dirs))
    }
    resolve('success')
  })
}

function getFinalPhotoName(photo) {
  return config.overwrite ? photo : photo.replace(/(\.j)/i, config.marker + '$1')
}

function compress(prefix, photo, method = 'ssim'): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!config.compress) {
      operations.compress.skip++
      return resolve('avoiding compression (config)')
    }
    let methodToUse = method
    if (config.forceSsim) {
      methodToUse = 'ssim'
    }
    let message = 'compressing via ' + methodToUse
    // photo = photo.replace(/\\/g, '/')
    if (photo.indexOf(config.marker) !== -1) {
      operations.compress.skip++
      message = 'success (already processed)'
      log.info({ prefix, message })
      return resolve(message)
    }
    if (config.verbose) {
      log.info({ prefix, message })
    }
    const photoIn = photo
    const photoOut = getFinalPhotoName(photo)
    const command = jpegRecompress + ` --method ${methodToUse} "${photoIn}" "${photoOut}"`
    // log.info('executing command :', command)
    exec(command, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        operations.compress.fail++
        operations.compress.failedPaths.push(photo)
        reject(err)
      } else {
        // the *entire* stdout and stderr (buffered)
        // log.info({ prefix, message : `stdout: ${stdout}`})
        // log.info({ prefix, message : `stderr: ${stderr}`})
        if (stderr.toString().indexOf('already processed') !== -1) {
          operations.compress.skip++
          message = 'success (already processed)'
          if (config.verbose) {
            log.info({ prefix, message })
          }
        } else if (stderr.toString().indexOf('would be larger') !== -1) {
          operations.compress.skip++
          message = 'aborted (output file would be larger than input)'
          if (config.verbose) {
            log.info({ prefix, message })
          }
        } else {
          operations.compress.success++
          message = 'success, compressed'
          if (config.verbose) {
            log.success({ prefix, message })
          } else {
            log.success({ prefix, message: message + '"' + photo + '"' })
          }
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
    // log.info({ prefix, message: 'writing new date : ' + newDateStr })
    // log.info({ prefix, message: 'to file : ' + filepath })
    exiftool
      .write(filepath, { AllDates: newDateStr })
      .then(() => {
        // log.info('exiftool status after writing :', status) // status is undefined :'(
        // resolve('success, updated photo date to : ' + newDateStr)
        // log.success({ prefix, message: 'new date writen :)' })
        operations.dateFix.success++
        // if write successful, delete _original file backup created by exif-tool
        unlink(filepath + '_original', (err) => {
          if (err) {
            operations.fileDeletion.fail++
            operations.fileDeletion.failedPaths.push(filepath + '_original')
            log.error(err)
          }
        })
        // because above unlink is async, let it work on is own and resolve now
        resolve('success, updated photo date')
      })
      .catch(err => {
        log.error(err)
        operations.dateFix.fail++
        operations.dateFix.failedPaths.push(filepath)
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
          operations.exifRepair.fail++
          operations.exifRepair.failedPaths.push(filepath)
          reject(err)
        } else {
          // if repair successful, delete _original file backup created by exif-tool
          unlink(filepath + '_original', (error) => {
            if (error) {
              log.error(error)
              operations.fileDeletion.fail++
              operations.fileDeletion.failedPaths.push(filepath + '_original')
            }
          })
          operations.exifRepair.success++
          message = 'success, all tags fixed !'
          log.success({ prefix, message })
          resolve(message)
        }
      })
    } else {
      operations.exifRepair.skip++
      message = 'non-windows systems are not yet ready to repair exif'
      log.info({ prefix, message })
      resolve('success, ' + message)
    }
  })
}

function fixExifDate(prefix: string, photo: string, dir: DirInfos): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!dir.year && !dir.month) {
      operations.dateFix.skip++
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
          operations.readDate.success++
          if (config.verbose) {
            log.info({ prefix, message: 'original date found : ' + dateToIsoString(originalDate).split('T')[0] })
          }
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
          operations.readDate.fail++
          operations.readDate.failedPaths.push(filepath)
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
          log.info({ prefix, message: 'new date will be : ' + newDateStr })
          if (originalDate) {
            log.info({ prefix, message: 'instead of       : ' + dateToIsoString(originalDate) })
          }
          writeExifDate(prefix, filepath, newDateStr)
            .then(r => resolve(r.toString()))
            .catch(r => reject(r.toString()))
        } else {
          operations.dateFix.skip++
          resolve('success, date is good')
        }
      })
      .catch(err => {
        operations.dateFix.fail++
        operations.dateFix.failedPaths.push(photo)
        log.error(err)
        reject('failed at reading exif')
      })
  })
}

async function checkPhotos(photos: PhotoSet, dir: DirInfos): Promise<string> {
  let count = photos.length
  if (count > 1 && config.verbose) {
    log.info('found', count, 'photos in dir "' + dir.name + '"')
  }
  if (count < 1) {
    return Promise.resolve('found no photos in dir "' + dir.name + '"')
  }
  if (config.processOne) {
    log.info('will process only one photo as set in config')
    count = 1
  }
  // log.info(photos)
  for (let i = 0; i < count; i++) {
    const photo = photos[i]
    let name = basename(photo)
    if (name.length > 20) {
      name = name.substr(0, 20) + '...'
    }
    const num = i + 1 + ''
    const prefix = '[photo ' + num + ']'
    if (config.verbose) {
      operations.photoProcess.count++
      log.info('processing photo', num, '(' + name + ')')
    }
    await compress(prefix, photo, 'smallfry')
      .catch(error => {
        if (error.message.includes('Command failed')) {
          // sometimes smallfry fail where ssim works
          if (config.verbose) {
            log.warn({ prefix, message: 'smallfry compression failed, trying ssim...' })
          } else {
            log.warn({ prefix, message: 'smallfry compression failed on "' + photo + '", trying ssim...' })
          }
          return compress(prefix, photo, 'ssim')
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
          operations.exifRepair.skip++
        }
        return message
      })
      .then(() => fixExifDate(prefix, photo, dir))
      .catch(message => {
        if (!message.includes || message.includes('failed at writing date exif')) {
          // repair exif of failed date fix files
          log.info({ prefix, message: 'exif fix failed, repairing exif & try again' })
          return repairExif(prefix, photo).then(() => fixExifDate(prefix, photo, dir))
        }
        return message
      })
      .then(message => {
        if (config.verbose) {
          log.info({ prefix, message })
        }
        return true
      })
      .catch(err => log.error(err))
  }
  return Promise.resolve('check photos done in dir "' + dir.name + '"')

}

function checkNextDir(): Promise<string> {
  if (!dirs.length) {
    return Promise.resolve('no more directories to check')
  }
  // extract first
  // full path
  const dir = dirs.shift()
  // directory/folder name
  const dirName = basename(dir)
  if (config.verbose) {
    log.info('reading dir "' + dirName + '"')
  }
  const dateMatches = dirName.match(/(\d{4})\-(\d{2})/)
  let year = null
  let month = null
  if (!dateMatches || !dateMatches.length || dateMatches.length !== 3) {
    operations.readDir.fail++
    operations.readDir.failedPaths.push(dir)
    if (config.verbose) {
      log.warn('failed at detecting year & month')
    } else {
      log.warn('failed at detecting year & month in "' + dir + '"')
    }
  } else {
    let failed = false

    year = parseInt(dateMatches[1], 10)
    // too old or too futuristic :p
    if (year < 1000 || year > 3000) {
      log.error('detected year out of range : "' + year + '"')
      failed = true
      operations.readDir.fail++
      operations.readDir.failedPaths.push(dir)
    } else if (config.verbose) {
      log.info('detected year "' + year + '"')
    }

    month = parseInt(dateMatches[2], 10)
    if (month !== 0) {
      if (month < 0 || month > 12) {
        log.error('detected month out of range : "' + month + '"')
        // avoiding duplicate records
        if (!failed) {
          operations.readDir.fail++
          operations.readDir.failedPaths.push(dir)
        }
      } else if (config.verbose) {
        log.info('detected month "' + month + '"')
      }
    } else {
      month = null
    }
  }
  const oDir: DirInfos = { name: dirName, year, month }
  const include = join(dir, '**/*.(jpg|jpeg)')
  const exclude = '!' + join(dir, '**/*' + config.marker + '.(jpg|jpeg)')
  const rules = [include, exclude]
  // log.info('search files with rules', rules)
  return globby(rules, { nocase: true })
    .then((photos: PhotoSet) => checkPhotos(photos, oDir))
    .then(status => {
      if (config.verbose) {
        log.info(status)
      }
      if (config.processOne && operations.photoProcess.count > 0) {
        return 'success, processed one photo only'
      }
      return checkNextDir()
    })
    .catch(err => {
      log.error(err)
      return err.message
    })
}

function getMetricRow(label, data) {
  const row = [label]
  const spacer = '  '
  if (!data.success) {
    row.push(spacer + '0')
  } else {
    row.push(spacer + chalk.green(data.success.toString()))
  }
  if (!data.skip) {
    row.push(spacer + '0')
  } else {
    row.push(spacer + chalk.yellow(data.skip.toString()))
  }
  if (!data.fail) {
    row.push(spacer + '0')
  } else {
    row.push(spacer + chalk.red(data.fail.toString()))
  }
  if (!data.failedPaths) {
    row.push(spacer)
  } else {
    row.push(readableDirs(data.failedPaths))
    // row.push('bla bla bla')
  }
  return row
}

function showMetricsTable() {
  const data = [
    ['', 'Success', ' Skip', ' Fail', 'Fail photo and dir paths'],
    getMetricRow('Compressed', operations.compress),
    getMetricRow('Date fixed', operations.dateFix),
    getMetricRow('Exif repaired', operations.exifRepair),
  ]
  if (operations.fileDeletion.fail) {
    data.push(getMetricRow('File deletions', operations.fileDeletion))
  }
  if (operations.readDate.fail) {
    data.push(getMetricRow('Date read', operations.readDate))
  }
  if (operations.readDir.fail) {
    data.push(getMetricRow('Dir read', operations.readDir))
  }
  // Quick fix until https://github.com/gajus/table/issues/72 is solved
  const optWrap: ColumnConfig = {
    width: 80,
    wrapWord: true,
  } as ColumnConfig
  const optNumber: ColumnConfig = {
    width: 7,
  }
  const opts: TableUserConfig = {
    columns: {
      0: {
        alignment: 'right',
      },
      1: optNumber,
      2: optNumber,
      3: optNumber,
      4: optWrap,
    },
  }
  // tslint:disable-next-line:no-console
  console.log(table(data, opts))
}

function showMetrics() {
  const timeElapsed: number = getTimestampMs() - startTime
  const timeReadable: string = prettyMs(timeElapsed, { verbose: true })
  const photoProcessed: number = operations.photoProcess.count
  const timeElapsedPerPhoto = Math.round(timeElapsed / photoProcessed) || 0
  if (photoProcessed > 0) {
    if (timeElapsedPerPhoto > 0) {
      log.info(`spent an average of ${prettyMs(timeElapsedPerPhoto, { verbose: true })} per photo`)
    }
    if (timeElapsedPerPhoto > 0 && photoProcessed > 1) {
      log.info(`whole process took ${prettyMs(timeElapsed, { verbose: true })}`)
      showMetricsTable()
    }
  } else {
    log.info('no photos compressed or date fixed')
  }
}

function killExifTool() {
  if (config.verbose) {
    log.info('killing exif tool instance...')
  }
  exiftool.end()
  return Promise.resolve('success, does not wait for exif-tool killing')
}

function startProcess() {
  startTime = getTimestampMs()
  getDirs()
    .then(() => checkNextDir())
    .then(status => config.verbose ? log.info(status) : true)
    .catch((err) => log.error(err))
    .then(() => showMetrics())
    .catch((err) => log.error(err))
    .then(() => killExifTool())
    .catch((err) => log.error(err))
    .then(() => log.complete('Photo Archiver'))
}

function start() {
  log.start('Photo Archiver (' + process.platform + ')')
  if (config.verbose) {
    log.info('init with config :')
    log.info(config)
  }
  if (config.questions) {
    inquirer.prompt(questions).then(answers => {
      config = { ...config, ...answers }
      startProcess()
    })
  } else {
    startProcess()
  }
}

start()

type PhotoPath = string
type PhotoSet = PhotoPath[]

interface DirInfos {
  name: string // folder name
  year: number
  month: number
}

interface Config extends minimist.ParsedArgs {
  compress: boolean
  forceSsim: boolean
  marker: string // my-photo.jpg => my-photo-archived.jpg
  overwrite: boolean // boolean : will replace original photos / boolean : will use config marker and create new files
  path: string
  processOne: boolean
  questions: boolean
  verbose: boolean
}

// Bug 1
/*
date = new Date('2018-08-31') // Fri Aug 31 2018 02:00:00 GMT+0200
date.setMonth(1)              // Sat Mar 03 2018 02:00:00 GMT+0100
date.setMonth(1)              // Sat Feb 03 2018 02:00:00 GMT+0100
*/

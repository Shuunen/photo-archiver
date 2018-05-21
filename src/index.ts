// tslint:disable:max-file-line-count
import chalk from 'chalk'
import { exec } from 'child_process'
import * as ExifTool from 'exiftool-vendored'
import * as figures from 'figures'
import { readdirSync, statSync } from 'fs'
import * as globby from 'globby'
import * as inquirer from 'inquirer'
import * as minimist from 'minimist'
import { basename, join } from 'path'

const exiftool = new ExifTool.ExifTool()
const argv = minimist(process.argv.slice(2))
const currentPath = process.cwd()
const dirs = []
let startTime = null
let config = {
  basepath: argv.path || currentPath + '/test',
  overwrite: true, // true : will replace original photos / false : will use below suffix and create new files
  suffix: '-archived', // my-photo.jpg => my-photo-archived.jpg
}
declare const Promise
let photosProcessed = 0
const questions = [
  {
    default: config.basepath,
    message: 'Path to photos ?',
    name: 'basepath',
    type: 'input',
  },
  {
    default: config.overwrite,
    message: 'Overwrite photos when compressing ?',
    name: 'overwrite',
    type: 'confirm',
  },
]

function log(...things): Promise<string> {
  console.log(...things) // tslint:disable-line:no-console
  return Promise.resolve('log')
}

function warn(...things): Promise<string> {
  console.error(chalk.yellowBright(figures.pointer, ...things)) // tslint:disable-line:no-console
  return Promise.resolve('warn')
}

function error(...things): string {
  console.error(chalk.redBright(figures.cross, ...things)) // tslint:disable-line:no-console
  return things.join(',')
}

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
      log('dir', dir)
      log('subDir', subDir)
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
    log('found dir(s)', dirs)
    resolve('success')
  })
}

function getFinalPhotoName(photo) {
  return config.overwrite ? photo : photo.replace(/(\.j)/i, config.suffix + '$1')
}

function compress(photo) {
  return new Promise((resolve, reject) => {
    // photo = photo.replace(/\\/g, '/')
    if (photo.indexOf(config.suffix) !== -1) {
      return resolve('success (already processed)')
    }
    // log('compressing "' + photo + '"')
    const photoIn = photo
    const photoOut = getFinalPhotoName(photo)
    const command = `jpeg-recompress --method smallfry "${photoIn}" "${photoOut}"`
    // log('executing command :', command)
    exec(command, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        reject(err)
      } else {
        // the *entire* stdout and stderr (buffered)
        // console.log(`stdout: ${stdout}`);
        // console.log(`stderr: ${stderr}`);
        if (stderr.toString().indexOf('already processed') !== -1) {
          resolve('success (already processed)')
        } else {
          log('compressed "' + photo + '"')
          photosProcessed++
          resolve('success')
        }
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

function getDateFromTags(tags): Date {
  // log('  tags found :', tags)
  /*  log('  ModifyDate :', tags.ModifyDate)
   log('  CreateDate :', tags.CreateDate)
   log('  DateCreated :', tags.DateCreated)
   log('  TimeCreated :', tags.TimeCreated)
   log('  DateTime :', tags.DateTime)
   log('  DateTimeCreated :', tags.DateTimeCreated)
   log('  DateTimeUTC :', tags.DateTimeUTC)
   log('  DateTimeOriginal :', tags.DateTimeOriginal) */
  // tslint:disable-next-line:no-any
  // log('  FileCreateDate :', (tags as any).FileCreateDate)
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

  throw new Error('failed at finding original date')
}

function exif(photo: string, dir: DirInfos) {
  return new Promise((resolve, reject) => {
    if (!dir.year && !dir.month) {
      return resolve('cannot fix exif without year and month')
    }
    const filepath = getFinalPhotoName(photo)
    exiftool.read(filepath)
      .then((tags: ExifTool.Tags) => getDateFromTags(tags))
      .then(originalDate => {
        log('      original date found :', originalDate)
        const newDate = new Date(originalDate)
        const year = newDate.getFullYear()
        const month = newDate.getMonth() + 1
        let doRewrite = false
        if (year !== dir.year) {
          warn('fixing photo year "' + year + '" => "' + dir.year + '"')
          newDate.setFullYear(dir.year)
          doRewrite = true
        }
        if (month !== dir.month) {
          warn('fixing photo month "' + month + '" => "' + dir.month + '"')
          newDate.setMonth(dir.month - 1)
          doRewrite = true
        }
        if (doRewrite) {
          const newDateStr = dateToIsoString(newDate)
          const originalDateStr = dateToIsoString(originalDate)
          log('      should rewrite exif with this date : ' + newDateStr + ', instead of : ' + originalDateStr)
          exiftool
            .write(filepath, { AllDates: newDateStr })
            .then(() => {
              // log('exiftool status after writing :', status) // status is undefined :'(
              resolve('success, updated photo date to : ' + newDateStr)
            })
            .catch(err => {
              error(err)
              reject('failed at writing date exif')
            })
        } else {
          resolve('success, date is good')
        }
      })
      .catch(err => {
        error(err)
        reject('failed at reading exif')
      })
  })
}

async function checkPhotos(photos: PhotoSet, dir: DirInfos) {
  const count = photos.length
  log('found', count, 'photos in dir "' + dir.name + '"')
  // log(photos)
  for (let i = 0; i < count; i++) {
    const photo = photos[i]
    let name = basename(photo)
    if (name.length > 20) {
      name = name.substr(0, 20) + '...'
    }
    const num = i + 1
    const indent = '  ' + num + ' :'
    await log('processing photo', num, '(' + name + ')')
      .then(() => compress(photo))
      .then(status => log(indent, status))
      .then(() => exif(photo, dir))
      .then(status => log(indent, status))
      .catch(err => error(err))
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
  log('reading dir "' + dirName + '"')
  const dateMatches = dirName.match(/(\d{4})\-(\d{2})/)
  let year = null
  let month = null
  if (!dateMatches || !dateMatches.length || dateMatches.length !== 3) {
    warn('failed at detecting year & month')
  } else {
    year = parseInt(dateMatches[1], 10)
    month = parseInt(dateMatches[2], 10)
    log('detected year "' + year + '" and month "' + month + '"')
  }
  const oDir: DirInfos = { name: dirName, year, month }
  const include = join(dir, '**/*.(jpg|jpeg)')
  const exclude = '!' + join(dir, '**/*' + config.suffix + '.(jpg|jpeg)')
  const rules = [include, exclude]
  // log('search files with rules', rules)
  return globby(rules, { nocase: true })
    .then((photos: PhotoSet) => checkPhotos(photos, oDir))
    .then(status => log(status))
    .then(() => checkNextDir())
    .catch(err => error(err))
}

function showMetrics() {
  const timeElapsed = getTimestamp() - startTime
  let timeReadable = timeElapsed + ' seconds'
  if (timeElapsed > 120) {
    timeReadable = Math.round(timeElapsed / 60 * 10) / 10 + ' minutes'
  }
  const averageTimePerPhoto = (Math.round(timeElapsed / photosProcessed * 100) / 100) || 0
  log(`processed ${photosProcessed} photos in ${timeReadable}`)
  if (timeElapsed) {
    log(`with an average of ${averageTimePerPhoto} seconds per photo`)
  }
}

function killExifTool() {
  log('killing exif tool instance...')
  exiftool.end()
  return Promise.resolve('success, does not wait for exif-tool killing')
}

function start() {
  log('Photo Archiver is starting...')
  inquirer.prompt(questions).then(answers => {
    config = { ...config, ...answers }
    startTime = getTimestamp()
    log('start with config :', config)
      .then(() => getDirs())
      .then(() => checkNextDir())
      .then(status => log(status))
      .catch((err) => error(err))
      .then(() => showMetrics())
      .then(() => killExifTool())
      .catch((err) => error(err))
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

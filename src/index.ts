import chalk from 'chalk'
import * as figures from 'figures'
import { readdirSync, statSync } from 'fs'
import * as globby from 'globby'
import * as inquirer from 'inquirer'
import * as minimist from 'minimist'
import { basename, join } from 'path'
import { exec } from 'child_process'

const argv = minimist(process.argv.slice(2))
let basepath = process.cwd()
const dirs = []
let startTime = null
let config = {
  overwrite: false,
  suffix: '-compressed' // my-photo.jpg => my-photo-compressed.jpg
}
declare const Promise: any;
let photosProcessed = 0
const questions = [
  {
    type: 'confirm',
    name: 'overwrite',
    message: 'Overwrite photos when compressing ?',
    default: config.overwrite
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

function error(...things): void {
  console.error(chalk.redBright(figures.cross, ...things)) // tslint:disable-line:no-console
}

function getDirectories(path) {
  return readdirSync(path).filter((file) => {
    return statSync(path + '/' + file).isDirectory()
  })
}

function getTimestamp() {
  return Math.round(Date.now() / 1000)
}

function getPath() {
  if (argv.path) {
    basepath = argv.path
  }
  log('will use basepath :', basepath)
  return Promise.resolve('success')
}

function getDirs() {
  return new Promise((resolve, reject) => {
    getDirectories(basepath).map((dir) => {
      // dir will be succesivly 2013, 2014,...
      const subDir = join(basepath, dir)
      // log('subDir', subDir)
      getDirectories(subDir).forEach((sub) => dirs.push(join(subDir, sub)))
    })
    // if no subdir, just process input dir
    if (!dirs.length) {
      dirs.push(basepath)
    }
    log('found dir(s)', dirs)
    resolve('success')
  })
}

function compress(photo) {
  return new Promise((resolve, reject) => {
    // photo = photo.replace(/\\/g, '/')
    if (photo.indexOf(config.suffix) !== -1) {
      return resolve('success (already processed)')
    }
    // log('compressing "' + photo + '"')
    const photoIn = photo
    const photoOut = config.overwrite ? photo : photo.replace(/(\.j)/i, config.suffix + '$1')
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
    });
  })
}

function compressPhotos(photos) {
  if (!photos.length) {
    return Promise.resolve('no more photos in this directory')
  }
  // extract first
  const photo = photos.shift()
  return compress(photo)
    .then(() => compressPhotos(photos))
    .catch(err => error(err))
}

function checkPhotos(photos, dir) {
  log('found', photos.length, 'photos in dir "' + dir.name + '"')
  // log(photos)
  return compressPhotos(photos)
}

function checkNextDir() {
  if (!dirs.length) {
    return Promise.resolve('no more directory to check')
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
    year = dateMatches[1]
    month = dateMatches[2]
    log('detected year "' + year + '" and month "' + month + '"')
  }
  let oDir = { name: dirName, year, month }
  return globby(join(dir, '**/*.(jpg|jpeg)'), { nocase: true })
    .then((photos) => checkPhotos(photos, oDir))
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

function start() {
  log('Photo Archiver is starting...')
  inquirer.prompt(questions).then(answers => {
    config = { ...config, ...answers }
    startTime = getTimestamp()
    log('start with config :', config)
      .then(() => getPath())
      .then(() => getDirs())
      .then(() => checkNextDir())
      .then(status => log(status))
      .catch((err) => error(err))
      .then(() => showMetrics())
  })
}

start()

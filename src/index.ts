import chalk from 'chalk'
import * as figures from 'figures'
import { readdirSync, statSync } from 'fs'
import * as globby from 'globby'
import inquirer from 'inquirer'
import * as minimist from 'minimist'
import { basename, join } from 'path'
import { exec } from 'child_process'

const argv = minimist(process.argv.slice(2))
let basepath = process.cwd()
const dirs = []
declare const Promise: any;

function log(...thing): void {
  console.log(...thing) // tslint:disable-line:no-console
}

function warn(...thing): void {
  console.error(chalk.yellowBright(figures.pointer, ...thing)) // tslint:disable-line:no-console
}

function error(...thing): void {
  console.error(chalk.redBright(figures.cross, ...thing)) // tslint:disable-line:no-console
}

function getDirectories(path) {
  return readdirSync(path).filter((file) => {
    return statSync(path + '/' + file).isDirectory()
  })
}

function getPath() {
  if (argv.path) {
    basepath = argv.path
  }
  log('will use basepath :', basepath)
}

function getDirs() {
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
}

function compress(photo) {
  return new Promise((resolve, reject) => {
    // photo = photo.replace(/\\/g, '/')
    log('compressing "' + photo + '"')
    const cmd = 'jpeg-recompress --method smallfry "' + photo + '" "' + photo.replace('.jp', '-c.jp') + '"'
    log(cmd)
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        if (err.toString().indexOf('already processed') !== -1) {
          resolve('success (already processed)')
        } else {
          reject(err)
        }
      } else {
        // the *entire* stdout and stderr (buffered)
        // console.log(`stdout: ${stdout}`);
        // console.log(`stderr: ${stderr}`);
        resolve('success')
      }
    });
  })
}

function checkPhotos(photos, dir) {
  log('found', photos.length, 'photos in dir "' + dir.name + '"')
  // log(photos)
  compress(photos[0])
}

function checkNextDir() {
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
  globby(join(dir, '**/*.(jpg|jpeg)'))
    .then((photos) => checkPhotos(photos, oDir))
    .catch((err) => {
      error(err)
    });
}

function start() {
  log('Photo Archiver is starting...')
  getPath()
  getDirs()
  checkNextDir()
}

start()

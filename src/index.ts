import chalk from 'chalk'
import * as figures from 'figures'
import { readdirSync, statSync } from 'fs'
import * as globby from 'globby'
import inquirer from 'inquirer'
import * as minimist from 'minimist'
import { basename, join } from 'path'

const argv = minimist(process.argv.slice(2))
let basepath = process.cwd()
const dirs = []

function log(...thing): void {
  console.log(...thing) // tslint:disable-line:no-console
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
    getDirectories(subDir).forEach((sub) => dirs.push(join(subDir, sub)))
  })
  // log('found dirs', dirs)
}

async function checkNext() {
  // extract first
  const dir = dirs.shift() // full path
  const dirName = basename(dir) // directory/folder name
  log('reading dir "' + dirName + '"')
  const dateMatches = dirName.match(/(\d{4})\-(\d{2})/)
  if (!dateMatches || !dateMatches.length || dateMatches.length !== 3) {
    return error('failed at detecting year & month')
  }
  const year = dateMatches[1]
  const month = dateMatches[2]
  log('detected year "' + year + '" and month "' + month + '"')
  const photos = await globby(join(dir, '**/*.(jpg|jpeg)'))
  log('found', photos.length, 'photos')
  log(photos)
}

function start() {
  log('Photo Archiver is starting...')
  getPath()
  getDirs()
  checkNext()
}

start()

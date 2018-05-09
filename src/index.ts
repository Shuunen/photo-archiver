import chalk from 'chalk'
import * as figures from 'figures'
import inquirer from 'inquirer'
import * as minimist from 'minimist'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

const argv = minimist(process.argv.slice(2))
let path = process.cwd()
let dirs = []

function log(...thing: any[]): void {
  console.log(...thing) // tslint:disable-line:no-console
}

function error(...thing: any[]): void {
  console.error(chalk.redBright(figures.cross, ...thing)) // tslint:disable-line:no-console
}

function getDirectories(path) {
  return readdirSync(path).filter(function(file) {
    return statSync(path + '/' + file).isDirectory()
  })
}

function getPath() {
  if (argv.path) {
    path = argv.path
  }
  log('will use path :', path)
}

function getDirs() {
  getDirectories(path).map((dir) => {
    // dir will be succesivly 2013, 2014,...
    const subDir = join(path, dir)
    getDirectories(subDir).forEach((sub) => dirs.push(join(subDir, sub)))
  })
  log('found dirs', dirs)
}

function start() {
  log('Photo Archiver is starting...')
  getPath()
  getDirs()
}

start()

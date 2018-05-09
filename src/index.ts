import chalk from 'chalk'
import * as figures from 'figures'
import inquirer from 'inquirer'

function log(...thing: string[]): void {
  console.log(...thing) // tslint:disable-line:no-console
}

function error(...thing: string[]): void {
  console.error(chalk.redBright(figures.cross, ...thing)) // tslint:disable-line:no-console
}

log('Photo Archiver is starting...')

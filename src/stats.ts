
import * as chalk from 'chalk'
import * as prettyMs from 'pretty-ms'
import { getTimestampMs } from 'shuutils'
import { ColumnConfig, table, TableUserConfig } from 'table' // eslint-disable-line no-unused-vars
import Config from './config'
import Logger from './logger'
import Stat from './stat'
import Utils from './utils'

class Stats {
  compress: Stat = new Stat()
  dateFix1: Stat = new Stat()
  dateFix2: Stat = new Stat()
  exifRepair1: Stat = new Stat()
  exifRepair2: Stat = new Stat()
  fileCopy: Stat = new Stat()
  fileDeletion: Stat = new Stat()
  photoProcess: Stat = new Stat()
  readDir: Stat = new Stat()
  startTime = 0

  public start (): void {
    this.startTime = getTimestampMs()
  }

  public stop (): void {
    this.showMetrics()
  }

  private getMetricRow (label: string, data: Stat): string[] {
    const row = [label]
    const spacer = '  '
    // Column 1
    if (!data.success) {
      row.push(spacer + '0')
    } else {
      row.push(spacer + chalk.green(data.success.toString()))
    }
    // Column 2
    if (!data.skip) {
      row.push(spacer + '0')
    } else {
      row.push(spacer + chalk.yellow(data.skip.toString()))
    }
    // Column 3
    if (!data.fail) {
      row.push(spacer + '0')
    } else {
      row.push(spacer + chalk.red(data.fail.toString()))
    }
    // Column 4
    row.push(spacer + chalk.white(data.total.toString()))
    // Column 5
    if (!data.failedPaths) {
      row.push(spacer)
    } else {
      row.push(Utils.readableDirs(data.failedPaths))
      // row.push('bla bla bla')
    }
    return row
  }

  private showMetricsTable (): void {
    const data = [
      ['', 'Success', ' Skip', ' Fail', 'Total', 'Failing photo/directory paths'],
      this.getMetricRow('Photos processed', this.photoProcess),
      this.getMetricRow('Compressed', this.compress),
      this.getMetricRow('Date fixed 1/2', this.dateFix1),
      this.getMetricRow('Date fixed 2/2', this.dateFix2),
      this.getMetricRow('Exif repaired 1/2', this.exifRepair1),
      this.getMetricRow('Exif repaired 2/2', this.exifRepair2),
    ]
    if (this.fileDeletion.fail) {
      data.push(this.getMetricRow('File deletions', this.fileDeletion))
    }
    if (this.fileCopy.fail) {
      data.push(this.getMetricRow('File copy', this.fileCopy))
    }
    if (this.readDir.fail) {
      data.push(this.getMetricRow('Dirname parsed', this.readDir))
    }
    const firstColumn: ColumnConfig = { width: 20, alignment: 'right' }
    const countColumn: ColumnConfig = { width: 7 }
    const pathsColumn: ColumnConfig = { width: 120, wrapWord: true }
    const opts: TableUserConfig = {
      columns: {
        0: firstColumn,
        1: countColumn,
        2: countColumn,
        3: countColumn,
        4: countColumn,
        5: pathsColumn,
      },
    }
    if (!Config.silent) {
      console.log(table(data, opts))
    }
    if (this.readDir.fail) {
      Logger.warn('un-parsable directories cannot have their photos date-fixed, you should fix these directory names.\n')
    }
  }

  private showMetrics (): void {
    const timeElapsed: number = getTimestampMs() - this.startTime
    // const timeReadable: string = prettyMs(timeElapsed, { verbose: true })
    const photoProcessed: number = this.photoProcess.total
    const timeElapsedPerPhoto = Math.round(timeElapsed / photoProcessed) || 0
    if (photoProcessed > 0) {
      Logger.log(`\nFound ${photoProcessed} photos, ${this.photoProcess.success} has been processed & ${this.photoProcess.skip || 'no photos'} has been skipped`)
      if (timeElapsedPerPhoto > 0) {
        Logger.log(`Spent an average of ${prettyMs(timeElapsedPerPhoto, { verbose: true })} per photo`)
      }
      if (timeElapsed > 0) {
        Logger.log(`The whole process took ${prettyMs(timeElapsed, { verbose: true })} \n`)
        this.showMetricsTable()
      }
    } else {
      Logger.log('no photos compressed or date fixed')
    }
  }
}

const instance = new Stats()
export default instance

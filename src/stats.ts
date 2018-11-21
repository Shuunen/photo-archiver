
import * as prettyMs from 'pretty-ms'
import chalk from 'chalk'
import { ColumnConfig, table, TableUserConfig } from 'table' // eslint-disable-line no-unused-vars
import { getTimestampMs } from 'shuutils'
import Logger from './logger'

class Stat {
  fail: 0
  failedPaths: string[]
  skip: 0
  success: 0
  count: 0
}

export default class Stats {
  startTime: number
  compress: Stat
  dateFix: Stat
  exifRepair: Stat
  fileDeletion: Stat
  photoProcess: Stat
  readDate: Stat
  readDir: Stat

  constructor () {
    this.startTime = getTimestampMs()
  }

  getMetricRow (label, data) {
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
      row.push(data.failedPaths)
      // row.push('bla bla bla')
    }
    return row
  }

  showMetricsTable () {
    const data = [
      ['', 'Success', ' Skip', ' Fail', 'Fail photo and dir paths'],
      this.getMetricRow('Compressed', this.compress),
      this.getMetricRow('Date fixed', this.dateFix),
      this.getMetricRow('Exif repaired', this.exifRepair)
    ]
    if (this.fileDeletion.fail) {
      data.push(this.getMetricRow('File deletions', this.fileDeletion))
    }
    if (this.readDate.fail) {
      data.push(this.getMetricRow('Date read', this.readDate))
    }
    if (this.readDir.fail) {
      data.push(this.getMetricRow('Dir read', this.readDir))
    }
    // Quick fix until https://github.com/gajus/table/issues/72 is solved
    const optWrap: ColumnConfig = {
      width: 80,
      wrapWord: true
    } as ColumnConfig
    const optNumber: ColumnConfig = {
      width: 7
    }
    const opts: TableUserConfig = {
      columns: {
        0: {
          alignment: 'right'
        },
        1: optNumber,
        2: optNumber,
        3: optNumber,
        4: optWrap
      }
    }
    // tslint:disable-next-line:no-console
    console.log(table(data, opts))
  }

  showMetrics () {
    const timeElapsed: number = getTimestampMs() - this.startTime
    // const timeReadable: string = prettyMs(timeElapsed, { verbose: true })
    const photoProcessed: number = this.photoProcess.count
    const timeElapsedPerPhoto = Math.round(timeElapsed / photoProcessed) || 0
    if (photoProcessed > 0) {
      if (timeElapsedPerPhoto > 0) {
        Logger.info(`spent an average of ${prettyMs(timeElapsedPerPhoto, { verbose: true })} per photo`)
      }
      if (timeElapsedPerPhoto > 0 && photoProcessed > 1) {
        Logger.info(`whole process took ${prettyMs(timeElapsed, { verbose: true })} \n`)
        this.showMetricsTable()
      }
    } else {
      Logger.info('no photos compressed or date fixed')
    }
  }
}

import * as signale from 'signale' // eslint-disable-line no-unused-vars
import Config from './config' // eslint-disable-line no-unused-vars

export default class Logger {
  static start: (...things: Array<{}>) => void = signale.start.bind(signale)
  static complete: (...things: Array<{}>) => void = signale.complete.bind(signale)

  static log (...things: Array<{}>):void {
    if (Config.verbose) {
      signale.log(things)
    }
  }
  static info (...things: Array<{}>):void {
    if (Config.verbose) {
      signale.info(things)
    }
  }

  static warn: (...things: Array<{}>) => void = signale.warn.bind(signale)
  static success: (...things: Array<{}>) => void = signale.success.bind(signale)
  static error (...things: any): void {
    if (things.length === 1) {
      things = things[0]
    }
    if (!Config.verbose && things.message) {
      if (things.message.message) {
        things.message = things.message.message
      } else {
        things = things.message
      }
    }
    signale.error(things)
  }
}

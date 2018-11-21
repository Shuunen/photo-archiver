import * as signale from 'signale' // eslint-disable-line no-unused-vars

export default class Logger {
  static start: (...things: Array<{}>) => void = signale.start.bind(signale)
  static complete: (...things: Array<{}>) => void = signale.complete.bind(signale)
  static log: (...things: Array<{}>) => void = signale.log.bind(signale)
  static info: (...things: Array<{}>) => void = signale.info.bind(signale)
  static warn: (...things: Array<{}>) => void = signale.warn.bind(signale)
  static success: (...things: Array<{}>) => void = signale.success.bind(signale)
  static error: (...things: Array<{}>) => void = signale.error.bind(signale)
}

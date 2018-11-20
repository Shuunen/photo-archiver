import * as signale from 'signale' // eslint-disable-line no-unused-vars

export default class Logger {
  static log: (...things: Array<{}>) => void = signale.log.bind(signale)
  static info: (...things: Array<{}>) => void = signale.info.bind(signale)
  static warn: (...things: Array<{}>) => void = signale.warn.bind(signale)
  static error: (...things: Array<{}>) => void = signale.error.bind(signale)
}

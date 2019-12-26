import * as signale from 'signale' // eslint-disable-line no-unused-vars
import Config from './config' // eslint-disable-line no-unused-vars

class Logger {
  start: (...things: Array<{}>) => void = signale.start.bind(signale)
  complete: (...things: Array<{}>) => void = signale.complete.bind(signale)

  info (...things: Array<{}>): void {
    if (Config.verbose) {
      signale.info(things)
    }
  }

  log: (...things: Array<{}>) => void = signale.log.bind(signale)
  warn: (...things: Array<{}>) => void = signale.warn.bind(signale)
  success: (...things: Array<{}>) => void = signale.success.bind(signale)
  error (...things: any): void {
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

const instance = new Logger()
export default instance


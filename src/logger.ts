import * as signale from 'signale' // eslint-disable-line no-unused-vars
import Config from './config' // eslint-disable-line no-unused-vars

class Logger {
  start (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.start.apply(signale, things)
  }

  complete (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.complete.apply(signale, things)
  }

  info (...things: Array<{}>): void {
    if (Config.silent || !Config.verbose) {
      return
    }
    signale.info.apply(signale, things)
  }

  log (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.log.apply(signale, things)
  }

  warn (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.warn.apply(signale, things)
  }

  success (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.success.apply(signale, things)
  }

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
    signale.error.apply(signale, things)
  }
}

const instance = new Logger()
export default instance

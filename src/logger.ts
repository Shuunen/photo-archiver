import * as signale from 'signale' // eslint-disable-line no-unused-vars
import Config from './config' // eslint-disable-line no-unused-vars

class Logger {
  start (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.start(...things)
  }

  complete (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.complete(...things)
  }

  info (...things: Array<{}>): void {
    if (Config.silent || !Config.verbose) {
      return
    }
    signale.info(...things)
  }

  log (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.log(...things)
  }

  warn (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.warn(...things)
  }

  success (...things: Array<{}>): void {
    if (Config.silent) {
      return
    }
    signale.success(...things)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    signale.error(...things)
  }
}

const instance = new Logger()
export default instance

import * as signale from 'signale'
import Config from './config'

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

  error (...things: any): void {
    if (things.length === 1) {
      things = things[0]
    }
    if (!Config.verbose && typeof things.message !== 'undefined') {
      if (typeof things.message.message !== 'undefined') {
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

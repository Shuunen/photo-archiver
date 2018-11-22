import chalk from 'chalk'
import Config from './config'

export default class Utils {
  static readablePath (path) {
    const regex = /\\+|\/+/gm
    const subst = '/'
    return path.replace(regex, subst)
  }

  static readableDirs (directories, redundantPath = Config.path) {
    return directories.map(dir => {
      return this.readablePath(dir).replace(redundantPath, '')
    }).join(chalk.gray(' & '))
  }
}

import chalk from 'chalk'

export default class Utils {
  static readablePath (path) {
    const regex = /\\+|\/+/gm
    const subst = '/'
    return path.replace(regex, subst)
  }

  static readableDirs (directories, redundantPath = '') {
    const toRemove = redundantPath.length ? this.readablePath(redundantPath) : ''
    return directories.map(dir => {
      return this.readablePath(dir).replace(toRemove, '')
    }).join(chalk.gray(' & '))
  }
}

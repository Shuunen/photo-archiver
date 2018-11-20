import chalk from 'chalk'

export default class Utils {
  static readablePath (path) {
    const regex = /\\+|\/+/gm
    const subst = '/'
    return path.replace(regex, subst)
  }

  static readableDirs (directories, path: string) {
    return directories.map(dir => {
      return this.readablePath(dir).replace(this.readablePath(path), '')
    }).join(chalk.gray(' & '))
  }
}

import chalk from 'chalk'
import { copyFile, stat, unlink } from 'fs'
import { promisify } from 'util'
import Config from './config'

const unlinkAsync = promisify(unlink)
const statAsync = promisify(stat)
const copyFileAsync = promisify(copyFile)

class Utils {
  readablePath (path) {
    const regex = /\\+|\/+/gm
    const subst = '/'
    return path.replace(regex, subst)
  }

  readableDirs (directories, redundantPath = Config.path) {
    return directories.map(dir => {
      return this.readablePath(dir).replace(redundantPath, '')
    }).join(chalk.gray(' & '))
  }

  async fileExists (filepath) {
    return statAsync(filepath)
      .then(stats => stats.isFile())
      .catch(err => {
        if (err.message.includes('no such file')) {
          return false
        }
        throw err
      })
  }

  async deleteFile (filepath) {
    const exists = await this.fileExists(filepath)
    if (!exists) {
      return
    }
    return unlinkAsync(filepath)
  }

  async copyFile (source, dest, overwrite = false) {
    const sourceExists = await this.fileExists(source)
    const destExists = await this.fileExists(dest)
    if (!sourceExists) {
      throw new Error('source does not exists')
    }
    if (destExists) {
      if (!overwrite) {
        throw new Error('destination file exists, set overwrite param to force copy')
      }
      await this.deleteFile(dest)
    }
    return copyFileAsync(source, dest)
  }
}

const instance = new Utils()
export default instance

import * as chalk from 'chalk'
import { copyFile as copyFileFs, stat, unlink } from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import Config from './config'

const unlinkAsync = promisify(unlink)
const statAsync = promisify(stat)
const copyFileAsync = promisify(copyFileFs)

export function readablePath (path: string): string {
  const regex = /\\+|\/+/gm
  const subst = '/'
  return path.replace(regex, subst)
}

export function readableDirectories (directories: string[], redundantPath = Config.path): string {
  return directories.map(directory => {
    if (redundantPath.length > 0) {
      return readablePath(directory).replace(redundantPath, '')
    }
    return readablePath(directory)
  }).join(chalk.gray(' & '))
}

export async function fileExists (filepath: string): Promise<boolean> {
  return await statAsync(filepath)
    .then(stats => stats.isFile())
    .catch(error => {
      if (error.message.includes('no such file') === true) return false
      throw error
    })
}

export async function deleteFile (filepath: string): Promise<void> {
  const exists = await fileExists(filepath)
  if (!exists) {
    return
  }
  return await unlinkAsync(filepath)
}

export async function copyFile (source: string, destination: string, overwrite = false): Promise<void> {
  const sourceExists = await fileExists(source)
  const destinationExists = await fileExists(destination)
  if (!sourceExists) {
    throw new Error('source does not exists')
  }
  if (destinationExists) {
    if (!overwrite) {
      throw new Error('destination file exists, set overwrite param to force copy')
    }
    await deleteFile(destination)
  }
  return await copyFileAsync(source, destination)
}

export async function sleep (ms = 1000): Promise<void> {
  return await new Promise(resolve => setTimeout(resolve, ms))
}

export function join (folderA: string, folderB: string): string {
  return path.posix.join(folderA, folderB)
}

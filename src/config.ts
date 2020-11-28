import * as inquirer from 'inquirer'
import * as minimist from 'minimist'
import { posix } from 'path'
const currentPath = process.cwd().split('\\').join('/')

class ConfigDefaults {
  compress = true
  forceSsim = false
  marker = '-archived' // my-photo.jpg => my-photo-archived.jpg
  overwrite = false // if true replace original photos, else new files will be generated (using config marker)
  path = posix.join(currentPath, '/tests')
  processOne = false
  questions = true
  reArchive = true // true : will replace previously archived files
  silent = false // avoid terminal logging
  verbose = false
}

export const defaults = new ConfigDefaults()

const questions = [
  {
    default: defaults.path,
    message: 'Path to photos ?',
    name: 'path',
    type: 'input',
  },
  {
    default: defaults.overwrite,
    message: 'Overwrite original photos ?',
    name: 'overwrite',
    type: 'confirm',
  },
  {
    default: defaults.reArchive,
    message: 'Overwrite previously archived photos ?',
    name: 'reArchive',
    type: 'confirm',
  },
]

// if process called with --plop --data=2
// argv will looks like ['node', 'C:\path\to\photo-archiver', '--plop', '--data=2']
// and args like ['--plop', '--data=2']
const args = process.argv.slice(2)
const data = minimist(args, { default: defaults })

class Config extends ConfigDefaults {
  constructor (data: minimist.ParsedArgs) {
    super()
    const { compress, forceSsim, marker, overwrite, path, processOne, questions, reArchive, silent, verbose } = data
    this.set({ compress, forceSsim, marker, overwrite, path, processOne, questions, reArchive, silent, verbose })
  }

  async init (): Promise<string> {
    if (this.questions) {
      const answers: ConfigDefaults = await inquirer.prompt(questions)
      this.set({ ...data, ...answers })
      return 'Config augmented via questions'
    }
    return 'Config with defaults'
  }

  set (data: Partial<ConfigDefaults>): void {
    Object.assign(this, data)
  }
}

const instance = new Config(data)
export default instance

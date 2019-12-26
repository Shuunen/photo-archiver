import * as inquirer from 'inquirer'
import * as minimist from 'minimist'
const currentPath = process.cwd()

interface ConfigOptions {
  compress?: boolean
  forceSsim?: boolean
  marker?: string
  overwrite?: boolean
  path?: string
  processOne?: boolean
  questions?: boolean
  reArchive?: boolean
  silent?: boolean
  verbose?: boolean
}

export const defaults: ConfigOptions = {
  compress: true,
  forceSsim: false,
  marker: '-archived', // my-photo.jpg => my-photo-archived.jpg
  overwrite: false, // if true replace original photos, else new files will be generated (using config marker)
  path: currentPath + '/tests',
  processOne: false,
  questions: true,
  reArchive: true, // true : will replace previously archived files
  silent: false, // avoid terminal logging
  verbose: false,
}

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

class Config {
  compress = defaults.compress;
  forceSsim = defaults.forceSsim
  marker = defaults.marker
  overwrite = defaults.overwrite
  path = defaults.path
  processOne = defaults.processOne
  questions = defaults.questions
  reArchive = defaults.reArchive
  silent = defaults.silent
  verbose = defaults.verbose

  constructor (data: minimist.ParsedArgs) {
    // console.log('Config : in constructor')
    const { compress, forceSsim, marker, overwrite, path, processOne, questions, reArchive, silent, verbose } = data
    this.set({ compress, forceSsim, marker, overwrite, path, processOne, questions, reArchive, silent, verbose })
  }

  async init (): Promise<string> {
    if (this.questions) {
      const answers: ConfigOptions = await inquirer.prompt(questions)
      this.set({ ...data, ...answers })
      return 'Config augmented via questions'
    }
    return 'Config with defaults'
  }

  set (data: ConfigOptions): void {
    Object.assign(this, defaults, data)
  }
}

const instance = new Config(data)
export default instance

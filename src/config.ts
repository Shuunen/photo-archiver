import * as inquirer from 'inquirer'
import * as minimist from 'minimist'
const currentPath = process.cwd()

export const defaults = {
  compress: true,
  forceSsim: false,
  marker: '-archived', // my-photo.jpg => my-photo-archived.jpg
  overwrite: false, // true : will replace original photos / false : will use config marker and create new archived files
  path: currentPath + '/tests',
  processOne: false,
  questions: true,
  reArchive: true, // true : will replace previously archived files
  silent: false, // avoid terminal logging
  verbose: false
}

const questions = [
  {
    default: defaults.path,
    message: 'Path to photos ?',
    name: 'path',
    type: 'input'
  },
  {
    default: defaults.overwrite,
    message: 'Overwrite original photos ?',
    name: 'overwrite',
    type: 'confirm'
  },
  {
    default: defaults.reArchive,
    message: 'Overwrite previously archived photos ?',
    name: 'reArchive',
    type: 'confirm'
  }
]

// if process called with --plop --data=2
// argv will looks like ['node', 'C:\path\to\photo-archiver', '--plop', '--data=2']
// and args like ['--plop', '--data=2']
const args = process.argv.slice(2)
const data = minimist(args, { default: defaults })

class Config {
  compress: boolean
  forceSsim: boolean
  marker: string // my-photo.jpg => my-photo-archived.jpg
  overwrite: boolean // if true replace original photos, else new files will be generated (using config marker)
  path: string
  processOne: boolean
  questions: boolean
  reArchive: boolean
  silent: boolean
  verbose: boolean

  constructor (data) {
    // console.log('Config : in constructor')
    this.set(data)
  }

  async init () {
    if (this.questions) {
      const answers = await inquirer.prompt(questions)
      this.set({ ...data, ...answers })
      return 'Config augmented via questions'
    }
    return 'Config with defaults'
  }

  set (data: any) {
    Object.keys(data).forEach(key => {
      this[key] = data[key]
      // console.log('setting "' + key + '" with "' + data[key] + '"')
    })
  }
}

const instance = new Config(data)
export default instance

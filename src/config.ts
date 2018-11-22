import * as minimist from 'minimist' // eslint-disable-line no-unused-vars
import * as inquirer from 'inquirer'
const currentPath = process.cwd()

export const defaults = {
  compress: true,
  forceSsim: false,
  marker: '-archived', // my-photo.jpg => my-photo-archived.jpg
  overwrite: true, // true : will replace original photos / false : will use config marker and create new files
  path: currentPath + '/test',
  processOne: false,
  questions: true,
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
    message: 'Overwrite photos ?',
    name: 'overwrite',
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
  overwrite: boolean // boolean : will replace original photos / boolean : will use config marker and create new files
  path: string
  processOne: boolean
  questions: boolean
  verbose: boolean

  constructor (data) {
    // console.log('Config : in constructor')
    this.set(data)
  }

  init () {
    if (this.questions) {
      return inquirer.prompt(questions).then(answers => {
        this.set({ ...data, ...answers })
        return 'Config augmented via questions'
      })
    }
    return Promise.resolve('Config with defaults')
  }

  set (data) {
    Object.keys(data).forEach(key => {
      this[key] = data[key]
      // console.log('setting "' + key + '" with "' + data[key] + '"')
    })
  }
}

const instance = new Config(data)
export default instance

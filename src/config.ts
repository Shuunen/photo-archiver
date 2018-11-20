import * as minimist from 'minimist' // eslint-disable-line no-unused-vars
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

export default class Config {
  compress: boolean
  forceSsim: boolean
  marker: string // my-photo.jpg => my-photo-archived.jpg
  overwrite: boolean // boolean : will replace original photos / boolean : will use config marker and create new files
  path: string
  processOne: boolean
  questions: boolean
  verbose: boolean

  // if process called with --plop --data=2
  // args will looks like ['--plop', '--data=2']
  constructor (args = []) {
    console.log('args', args)
    const data = minimist(args, { default: defaults })
    Object.keys(data).forEach(key => {
      this[key] = data[key]
      // console.log('setting "' + key + '" with "' + data[key] + '"')
    })
  }
}

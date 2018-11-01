import { ParsedArgs } from 'minimist' // eslint-disable-line no-unused-vars

class Config {
  compress: boolean
  forceSsim: boolean
  marker: string // my-photo.jpg => my-photo-archived.jpg
  overwrite: boolean // boolean : will replace original photos / boolean : will use config marker and create new files
  path: string
  processOne: boolean
  questions: boolean
  verbose: boolean

  constructor (data: ParsedArgs) {
    Object.keys(data).forEach(key => {
      this[key] = data[key]
      console.log('setting "' + key + '" with "' + data[key] + '"')
    })
  }
}

class DirInfos {
  name: string // folder name
  year: number
  month: number
}

type PhotoPath = string
type PhotoSet = PhotoPath[]

export { Config, DirInfos, PhotoPath, PhotoSet }

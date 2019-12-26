/* global PhotoPath, PhotoSet */

class DirInfos {
  name: string // folder name
  year: number
  month: number
}

type PhotoPath = string
type PhotoSet = PhotoPath[]

export { DirInfos, PhotoPath, PhotoSet }

/* global PhotoPath, PhotoSet */

class DirInfos {
  name = '' // folder name
  year = -1
  month = -1
}

type PhotoPath = string
type PhotoSet = PhotoPath[]

export { DirInfos, PhotoPath, PhotoSet }

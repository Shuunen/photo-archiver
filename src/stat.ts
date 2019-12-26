export default class Stat {
  fail: number = 0
  failedPaths: string[] = []
  skip: number = 0
  success: number = 0

  get total () {
    return this.fail + this.skip + this.success
  }
}
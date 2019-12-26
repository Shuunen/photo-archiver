export default class Stat {
  fail = 0
  failedPaths: string[] = []
  skip = 0
  success = 0

  get total (): number {
    return this.fail + this.skip + this.success
  }
}

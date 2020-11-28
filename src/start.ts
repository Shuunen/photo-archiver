import { startProcess } from '.'
import Config from './config'

Config.init().then(async () => await startProcess()).catch((err: Error) => console.error(err))

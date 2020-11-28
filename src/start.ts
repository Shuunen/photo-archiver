import { startProcess } from '.'
import Config from './config'

Config.init().then(async () => await startProcess()).catch((error: Error) => console.error(error))

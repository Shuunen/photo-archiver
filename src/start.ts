import Config from './config'
import { startProcess } from '.'

Config.init().then(() => startProcess()).catch((err: Error) => console.error(err))

import { dirname } from 'path';
import { fileURLToPath } from 'url';

import prompt from 'prompt'
import ora from 'ora'
import crypto from 'crypto'
import Corestore from 'corestore'
import Autobase from 'autobase'

const APP_NAME = process.argv[2]
if (!APP_NAME || !/^\w+$/.test(APP_NAME)) {
  console.error(`app name required`);
  process.exit(1);
}
const STATE_DIR = dirname(fileURLToPath(import.meta.url)) + `/state/${APP_NAME}`

async function main() {
  const spinner = ora()
  prompt.start()
  prompt.message = ''

  spinner.start(`starting ${APP_NAME}...`);

  const corestore = new Corestore(STATE_DIR)
  await corestore.ready()

  const appCore = corestore.get({ name: 'app' })
  console.log('APP CORE', appCore)

  spinner.succeed(`${APP_NAME} ready`);

  const { username } = await prompt.get({
    description: 'Enter your username',
    name: 'username',
    type: 'string',
    pattern: /^[a-zA-Z0-9\-]+$/,
    message: 'Username must be only letters, numbers, or dashes',
    required: true,
  })
  console.log(`welcome back ${username}`)

  // const usernameSha = crypto.createHash('sha256').update(username).digest()
  // console.log(`usernameSha: ` + usernameSha.toString('hex'))

  spinner.start('looking for your account...');
  await new Promise(x => setTimeout(x, 1000))
  spinner.succeed(`found you!`);

  // get the core from the corestore?
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

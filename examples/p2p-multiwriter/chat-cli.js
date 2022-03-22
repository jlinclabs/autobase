import { dirname } from 'path';
import { fileURLToPath } from 'url';

import prompt from 'prompt'
import ora from 'ora'
import crypto from 'crypto'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Autobase from 'autobase'
import ram from 'random-access-memory'
import users from './users.js'

const username = process.argv[2]
if (!(username in users)){
  console.error(`invalid username "${username}"`);
  process.exit(1);
}
const user = users[username]

async function main() {
  const spinner = ora()
  prompt.start()
  prompt.message = ''

  spinner.start(`connecting...`);

  const corestore = new Corestore(ram)
  await corestore.ready()

  // connect to the swarm and subscribe to a topic
  const topicName = `autobase-example-chat-cli`
  const topic = Buffer.from(sha256(topicName), 'hex')
  const swarm = new Hyperswarm()
  swarm.on('connection', (socket) => corestore.replicate(socket))
  swarm.join(topic)
  await swarm.flush()
  process.once('SIGINT', () => swarm.destroy()) // for faster restarts



  // const appCore = corestore.get({ name: 'app' })
  // console.log('APP CORE', appCore)

  spinner.succeed(`connected!`);

  // const { username } = await prompt.get({
  //   description: 'Enter your username',
  //   name: 'username',
  //   type: 'string',
  //   pattern: /^[a-zA-Z0-9\-]+$/,
  //   message: 'Username must be only letters, numbers, or dashes',
  //   required: true,
  // })
  // console.log(`welcome back ${username}`)

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



function sha256 (inp) {
  return crypto.createHash('sha256').update(inp).digest('hex')
}

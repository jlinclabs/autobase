import { dirname } from 'path';
import { fileURLToPath } from 'url';

import prompt from 'prompt'
import ora from 'ora'
import crypto from 'crypto'
import Corestore from 'corestore'
import Hypercore from 'hypercore'
import Hyperswarm from 'hyperswarm'
import DHT from '@hyperswarm/dht'

// import { QueryableLog } from 'queryable-log'

import Autobase from 'autobase'
import ram from 'random-access-memory'
import users from './users.js'

const username = process.argv[2]
if (!(username in users)){
  console.error(`invalid username "${username}"`);
  process.exit(1);
}
const user = users[username]

// SAME AS IN ./hyperspace-server.js
const SWARM_KEY = Buffer.from('604d03ea2045c1adfcb6adad02d71667e03c27ec846fe4f5c4d912c10464aea0', 'hex')

// persist cores per user but assume stored per app in the real world
const STATE_DIR = dirname(fileURLToPath(import.meta.url)) + `/state/${username}`

async function main() {
  // log = new QueryableLog(path.join(configDir, 'hyperspace.log'), {overwrite: true, sizeLimit: 5e6})
  const spinner = ora()
  prompt.start()
  prompt.message = ''

  spinner.start(`connecting as ${username}...`);

  const corestore = new Corestore(STATE_DIR)
  await corestore.ready()



  // const node = new DHT()
  // const remotePublicKey = Buffer.from('09328eb37c6eea2e1e240d6f68cc25f515816e4c5c9190910c93f536561ca447', 'hex')
  // const encryptedSocket = node.connect(remotePublicKey)

  // connect to the swarm and subscribe to a topic
  // const topicName = `autobase-example-chat-cli`
  // const topic = Buffer.from(sha256(topicName), 'hex')
  // console.log('topic=', topic.toString('hex'))
  const topicCore = corestore.get(SWARM_KEY)
  console.log({ topicCore })
  console.log('topicCore', await coreToArray(topicCore))
  await topicCore.ready()


  const swarm = new Hyperswarm()
  swarm.on('connection', (socket) => {
    console.log('New connection from', socket.remotePublicKey.toString('hex'))
    corestore.replicate(socket)
  })
  swarm.join(topicCore.discoveryKey)
  // swarm.join(topic)
  await swarm.flush() // this takes a long time :(
  process.once('SIGINT', () => swarm.destroy()) // for faster restarts
  process.on('exit', function () {
    swarm.destroy()
    corestore.close()
  });

  // const appCore = corestore.get({ name: 'app' })
  // console.log('APP CORE', appCore)

  spinner.succeed(`connected as ${username}`);

  spinner.start('loading messages...');

  console.log('topicCore', await coreToArray(topicCore))

  console.log('STATUS', await swarm.status(SWARM_KEY))

  for (const username in users){
    const { publicKey } = users[username]
    users[username].core = corestore.get({
      key: Buffer.from(publicKey, 'hex'),
      secretKey: user.publicKey === publicKey
        ? Buffer.from(user.secretKey, 'hex')
        : undefined,
    })
  }
  console.log('users', users)

  // update all cores (Autobase does this now)
  // await Promise.all(Object.values(users).map(user => user.core.update()))

  for (const username in users){
    console.log('userCore', username, await coreToArray(users[username].core))
  }

  const combinedOutput = new Hypercore(ram)
  const combined = new Autobase({
    inputs: Object.values(users).map(user => user.core),
    localOutput: combinedOutput,
    autostart: true,
  })
  const clock = await combined.latest()
  // console.log({clock})
  // console.log({combined})

  // const output = await causalValues(combined)
  // console.log('output--->\n')
  // console.log(output)

  for (const username in users){
    console.log('userCore', username, await coreToArray(users[username].core))
  }

  await combined.view.update()
  // console.log('combined.view', combined.view)
  console.log('combined.view', await coreToArray(combined.view))
  console.log('combined.view ???', await causalValues(combined))

  spinner.succeed(`messages loaded!`);


  const append = async payload =>
    await users[username].core.append([ serialize(payload) ])

  await append({ connected: Date.now() })

  process.once('SIGINT', () => {
    append({ disconnected: Date.now() })
  })


  while (true) {
    const { message } = await prompt.get({
      description: `${username}>`,
      name: 'message',
      type: 'string',
      pattern: /^.+$/,
      message: 'a chat message',
      required: false,
    })
    console.log({ message })
    await append({ message, at: Date.now() })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})



function sha256 (inp) {
  return crypto.createHash('sha256').update(inp).digest('hex')
}


async function coreToArray(core){
  const values = await linearizedValues(core)
  return values.map(deserialize)
}

const serialize = payload => JSON.stringify(payload)
const deserialize = msg => JSON.parse(msg)




// helpers taken from hypercore-autobase/test

async function causalValues (base) {
  return collect(base.createCausalStream())
}

async function collect (stream, map) {
  const buf = []
  for await (const node of stream) {
    buf.push(map ? map(node) : node)
  }
  return buf
}

async function linearizedValues (index) {
  const buf = []
  await index.update()
  for (let i = index.length - 1; i >= 0; i--) {
    const indexNode = await index.get(i)
    buf.push(indexNode)
  }
  return buf
}

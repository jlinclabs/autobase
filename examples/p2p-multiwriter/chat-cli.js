import { dirname } from 'path';
import { fileURLToPath } from 'url';

import prompt from 'prompt'
import ora from 'ora'
import crypto from 'crypto'
import Corestore from 'corestore'
import Hypercore from 'hypercore'
import Hyperswarm from 'hyperswarm'
import DHT from '@hyperswarm/dht'
import Autobase from 'autobase'
import ram from 'random-access-memory'

import TOPIC_KEY from './topic.js'
import users from './users.js'
// import swarmKeypair from './swarm-keypair.js'


// SHOULD I BE USING A REOTE HYPERCORE SERVER
// OR DIRECTLY CONNECT TO A SWARM

// HOW ARE APPS INTENDED TO BE SETUP?
//   - EACH APP SERVER IN THE SWARM OR A MICROSERVICE FOR CORES?

// DOES THE HYPERSPACE ABSTRACTION STORE KEYS FOR YOU REMOTELY?


// import { QueryableLog } from 'queryable-log'


const username = process.argv[2]
if (!(username in users)){
  console.error(`invalid username "${username}"`);
  process.exit(1);
}
const user = users[username]


// persist cores per user but assume stored per app in the real world
const STATE_DIR = dirname(fileURLToPath(import.meta.url)) + `/state/${username}`

async function main() {
  // log = new QueryableLog(path.join(configDir, 'hyperspace.log'), {overwrite: true, sizeLimit: 5e6})
  const spinner = ora()
  prompt.start()
  prompt.message = ''

  spinner.start(`connecting as ${username}...`)

  const corestore = new Corestore(STATE_DIR)
  // await corestore.ready()

  const swarm = new Hyperswarm()
  // Setup corestore replication
  swarm.on('connection', (socket) => {
    console.log('New connection from', socket.remotePublicKey.toString('hex'))
    // console.log("REPLCIATE" + store.replicate)
    corestore.replicate(socket, {
      keepAlive: true,
    })
  })
  process.once('SIGINT', () => swarm.destroy()) // for faster restarts
  process.on('exit', function () {
    swarm.destroy()
    corestore.close()
  });

  const topicCore = corestore.get(TOPIC_KEY)
  await topicCore.ready()
  swarm.join(topicCore.discoveryKey)
  // swarm.join(topic, { server: false, client: true })

  // Make sure we have all the connections
  await swarm.flush()


  // Make sure we have the latest length
  await topicCore.update()
  console.log('topicCore', topicCore)
  console.log('topicCore', await coreToArray(topicCore))

  // get corestores for all our users
  for (const username in users){
    const { publicKey } = users[username]
    users[username].core = corestore.get({
      key: Buffer.from(publicKey, 'hex'),
      secretKey: user.publicKey === publicKey
        ? Buffer.from(user.secretKey, 'hex')
        : undefined,
    })
    // do we need to replicate here?
  }

  // update all cores (Autobase does this now)
  await Promise.all(Object.values(users).map(user => user.core.update()))

  for (const username in users){
    console.log(username, await coreToArray(users[username].core))
  }

  spinner.succeed(`connected as ${username}`);

  spinner.start('loading messages...');

  console.log('topicCore', await coreToArray(topicCore))

  spinner.succeed(`messages loaded!`);

  const append = async payload =>
    await users[username].core.append([ serialize(payload) ])

  await append({ connected: Date.now() })

  process.once('SIGINT', () => {
    append({ disconnected: Date.now() })
  })

  function getChatLogEntires(){
    const entries = []
    for (const username in users){
      coreToArray(users[username].core)
      await coreToArray(topicCore)
    }
    return entries
  }

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

    for (const logEntry of getChatLogEntires()){
      console.log(logEntry)
    }

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

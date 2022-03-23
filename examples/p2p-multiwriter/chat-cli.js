import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { inspect } from 'util'

import crypto from 'crypto'
import Corestore from 'corestore'
import Hypercore from 'hypercore'
import Hyperswarm from 'hyperswarm'
import DHT from '@hyperswarm/dht'
import Autobase from 'autobase'
import ram from 'random-access-memory'
import blessed from 'blessed'

import TOPIC_KEY from './topic.js'
import users from './users.js'




const username = process.argv[2]
if (!(username in users)){
  console.error(`invalid username "${username}"`)
  process.exit(1)
}
const user = users[username]


// Create a screen object.
const screen = blessed.screen({
  smartCSR: true,
})
screen.title = 'Hypercore Chat Example'

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  shutdown()
  // return process.exit(0)
})

const chatLog = blessed.log({
  title: 'Hypercore Chat Demo',
  top: '0',
  left: '0',
  right: '0',
  width: '100%',
  // height: '100%-3',
  height: '100%',
  // height: '90%',
  content: '',
  content: ` ROWS ${screen.rows} ${screen.rows / 100}`,
  scrollOnInput: true,
  // tags: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    // bg: 'magenta',
    border: {
      fg: '#f0f0f0'
    },
  }
})
const log = (...msgs) => chatLog.log(
  ...msgs.map(msg =>
    typeof msg === 'string' ? msg : inspect(msg, {colorize: true})
  )
)
screen.append(chatLog)
screen.key('C-c', shutdown);
screen.render()

let inputBox
function renderInputBox(){
  chatLog.height = '90%'
  inputBox = blessed.textbox({
    // title: 'new chat message',
    parent: screen,
    top: '90%',
    left: '0',
    right: '0',
    bottom: '0',
    width: '100%',
    // height: 'shrink',
    // height: '10%',
    // height: `10%`,
    height: `shrink`,
    // height: '10',
    // rows: 13,
    shadow: true,
    inputOnFocus: true,
    // content: `${username}> `,
    content: '',
    // tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
    }
  })
  screen.append(inputBox)
  inputBox.key('C-c', shutdown);

  inputBox.key('enter', function(ch, key){
    const message = inputBox.value
    inputBox.emit('newMessage', message);
    // log(message);
    inputBox.clearValue()
    screen.render();
    focusInputBox()
  })

  function focusInputBox(){
    inputBox.focus()
    // inputBox.readInput()
    screen.render()
  }
  focusInputBox()
}


// import swarmKeypair from './swarm-keypair.js'


// SHOULD I BE USING A REOTE HYPERCORE SERVER
// OR DIRECTLY CONNECT TO A SWARM

// HOW ARE APPS INTENDED TO BE SETUP?
//   - EACH APP SERVER IN THE SWARM OR A MICROSERVICE FOR CORES?

// DOES THE HYPERSPACE ABSTRACTION STORE KEYS FOR YOU REMOTELY?


// import { QueryableLog } from 'queryable-log'




// persist cores per user but assume stored per app in the real world
const STATE_DIR = dirname(fileURLToPath(import.meta.url)) + `/state/${username}`

const corestore = new Corestore(STATE_DIR)

const swarm = new Hyperswarm()

async function shutdown() {
  screen.destroy()
  swarm.destroy()
  corestore.close()
}

async function main() {
  // await corestore.ready()

  log(`connecting as ${username}...`)


  // Setup corestore replication
  swarm.on('connection', (socket) => {
    log('New connection from', socket.remotePublicKey.toString('hex'))
    // console.log("REPLCIATE" + store.replicate)
    corestore.replicate(socket, {
      keepAlive: true,
    })
  })

  const topicCore = corestore.get(TOPIC_KEY)
  log(`joining swarm topic ${TOPIC_KEY.toString('hex')}`)

  // await topicCore.ready()
  // swarm.join(topicCore.discoveryKey)
  // // swarm.join(topic, { server: false, client: true })
  // // Make sure we have all the connections
  // await swarm.flush()


  // Make sure we have the latest length
  await topicCore.update()
  log('topicCore', topicCore)
  log('topicCore', await coreToArray(topicCore))

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

  // for (const username in users){
  //   log(username, await coreToArray(users[username].core))
  // }

  log(`connected as ${username}`)

  log('loading messages...')

  log('topicCore', await coreToArray(topicCore))

  log(`messages loaded!`)

  const append = async payload =>
    await users[username].core.append([ serialize(payload) ])

  await append({ connected: Date.now() })

  process.once('SIGINT', () => {
    append({ disconnected: Date.now() })
  })

  async function getChatLogEntires(){
    const entries = []
    for (const username in users){
      for (const entry of await coreToArray(users[username].core)){
        entries.push({...entry, username})
      }
    }
    return entries
  }

  renderInputBox()

  inputBox.on('newMessage', message => {
    append({ message, at: Date.now() })
    log(message)
  })
  // while (true) {
  //   const { message } = await prompt.get({
  //     description: `${username}>`,
  //     name: 'message',
  //     type: 'string',
  //     pattern: /^.+$/,
  //     message: 'a chat message',
  //     required: false,
  //   })
  //   log({ message })

  //   for (const logEntry of await getChatLogEntires()){
  //     log(logEntry)
  //   }

  //   await append({ message, at: Date.now() })
  // }
}

main().catch(error => {
  shutdown()
  console.error(error)
  process.exit(1)
})



function sha256 (inp) {
  return crypto.createHash('sha256').update(inp).digest('hex')
}


async function coreToArray(core){
  const array = []
  for (let i = core.length - 1; i >= 0; i--)
    array[i] = deserialize(await core.get(i))
  return array
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


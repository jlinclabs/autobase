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
// import { QueryableLog } from 'queryable-log'

import TOPIC_KEY from './topic.js'
import users from './users.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const username = process.argv[2]
if (!(username in users)){
  console.error(`invalid username "${username}"`)
  process.exit(1)
}
const user = users[username]

let screen
let corestore
let swarm
let topicCore

async function main() {
  createTerminalScreen()

  await connect()

  await loadCoresForEachUser()

  const append = async payload =>
    await users[username].core.append([ serialize(payload) ])

  await append({ connected: true, at: Date.now() })

  process.once('SIGINT', () => {
    append({ disconnected: Date.now() })
  })

  setInterval(checkForNewMessages, 200)

  renderChatLogEntires()
  screen.showInputBox()

  screen.on('newChatMessage', message => {
    append({ message, at: Date.now() })
      .then(renderChatLogEntires)
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

  //   for (const logEntry of await renderChatLogEntires()){
  //     log(logEntry)
  //   }

  //   await append({ message, at: Date.now() })
  // }
}

main().catch(error => {
  screen.destroy()
  console.error(error)
  try{ shutdown() }catch(error){ console.error(error) }
  process.exit(1)
})


function createTerminalScreen(){
  let inputBox

  // Create a screen object.
  screen = blessed.screen({
    smartCSR: true,
  })
  screen.title = 'Hypercore Chat Example'

  // Quit on Escascreen.key('C-c', shutdown);pe, q, or Control-C.
  screen.key(['escape', 'q', 'C-c'], disconnect)

  const chatLog = blessed.log({
    parent: screen,
    title: 'Hypercore Chat Demo',
    top: '0',
    left: '0',
    right: '0',
    width: '100%',
    // height: '100%-3',
    height: '100%',
    // height: '90%',
    content: '',
    scrollOnInput: true,
    tags: true,
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

  screen.setChatLog = content => chatLog.setContent(content)
  screen.appendChatLog = msg => chatLog.log(msg)

  screen.showInputBox = () => {
    chatLog.height = '90%'
    inputBox = blessed.textbox({
      // title: 'new chat message',
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
    // screen.append(inputBox)
    inputBox.key('C-c', disconnect);

    inputBox.key('enter', function(ch, key){
      const message = inputBox.value
      screen.emit('newChatMessage', message);
      // log(message);
      inputBox.clearValue()
      screen.render();
      focusInputBox()
    })
    screen.append(inputBox)
    focusInputBox()

    function focusInputBox(){
      inputBox.focus()
      // inputBox.readInput()
      screen.render()
    }
  }

  screen.hideInputBox = () => {
    chatLog.height = '100%'
    screen.remove(inputBox)
    inputBox = undefined
  }

  screen.render()
}

async function log(...msgs){
  msgs.forEach(msg => {
    screen.appendChatLog(
      typeof msg === 'string' ? msg : inspect(msg, {colorize: true})
    )
  })
}



async function connect() {
  log(`connecting as ${username}...`)

  // persist cores per user but assume stored per app in the real world
  const STATE_DIR =`${__dirname}/state/${username}`

  corestore = new Corestore(STATE_DIR)
  swarm = new Hyperswarm()

  // await corestore.ready()


  // Setup corestore replication
  swarm.on('connection', (socket) => {
    log('New connection from', socket.remotePublicKey.toString('hex'))
    // console.log("REPLCIATE" + store.replicate)
    corestore.replicate(socket, {
      keepAlive: true,
    })
  })

  topicCore = corestore.get(TOPIC_KEY)
  log(`joining swarm topic ${TOPIC_KEY.toString('hex')}`)

  await topicCore.ready()
  swarm.join(topicCore.discoveryKey)
  // swarm.join(topic, { server: false, client: true })

  // this is slow :(
  // // Make sure we have all the connections
  // await swarm.flush()

  // log('topicCore', await coreToArray(topicCore))


  // Make sure we have the latest length
  await topicCore.update()
  log('topicCore', topicCore)
  log('topicCore', await coreToArray(topicCore))

  log(`connected as ${username}`)
}

async function loadCoresForEachUser(){
  log('loading messages...')

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

  // update all cores
  //   (Autobase would do this for us)
  await Promise.all(Object.values(users).map(user => user.core.update()))

  for (const username in users){
    log(username, await coreToArray(users[username].core))
  }
  log(`messages loaded!`)
}


async function renderChatLogEntires(){
  let entries = []
  for (const username in users){
    const { core } = users[username]
    await core.update()
    for (const entry of await coreToArray(core))
      entries.push({...entry, username})
  }
  entries = entries
    .filter(e => !!e.at)
    .sort((a, b) => {
      a = a.at
      b = b.at
      return a < b ? -1 : a > b ? 1 : 0
    })

  for (const e of entries){
    const date = new Date(e.at).toLocaleDateString(
      'en-us',
      {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      }
    )
    const ours = e.username === username
    log(
      `{grey-fg}${date}{/} | ` +
      `{blue-fg}${ours ? '{bold}' : ''}${e.username}{/}` +
      `{white-fg}:{/} ` + (
        e.connected ? '{grey-fg}[connected]' :
        `{white-fg}${e.message}`
      ) + `{/}`
    )
  }
  return entries
}

async function checkForNewMessages(){
  // for (const username in users){
  //   const user = users[username]
  //   const lastCoreLength = user.core.length - 1
  //   log(username, user.core)
  //   await user.core.update()
  //   // if (lastCoreLength < user.core.length){
  //   //   while (let i = lastCoreLength; i <= user.core.length; i++) {
  //   //     log()
  //   //     we need to handle log messages better
  //   //   }
  //   // }

  //   // log(username, user.core)
  //   // TODO check the start/head of each core?
  // }
  let reRender = false
  await Promise.all(Object.values(users).map(async user => {
    const lastLength = user.core.length
    await user.core.update()
    if (!reRender && user.core.length > lastLength) reRender = true
  }))
  if (reRender){
    chatLog.setContent('')
    renderChatLogEntires()
  }
}

async function disconnect() {

}

async function shutdown() {

  screen.hideInputBox()
  log('shutting down…')
  await swarm.destroy()
  await corestore.close()
  await screen.destroy()
}





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


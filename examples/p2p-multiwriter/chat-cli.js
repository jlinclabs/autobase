/* UI/UX packages */
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { inspect } from 'util'
import blessed from 'blessed'

/* Hypercore packages */
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'

/* data that would normally be in disparate app databases */
import TOPIC_KEY from './topic.js'
import users from './users.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const username = process.argv[2]
const user = users[username]
if (!user){
  console.error(
    `invalid username "${username}". Must be one of:`,
    Object.keys(users),
  )
  process.exit(1)
}


let screen
let corestore
let swarm
let topicCore
let newMessagePollingTimeoutId

async function main(){
  createTerminalScreen()
  await connect()
  await updateAllUserCores()
  checkForNewMessages()
  // ¿ Can this polling be replaced with "live" replacation ?
  newMessagePollingTimeoutId = setInterval(checkForNewMessages, 200)
  await renderNewChatLogEntires()
  screen.showInputBox()
}

main().catch(error => {
  screen.destroy()
  console.error(error)
  try{ shutdown() }catch(error){ console.error(error) }
  process.exit(1)
})

/*
  Hypercore functions:
*/
async function updateAllUserCores(){
  // NOTE: Autobase would do this for us
  const cores = Object.values(users).map(user => user.core)
  await Promise.all(cores.map(core => core.update()))
}

let lastRenderedEntry
async function renderNewChatLogEntires(){
  // TODO replace this with an instance of Autobase

  let entries = []
  for (const username in users){
    const { core } = users[username]
    // await core.update()
    for (const entry of await coreToArray(core))
      entries.push({...entry, username})
  }
  entries = entries
    // filter out logs that we've already rendered
    // NOTE: using a timestamp approach fails to
    //       handle edge-case of identically
    //       timed messages
    .filter(e =>  e.at)
    .sort((a, b) => (
      a.at < b.at ? -1 :
      a.at > b.at ? 1 :
      a.username < b.username ? -1 :
      a.username > b.username ? 1 :
      0
    ))
    .filter(e =>
      !lastRenderedEntry ||
      e.at > lastRenderedEntry.at ||
      (e.at === lastRenderedEntry.at && e.username !== lastRenderedEntry.username)
    )

  if (entries.length === 0) return
  lastRenderedEntry = entries[entries.length - 1]
  for (const entry of entries) screen.appendChatLog(chatLogEntryToScreenLog(entry))
}

function chatLogEntryToScreenLog(e){
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
  return (
    `{grey-fg}${date}{/} | ` +
    `{blue-fg}${ours ? '{bold}' : ''}${e.username}{/}` +
    `{white-fg}:{/} ` + (
      e.connected ? '{grey-fg}[connected]' :
      e.disconnected ? '{grey-fg}[disconnected]' :
      `{white-fg}${e.message}`
    ) + `{/}`
  )
}

async function checkForNewMessages(){
  await updateAllUserCores()
  await renderNewChatLogEntires()
}

async function appendToUserCore(...messages){
  messages = messages.map(msg => ({...msg, at: Date.now() }))
  await user.core.append(...messages.map(serialize))
  return messages
}

async function sendNewMessage(message){
  await appendToUserCore({ message })
  await user.core.update()
  await renderNewChatLogEntires()
}

async function disconnect() {
  log('disconnecting…')
  await appendToUserCore({ disconnected: true })
  await shutdown()
}

async function shutdown() {
  clearTimeout(newMessagePollingTimeoutId)
  screen.hideInputBox()
  log('shutting down…')
  await swarm.destroy()
  await corestore.close()
  screen.destroy()
}

async function coreToArray(core){
  const array = []
  for (let i = core.length - 1; i >= 0; i--)
    array[i] = deserialize(await core.get(i))
  return array
}

const serialize = payload => JSON.stringify(payload)
const deserialize = msg => JSON.parse(msg)

/*
  Terminal UI functions:
*/

function createTerminalScreen(){
  screen = blessed.screen({
    smartCSR: true,
  })
  screen.title = 'Hypercore Chat Example'

  screen.key(['escape', 'q', 'C-c'], disconnect)

  screen.chatLog = blessed.log({
    parent: screen,
    top: '0',
    left: '0',
    right: '0',
    width: '100%',
    height: '100%',
    content: '',
    scrollOnInput: true,
    tags: true,
    border: { type: 'line' },
    style: {
      fg: 'white',
      border: { fg: '#f0f0f0' },
    }
  })

  screen.appendChatLog = msg => screen.chatLog.log(msg)

  screen.showInputBox = () => {
    screen.chatLog.height = '90%'
    screen.inputBox = blessed.textbox({
      top: '90%',
      left: '0',
      right: '0',
      bottom: '0',
      width: '100%',
      height: `shrink`,
      shadow: true,
      inputOnFocus: true,
      content: '',
      tags: false,
      border: { type: 'line' },
      style: { fg: 'white' },
    })
    screen.inputBox.key('C-c', disconnect);

    screen.inputBox.key('enter', function(ch, key){
      const msg = screen.inputBox.value
      if (!msg || msg.trim() === '') return
      sendNewMessage(msg)
      screen.inputBox.clearValue()
      screen.render()
      screen.inputBox.focus()
    })

    screen.append(screen.inputBox)
    screen.inputBox.focus()
  }

  screen.hideInputBox = () => {
    screen.chatLog.height = '100%'
    screen.remove(screen.inputBox)
    delete screen.inputBox
  }

  screen.render()
}

async function log(...msgs){
  msgs.forEach(msg => {
    screen.appendChatLog(msg)
  })
}

async function debug(...msgs){
  log(
    `{grey-fg}[debug]{/} ` +
    msgs
      .map(msg =>
        typeof msg === 'string'
          ? `{grey-fg}${msg}{/}`
          : inspect(msg, {colorize: true})
      )
      .join(' ')
  )
}

async function connect() {
  log(`connecting as ${username}...`)
  // persist cores per user but assume we would store user cores per-app in the real world
  const STATE_DIR =`${__dirname}/state/${username}`
  debug(`hypercores stored in ` + STATE_DIR)

  corestore = new Corestore(STATE_DIR)
  swarm = new Hyperswarm()
  // await corestore.ready()

  // Setup corestore replication
  swarm.on('connection', (socket) => {
    debug('new peer connection from ' + socket.remotePublicKey.toString('hex'))
    // console.log("REPLCIATE" + store.replicate)
    corestore.replicate(socket, {
      keepAlive: true,
      // live?
    })
    checkForNewMessages()
  })

  topicCore = corestore.get(TOPIC_KEY)
  log(`joining swarm topic ${TOPIC_KEY.toString('hex')}`)

  await topicCore.ready()
  swarm.join(topicCore.discoveryKey)
  // swarm.join(topic, { server: false, client: true })

  // Make sure we have all the connections
  // await swarm.flush() // ¿ Do we need to wait for this? It's slow
  swarm.flush().then(() => { debug('connected to swarm!') })

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

  await appendToUserCore({ connected: true })
  log(`connected as ${username}`)
}

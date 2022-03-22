import Corestore from 'corestore'
import Hypercore from 'hypercore'
import Hyperswarm from 'hyperswarm'
import DHT from '@hyperswarm/dht'
import ram from 'random-access-memory'

import TOPIC_KEY from './topic.js'

async function main(){
  const corestore = new Corestore(ram)
  await corestore.ready()
  const swarm = new Hyperswarm({
    // keyPair: swarmKeypair,
    // // bootstrap: ['host:port'],
    // bootstrap: [
    //   // { host: '127.0.0.1', port: 49736 },
    //   { host: '0.0.0.0', port: 53091 },
    // ]
  })
  swarm.on('connection', (socket) => {
    console.log('New connection from', socket.remotePublicKey.toString('hex'))
    corestore.replicate(true, socket)
  })
  const topicCore = corestore.get(TOPIC_KEY)
  swarm.join(topicCore.discoveryKey)
  await topicCore.ready()
  await topicCore.update()
  console.log({ topicCore })
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

import DHT from '@hyperswarm/dht'

async function main() {
  // Make a Hyperswarm DHT node that connects to the global network.
  const node = new DHT()

  const server = node.createServer(function (encryptedSocket) {
    // Called when a new connection arrives.
    console.log('New connection from', encryptedSocket.remotePublicKey.toString('hex'))
    encryptedSocket.write('Hello world!')
    encryptedSocket.end()
  })

  // const keyPair = DHT.keyPair()
  const keyPair = {
    publicKey: Buffer.from("604d03ea2045c1adfcb6adad02d71667e03c27ec846fe4f5c4d912c10464aea0", 'hex'),
    secretKey: Buffer.from("4e9e145fd2f18c6e5b3d86710972d88a8f5c8d8434f07da7c35b3340728f4ee2604d03ea2045c1adfcb6adad02d71667e03c27ec846fe4f5c4d912c10464aea0", 'hex'),
  }
  await server.listen(keyPair)

  // Server is now listening.
  console.log('Connect to:', keyPair.publicKey.toString('hex'))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})


// import DHT from '@hyperswarm/dht'

// async function main(){
//   const bootstrapper = new DHT({
//     bootstrap: false
//   })
//   bootstrapper.listen()
//   await new Promise(resolve => {
//     return bootstrapper.once('listening', resolve)
//   })
//   const post = bootstrapper.address().port
//   const bootstrap = [`localhost:${bootstrapPort}}`]

//   console.log({ port, bootstrap })
//   // const simulatorId = `hyperspace-simulator-${process.pid}`

//   // server = new HyperspaceServer({
//   //   host: simulatorId,
//   //   storage: ram,
//   //   network: {
//   //     bootstrap: bootstrap,
//   //     preferredPort: 0
//   //   },
//   //   noMigrate: true
//   // })
//   // await server.open()
// }

// main().catch(error => {
//   console.error(error)
//   process.exit(1)
// })

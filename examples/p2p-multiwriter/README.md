# peer to peer multiwriter example


You can start as many instance of "the app" using uniqe names.

In two terminals run the following commands:

```bash
# terminal 1
node app.js alpha
# terminal 2
node app.js beta
```

each app should write its cache/db/state to ./tmp/$(appname)/

each app should join the same swarm





if two apps can find each other via a hyperswarm-dht then how
to two apps share any db they can both write to? do we need an
open published hypercore to add core-keys too so other apps know
what to read from?


maybe a shared hyperbee for apps?


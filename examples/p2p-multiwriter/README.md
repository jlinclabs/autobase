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



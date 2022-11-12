## express-mini

Minimalistic Express-like web server with zero dependencies.

### Installation

```
npm i @andrei-markeev/express-mini
```

### Usage

```ts

import * as app from "@andrei-markeev/express-mini"

app.get("/hello", async () => ({ text: "Hello world!" }));
app.get("/test", async () => ({ html: "<html><body><h1>Test</h1></body></html>" }));

app.listen(3000, () => console.log("Server listens on port 3000"))

```

Server will serve static files from the `public` folder (relative to the script directory).

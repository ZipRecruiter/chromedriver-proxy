

/**
* Copyright (c) 2017 ZipRecruiter
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
* */

const http = require('http');
const httpProxy = require('http-proxy');
const ChromeDriver = require('./chromedriver.js');
const ChromePool = require('./chrome_pool.js');
const debug = require('debug')('chromedriver_proxy:proxy');

class HttpServer {
  constructor(config) {
    const c = config || {};
    this.port = c.port || 4444;
    this.baseUrl = c.baseUrl || null;
    if (this.baseUrl !== null && !this.baseUrl.startsWith('/')) {
      this.baseUrl = `/${this.baseUrl}`;
    }
    if (this.baseUrl !== null && this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.substring(0, this.baseUrl.length - 1);
    }
    if (this.baseUrl !== null) {
      this.endBaseUrl = this.baseUrl.length;
    }
  }

  start(opts, fn) {
    const options = opts || {};
    const self = this;
    const timeout = options.timeout || -1;
    const keepAliveTimeout = options.keepAliveTimeout || 0;

    options.chromedriver = options.chromedriver || {};
    options.chromePool = options.chromePool || {};
    options.screenRecorder = options.chromePool.screenRecorder || {};

    const tmpDir = options.tmpDir || '/tmp';
    options.chromedriver.tmpDir = options.chromedriver.tmpDir || tmpDir;
    options.chromePool.tmpDir = options.chromePool.tmpDir || tmpDir;
    options.screenRecorder.tmpDir = options.screenRecorder.tmpDir || tmpDir;


    self.chromedriver = new ChromeDriver(options.chromedriver);
    const chromedriverStart = self.chromedriver.start();

    self.chromepool = new ChromePool(options.chromePool);
    const bypassChromePool = !self.chromepool.enable;

    self.activeSessions = {};
    self.screenRecorders = {};

    self.httpAgent = http.globalAgent;
    self.httpAgent.maxSockets = 10000;
    self.httpAgent.keepAlive = true;
    self.httpAgent.keepAliveMsecs = 30000;

    //
    // Create a proxy server with custom application logic
    //
    const proxyConfig = {
      agent: self.httpAgent,
    };
    if (timeout !== -1) {
      proxyConfig.proxyTimeout = timeout;
    }
    const proxy = httpProxy.createProxyServer(proxyConfig);

    proxy.on('error', (err, req, res) => {
      res.writeHead(500, {});
      const blob = JSON.stringify({
        message: err.message,
        stack: err.stack,
      });
      res.end(blob);
      debug(`proxy error: ${blob}`);
    });


    if (!bypassChromePool) {
      proxy.on('proxyRes', (proxyRes, req) => {
        if (req.method === 'DELETE' && req.url.length === 41) {
          const sessionId = req.url.substring(9);
          const port = self.activeSessions[sessionId];
          self.chromepool.put(port);
          delete self.activeSessions[sessionId];
          debug(`Delete session: ${sessionId} at port: ${port}`);
        }
      });
    }

    const chromedriverEndpoint = `http://127.0.0.1:${self.chromedriver.port}`;

    //
    // Create your custom server and just call `proxy.web()` to proxy
    // a web request to the target passed in the options
    // also you can use `proxy.ws()` to proxy a websockets request
    //
    self.server = http.createServer((req, res) => {
      if (timeout !== -1) {
        res.setTimeout(timeout, () => {
          res.write(JSON.stringify({ value: { error: 'TIMEOUT', message: 'proxy timeout', stacktrace: '' } }));
          res.end();
        });
      }
      if (self.baseUrl !== null) {
        req.url = req.url.substring(self.endBaseUrl);
      }
      if (bypassChromePool) {
        proxy.web(req, res, { target: chromedriverEndpoint });
        return;
      }

      const path = req.url.slice(42);
      if (req.url === '/session' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', () => {
          const caps = JSON.parse(body);
          debug(caps.desiredCapabilities);
          caps.desiredCapabilities.chromeOptions = caps.desiredCapabilities.chromeOptions || caps.desiredCapabilities['goog:chromeOptions'] || {};
          self.chromepool.get({ args: caps.desiredCapabilities.chromeOptions.args })
            .then(port => self.chromepool.getAgent({ port }).then(() => port)).then((port) => {
              caps.desiredCapabilities.chromeOptions.debuggerAddress = `127.0.0.1:${port}`;
              const nbody = JSON.stringify(caps);
              req.headers['Content-Length'] = Buffer.byteLength(nbody);

              const proxiedReq = http.request({
                port: 4445,
                method: req.method,
                path: req.url,
                headers: req.headers,
                agent: self.httpAgent,
                timeout: 2000,
                hostname: 'localhost',
              }, (resp) => {
                res.writeHead(resp.statusCode, resp.headers);
                let sessionBlob = '';
                resp.on('data', (chunk) => {
                  sessionBlob += chunk;
                  res.write(chunk);
                });
                resp.on('end', () => {
                  const sessionInfo = JSON.parse(sessionBlob);
                  if (sessionInfo.status === 0) {
                    const { sessionId } = sessionInfo;
                    self.activeSessions[sessionId] = port;
                    debug(`Started session: ${sessionId} at port: ${port}`);
                  } else {
                    // ahhhhhhhhhhhh  something broke!!!  ...
                  }
                  res.end();
                });
              });

              proxiedReq.on('error', (err) => {
                debug(err);
                res.writeHead(500);
                res.end();
              });

              proxiedReq.write(nbody);
              proxiedReq.end();
            }).catch((err) => {
              debug(err);
              res.writeHead(500);
              res.end(err);
            });
        });
      } else if (path.slice(0, 18) === 'chromedriver-proxy') {
        const sessionId = req.url.substring(9, 41);
        const body = [];
        const port = self.activeSessions[sessionId];
        req.on('data', (chunk) => { body.push(chunk); });
        req.on('end', () => {
          debug('start proxy request to chrome agent');
          self.chromepool.sendToAgent({
            action: 'req',
            port,
            value: {
              path: path.slice(19),
              sessionId,
              httpMethod: req.method,
              body: Buffer.concat(body).toString(),
            },
          }).then((result) => {
            res.write(JSON.stringify({
              status: 0,
              value: result,
            }));
            res.end();
            debug('end proxy request to chrome agent');
          }).catch((err) => {
            res.writeHead(500);
            res.end();
            debug(`error proxy request to chrome agent ${err}`);
          });
        });
      } else {
      // You can define here your custom logic to handle the request
      // and then proxy the request.
        proxy.web(req, res, { target: chromedriverEndpoint });
      }
    });

    self.server.keepAliveTimeout = keepAliveTimeout;

    self.server.listen(self.port, () => {
      chromedriverStart.then(() => {
        if (fn) {
          fn();
        }
        debug(`started proxy server at port: ${self.port}`);
      }).catch((err) => {
        console.error(`FATAL UNABLE TO START CHROMEDRIVER: ${err}`);
        process.exit(1);
      });
    });
  }

  stop(fn) {
    const self = this;
    self.httpAgent.destroy();
    self.server.close(() => {
      self.chromedriver.stop().then(() => {
        self.chromepool.killAll();
        if (fn) {
          fn();
        }
      });
    });
  }
}

module.exports = HttpServer;

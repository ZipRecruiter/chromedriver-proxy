

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

const crypto = require('crypto');
const getPort = require('get-port');
const { execFile } = require('child_process');
const CDP = require('chrome-remote-interface');
const debug = require('debug')('chromedriver_proxy:chrome_pool');
const path = require('path');
const ChromeAgentManager = require('./chrome_agent_manager');

class ChromePool {
  constructor(options) {
    const o = options || {};
    this.chrome_binary = o.chromePath || '/usr/bin/google-chrome';
    this.chromeStorage = o.clearStorage || [];
    this.tmpDir = o.tmpDir || '/tmp';
    this.reuse = o.reuse || false;
    this.enable = typeof o.enable === 'undefined' ? false : o.enable;
    this.chromeAgentModule = o.chromeAgentModule || `${__dirname}${path.sep}chrome_agent.js`;
    this.chromeAgentOptions = o.chromeAgent || {};
    this.inavtivePool = [];
    this.pool = {};
    this.agents = {};
  }

  // takes the chrome command line args
  get(options) {
    const self = this;
    const args = options.args || [];
    let port = null;

    // transform args
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg.substring(0, 2) !== '--') {
        args[i] = `--${args[i]}`;
      }
    }

    for (let i = 0; i < self.inavtivePool.length; i += 1) {
      let match = false;
      const currentArgs = self.pool[self.inavtivePool[i]].args;
      if (currentArgs.length === args.length) {
        match = true;
      }
      for (let j = 0; j < args.length; j += 1) {
        if (currentArgs[j] !== args[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        port = self.inavtivePool[i];
        self.inavtivePool.splice(i, 1);
        debug(`Reuse browser at port: ${port}`);
        return Promise.resolve(port);
      }
    }

    return self.startBrowser(options);
  }

  startBrowser(options) {
    const self = this;
    self.profile = `${self.tmpDir}/chrome-profile-${crypto.randomBytes(16).toString('hex')}`;
    const args = options.args ? options.args.slice(0) : [];
    args.reverse();
    args.push(`--user-data-dir=${self.profile}`);

    return getPort().then((port) => {
      args.push(`--remote-debugging-port=${port}`);
      const browser = execFile(self.chrome_binary, args);
      return new Promise((resolve, reject) => {
        browser.stderr.once('data', () => {
          debug(`Started Browser: port => ${port} pid => ${browser.pid}`);

          // getting the target is temperamental so we retry on failure
          let retryCount = 0;
          const maxRetries = 5;
          const resolveTarget = function resolveTarget() {
            CDP.List({ host: '127.0.0.1', port }, (err, targets) => {
              if (err && retryCount < maxRetries) {
                retryCount += 1;
                setTimeout(resolveTarget, 50);
                return;
              } else if (retryCount >= maxRetries) {
                debug('unable to connect to chrome debugger');
                reject();
                return;
              } else if (err) {
                reject(err);
                return;
              }
              self.pool[port] = {
                args: options.args,
                process: browser,
                target: targets[0].id,
              };
              resolve(port);
            });
          };
          setTimeout(resolveTarget, 10);
        });
      });
    });
  }

  cleanBrowser(port) {
    const self = this;
    const browser = self.pool[port];
    debug(`clean browser at port: ${port}`);
    // connext the the browser via crd & clean it
    return new Promise((resolve, reject) => {
      CDP({ host: '127.0.0.1', port, target: browser.target }, (client) => {
        const {
          Network, Target, Page, Storage,
        } = client;

        const closeTarget = function closeTarget(target) {
          return Target.activateTarget(target).then(() => Target.closeTarget(target));
        };

        const clearData = [Network.clearBrowserCookies()];
        self.chromeStorage.forEach((e) => {
          clearData.push(Storage.clearDataForOrigin(e));
        });

        Promise.all(clearData).then(() => Page.navigate({ url: 'about:blank' })).then(() => Target.getTargets()).then((result) => {
          let p = Promise.resolve();
          result.targetInfos.forEach((target) => {
          // close everything but the main target
            if (target.targetId !== browser.target) {
              p = p.then(() => closeTarget(target));
            }
          });
          return p;
        })
          .then(() => {
            client.close();
            resolve();
          })
          .catch((err) => {
            debug(`Browser cleanup error: ${err}`);
            reject(err);
          });
      }).on('error', (err) => {
        debug(`BROWSER ERROR: ${err}`);
        reject(err);
      });
    });
  }

  stopBrowser(port) {
    const self = this;
    self.pool[port].process.kill();
    debug(`Kill browser at port: ${port}`);
    delete self.pool[port];
  }

  killAll() {
    const self = this;
    Object.keys(self.pool).forEach((v) => {
      self.pool[v].process.kill();
    });
    self.pool = {};
    self.inavtivePool = [];
  }

  put(port) {
    const self = this;
    if (self.reuse) {
      self.cleanBrowser(port).then(() => {
        if (self.agents[port]) {
          const agent = self.agents[port];
          return agent.stop();
        }
        return null;
      }).then(() => {
        self.inavtivePool.push(port);
        delete self.agents[port];
      }).catch((err) => {
        debug(`error in chrome cleanup: ${err}`);
        delete self.agents[port];
        return self.stopBrowser(port);
      });
    } else {
      self.stopBrowser(port);
    }
  }

  sendToAgent(options) {
    const self = this;
    return self.getAgent(options).then(agent => agent.send(options));
  }

  getAgent(options) {
    const self = this;
    const { port } = options;

    if (self.agents[port]) {
      debug('agent already exists');
      return Promise.resolve(self.agents[port]);
    }
    debug('agent does NOT already exists');
    const agent = new ChromeAgentManager();
    const defaultOptions = {
      chromeAgentModule: self.chromeAgentModule,
      host: '127.0.0.1',
      port,
      target: self.pool[port].target,
    };
    Object.assign(defaultOptions, self.chromeAgentOptions);
    agent.start(defaultOptions);
    self.agents[port] = agent;

    return Promise.resolve(agent);
  }
}

module.exports = ChromePool;

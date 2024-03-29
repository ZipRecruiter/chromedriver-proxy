

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
const debugBrowser = require('debug')('chromedriver_proxy:chrome_pool_browser');
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
    this.chromeStartupTimeOut = o.chromeStartupTimeOut || 1000;
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
      const browser = self.pool[self.inavtivePool[i]];
      if (browser === undefined) {
        debug(`ERROR: browser at port ${self.inavtivePool[i]} is undefined`);
        continue;
      }
      const currentArgs = browser.args;
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
      debug(`launch browser: ${self.chrome_binary} ${args.join(' ')}`);
      const browser = execFile(self.chrome_binary, args);
      browser.stderr.on('data', (chunk) => {
        debugBrowser(`browser port: ${port} pid: ${browser.pid} message: ${chunk.trim()}`);
      });
      return new Promise((resolve, reject) => {
        browser.once('exit', (code) => {
          reject(Error(`browser port: ${port} pid: ${browser.pid} exit with code: ${code}`));
        });
        browser.stderr.once('data', () => {
          debug(`Started Browser: port => ${port} pid => ${browser.pid}`);

          // getting the target is temperamental so we retry on failure
          const endTime = Date.now() + self.chromeStartupTimeOut;
          const resolveTarget = function resolveTarget() {
            CDP.List({ host: '127.0.0.1', port }, (err, targets) => {
              if ((err && Date.now() <= endTime) || (typeof targets === 'undefined' || targets.length === 0)) {
                setTimeout(resolveTarget, 50);
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

  stopBrowser(port) {
    const self = this;
    const p = self.pool[port].process;
    return new Promise((resolve) => {
      p.once('exit', (code, signal) => {
        debug(`browser at port: ${port} exited ${code} ${signal}`);
        resolve();
      });
      p.kill('SIGKILL');
      debug(`SIGKILL sent to browser at port: ${port}`);
      delete self.pool[port];
    });
  }

  killAll() {
    const self = this;
    Object.keys(self.pool).forEach((v) => {
      self.pool[v].process.kill('SIGKILL');
    });
    self.pool = {};
    self.inavtivePool = [];
    debug('kill all chrome instances');
  }

  async put(port) {
    const self = this;
    if (self.reuse) {
      try {
        const agent = self.agents[port];
        await agent.stop();
        delete self.agents[port];
      } catch (err) {
        debug(`error in chrome ${port} cleanup: ${err}`);
        delete self.agents[port];
        return self.stopBrowser(port);
      }
    } else {
      return self.stopBrowser(port);
    }
    self.inavtivePool.push(port);
    return Promise.resolve();
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
    const chromePid = self.pool[port].process.pid;
    const defaultOptions = {
      chromeAgentModule: self.chromeAgentModule,
      host: '127.0.0.1',
      port,
      target: self.pool[port].target,
      chromeStorage: self.chromeStorage,
      chromePid,
    };
    Object.assign(defaultOptions, self.chromeAgentOptions);
    agent.start(defaultOptions);
    self.agents[port] = agent;

    return Promise.resolve(agent);
  }
}

module.exports = ChromePool;

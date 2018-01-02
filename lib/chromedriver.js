

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

const { spawn } = require('child_process');
const debug = require('debug')('chromedriver_proxy:chromedriver');
const http = require('http');

class ChromeDriver {
  constructor(options) {
    this.port = options.port || 4445;
    this.autoRestart = options.autoRestart || false;
    this.chromeDriverPath = options.chromedriverPath || '/usr/bin/chromedriver';
    this.args = options.args || [];
    this.shutdown = false;
  }

  createArgs() {
    const self = this;
    const args = [];
    args.push(`--port=${self.port}`);

    for (let i = 0; i < self.args.length; i += 1) {
      args.push(self.args[i]);
    }

    return args;
  }

  verifyStarted() {
    const self = this;
    const statusOptions = {
      timeout: 2000,
      port: self.port,
      host: '127.0.0.1',
      path: '/status',
    };
    return new Promise((resolve, reject) => {
      http.get(statusOptions, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`chromedriver status: ${res.statusCode}`));
        }
      }).on('socket', (socket) => {
        socket.setTimeout(2000);
      }).on('error', (err) => {
        debug(err.stack);
        reject(err);
      });
    });
  }

  start() {
    const self = this;
    const args = self.createArgs();

    debug(`${self.chromeDriverPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const exitListener = function exitListener(code, signal) {
        debug(`chromedriver exited with status: ${code} signal: ${signal}`);
        reject();
      };
      const startupListener = function startupListener(data) {
        const chunk = data.toString('utf-8');
        if (chunk.indexOf('Starting ChromeDriver') !== -1) {
          console.log(chunk);
          self.child.removeListener('exit', exitListener);
          self.child.stdout.removeListener('data', startupListener);
        }
        const maxRetries = 3;
        let retryCount = 0;
        const verifyChromedriverConn = () => {
          self.verifyStarted().then(() => {
            resolve();
          }).catch((err) => {
            retryCount += 1;
            if (retryCount < maxRetries) {
              setTimeout(verifyChromedriverConn, 50);
            } else {
              reject(err);
            }
          });
        };
        verifyChromedriverConn();
      };
      self.child = spawn(self.chromeDriverPath, args);
      self.child.addListener('exit', exitListener);
      self.child.stdout.addListener('data', startupListener);

      debug(`ChromeDriver Pid: ${self.child.pid}`);

      self.child.on('close', () => {
        if (self.shutdown || !self.autoRestart) { return; }

        setTimeout(() => {
          debug('Restarting chromediver');
          self.start();
        }, 10);
      });
    });
  }

  stop() {
    const self = this;
    debug('stop chromedriver');
    self.shutdown = true;
    return new Promise((resolve) => {
      self.child.once('exit', (code, signal) => {
        debug(`chromedriver exited: ${code} ${signal}`);
        resolve();
      });
      self.child.kill('SIGKILL');
    });
  }
}

module.exports = ChromeDriver;

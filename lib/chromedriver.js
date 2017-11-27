

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

  start() {
    const self = this;
    const args = self.createArgs();

    debug(`${self.chromeDriverPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const exitListener = function exitListener(err) {
        reject(err);
      };
      const startupListener = function startupListener(data) {
        const chunk = data.toString('utf-8');
        if (chunk.indexOf('Starting ChromeDriver') !== -1) {
          console.log(chunk);
          self.child.removeListener('exit', exitListener);
          self.child.stdout.removeListener('data', startupListener);
          resolve();
        }
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
    self.child.kill();
  }
}

module.exports = ChromeDriver;

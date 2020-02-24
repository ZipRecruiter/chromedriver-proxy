
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

const childProcess = require('child_process');
const path = require('path');
const debug = require('debug')('chromedriver_proxy:chrome_agent_manager');
const EventEmitter = require('events');

class ChromeAgentManager extends EventEmitter {
  start(options) {
    const self = this;
    const JsonOptions = JSON.stringify(options);
    debug(`fork agent with options: ${JsonOptions}`);
    self.child = childProcess.fork(`${__dirname}${path.sep}chrome_agent_slave.js`, [JsonOptions]);
    self.child.on('error', () => {
      debug('chrome agent has exited');
    });
    self.child.on('exit', (status) => {
      debug(`chrome agent has exit code: ${status}`);
      self.emit('exit', status);
    });
    self.child.on('disconnect', () => {
      debug('chrome agent has disconnected');
    });

    self.child.on('message', (msg) => {
      const blob = JSON.parse(msg);
      self.emit(blob.action, blob.result);
    });
  }

  send(options) {
    const self = this;
    return new Promise((resolve, reject) => {
      const exitListener = function exitListener() {
        reject();
      };
      self.on('exit', exitListener);
      self.once(options.action, (result) => {
        self.removeListener('exit', exitListener);
        if (result === undefined) {
          reject(new Error('Unknown error'));
        }
        if ('error' in result) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      });
      self.child.send(JSON.stringify(options));
    });
  }

  stop() {
    const self = this;
    return self.send({ action: 'stop' }).catch(() => {});
  }
}

module.exports = ChromeAgentManager;

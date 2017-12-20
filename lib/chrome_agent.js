

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

const process = require('process');
const CDP = require('chrome-remote-interface');
const debug = require('debug')('chromedriver_proxy:chrome_agent');
const ScreenRecorder = require('./screen_recorder');

class ChromeAgent {
  constructor(options) {
    Object.keys(options).forEach((i) => {
      this[i] = options[i];
    });
    this.screenRecorderOptions = this.screenRecorder || {};
    delete this.screenRecorder;
    this.scriptIds = new Set();

    this.routes = [
      ['POST', 'screencast/start', 'startScreencast'],
      ['POST', 'screencast/stop', 'stopScreencast'],
      ['GET', 'screencast/path', 'getScreencastPath'],
      ['GET', 'screencast/s3', 'getScreencastS3'],
      ['POST', 'headers', 'setHeaders'],
      ['POST', 'script', 'addScript'],
      ['DELETE', 'scripts', 'removeAllScripts'],
    ];
  }

  async getConn() {
    const self = this;
    if (self.client) {
      return self.client;
    }
    return new Promise((resolve, reject) => {
      CDP({ host: '127.0.0.1', port: self.port, target: self.target }, (client) => {
        self.client = client;
        resolve(client);
      }).on('error', (err) => {
        debug('unable to connect to debugger');
        reject(err);
      });
    });
  }

  async addScript(options) {
    const self = this;
    const { Page } = await self.getConn();
    await Page.enable();
    debug(`add script ${JSON.stringify(options)}`);
    // WARNING addScriptToEvaluateOnLoad is deprecated
    // unable to figure out how to work with Page.addScriptToEvaluateOnNewDocument
    const result = await Page.addScriptToEvaluateOnLoad(options);
    self.scriptIds.add(result.identifier);
    return result;
  }

  async removeAllScripts() {
    const self = this;
    const { Page } = await self.getConn();
    await Page.enable();
    debug('remove all scripts start');
    const p = [];
    self.scriptIds.forEach((id) => {
      p.push(Page.removeScriptToEvaluateOnLoad({ identifier: id }));
    });
    await Promise.all(p);
    debug('remove all scripts done');
  }

  async setHeaders(options) {
    const self = this;
    const { Network } = await self.getConn();
    debug(`set extra headers ${JSON.stringify(options)}`);
    return Network.setExtraHTTPHeaders({ headers: options.headers });
  }

  async getScreencastPath() {
    const self = this;
    const result = await self.screenRecorderVideo;
    debug(`local screencast path: ${result}`);
    return { path: result };
  }

  async getScreencastS3() {
    const self = this;
    const result = await self.screenRecorderVideo.then(() => self.sr.s3UploadResult);
    debug(`s3 upload: ${JSON.stringify(result)}`);
    return result;
  }

  async startScreencast(options) {
    const self = this;
    debug('start screencast');
    const client = await self.getConn();
    const defaultOptions = self.screenRecorderOptions;
    defaultOptions.client = client;
    self.sr = new ScreenRecorder(defaultOptions);

    const { Page } = client;
    await Page.enable();
    debug(`screen recorder options ${JSON.stringify(options)}`);
    return self.sr.start(options);
  }

  async stopScreencast(options) {
    const self = this;
    debug('stop screencast');
    if (!self.sr) {
      throw new Error('must call startScreencast before calling stopScreencast');
    }
    self.screenRecorderVideo = self.sr.stop(options);
    const result = {
      path: self.sr.getFilePath(),
      s3: {
        bucket: self.sr.s3UploadOptions.Bucket,
        key: self.sr.getS3Key(),
      },
    };
    return result;
  }

  async stop() {
    const self = this;
    debug('stop agent');
    if (typeof self.screenRecorderVideo !== 'undefined') {
      await self.screenRecorderVideo.then(() => self.sr.s3UploadResult);
    }
    await self.removeAllScripts();
    if (self.client) {
      self.client.close();
    }
  }

  handle(blob) {
    const self = this;
    try {
      if (blob.action === 'stop') {
        return self.stop().then(() => {
          debug('stop agent success');
          process.exit(0);
        }).catch((err) => {
          debug(`error when stopping agent: ${err}`);
          process.exit(1);
        });
      }
      const { value } = blob;
      const { path, sessionId, httpMethod } = value;
      const body = value.body ? JSON.parse(blob.value.body) : {};
      body.sessionId = sessionId;

      let action = null;
      const route = Object.values(self.routes).find((r) => {
        if (httpMethod === r[0] && path === r[1]) {
          return true;
        }
        return false;
      });
      action = route && route[2];
      if (action === null) {
        return Promise.reject(new Error(`unknown path: ${httpMethod} ${path}`));
      }
      if (typeof (self[action]) !== 'function') {
        return Promise.reject(new Error(`undefined method: ${action}`));
      }
      return Promise.resolve(self[action](body));
    } catch (err) {
      return Promise.reject(new Error(`unknown error: ${err}`));
    }
  }
}


module.exports = ChromeAgent;

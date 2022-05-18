

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

const Chrome = require('selenium-webdriver/chrome').Driver;
const http = require('selenium-webdriver/http');
const command = require('selenium-webdriver/lib/command');
const Capabilities = require('selenium-webdriver/lib/capabilities').Capabilities;

const Command = {
  START_SCREENCAST: 'startScreencast',
  STOP_SCREENCAST: 'stopScreencast',
  GET_SCREENCAST_PATH: 'getScreencastPath',
  GET_SCREENCAST_S3: 'getScreencastS3',
  SET_HEADERS: 'setHeaders',
  SET_USER_AGENT: 'setUserAgent',
  ADD_SCRIPT: 'addScript',
  REMOVE_ALL_SCRIPTS: 'removeAllScripts',
  SET_CLEAR_STORAGE: 'setClearStorage',
};

function configureExecutor(executor) {
  executor.defineCommand(
    Command.START_SCREENCAST,
    'POST',
    '/session/:sessionId/chromedriver-proxy/screencast/start',
  );
  executor.defineCommand(
    Command.STOP_SCREENCAST,
    'POST',
    '/session/:sessionId/chromedriver-proxy/screencast/stop',
  );
  executor.defineCommand(
    Command.GET_SCREENCAST_PATH,
    'GET',
    '/session/:sessionId/chromedriver-proxy/screencast/path',
  );
  executor.defineCommand(
    Command.GET_SCREENCAST_S3,
    'GET',
    '/session/:sessionId/chromedriver-proxy/screencast/s3',
  );
  executor.defineCommand(
    Command.SET_EXTRA_HEADERS,
    'POST',
    '/session/:sessionId/chromedriver-proxy/headers',
  );
  executor.defineCommand(
    Command.SET_USER_AGENT,
    'POST',
    '/session/:sessionId/chromedriver-proxy/useragent',
  );
  executor.defineCommand(
    Command.ADD_SCRIPT,
    'POST',
    '/session/:sessionId/chromedriver-proxy/script',
  );
  executor.defineCommand(
    Command.REMOVE_ALL_SCRIPTS,
    'DELETE',
    '/session/:sessionId/chromedriver-proxy/scripts',
  );
  executor.defineCommand(
    Command.SET_CLEAR_STORAGE,
    'POST',
    '/session/:sessionId/chromedriver-proxy/storage',
  );
  executor.defineCommand(
    Command.NAVIGATE,
    'POST',
    '/session/:sessionId/chromedriver-proxy/navigate',
  );
}

function createExecutor(url) {
  const client = url.then(u => new http.HttpClient(u));
  const executor = new http.Executor(client);
  configureExecutor(executor);
  return executor;
}


class Driver extends Chrome {

  static createSession(url, opts) {
    const caps = Capabilities.chrome();
    caps.merge(opts);

    let client = Promise.resolve(url).then(
      (url) => new http.HttpClient(url)
    )
    let executor = new http.Executor(client);

    return super.createSession(caps, createExecutor(Promise.resolve(url)), null);;
  }

  startScreencast(params) {
    return this.execute(
      new command.Command(Command.START_SCREENCAST).setParameters(params),
      'ChromeDriverProxy.startScreencast',
    );
  }

  stopScreencast() {
    return this.execute(
      new command.Command(Command.STOP_SCREENCAST),
      'ChromeDriverProxy.stopScreencast',
    );
  }

  getScreencastPath() {
    return this.execute(
      new command.Command(Command.GET_SCREENCAST_PATH),
      'ChromeDriverProxy.getScreencastPath',
    );
  }

  getScreencastS3() {
    return this.execute(
      new command.Command(Command.GET_SCREENCAST_S3),
      'ChromeDriverProxy.getScreencastS3',
    );
  }

  setExtraHeaders(headers) {
    return this.execute(
      new command.Command(Command.SET_EXTRA_HEADERS).setParameter('headers', headers),
      'ChromeDriverProxy.setExtraHeaders',
    );
  }

  setUserAgent(userAgent) {
    return this.execute(
      new command.Command(Command.SET_USER_AGENT).setParameter('userAgent', userAgent),
      'ChromeDriverProxy.setUserAgent',
    );
  }

  addScript(script) {
    return this.execute(
      new command.Command(Command.ADD_SCRIPT).setParameter('scriptSource', script),
      'ChromeDriverProxy.addScript',
    );
  }

  removeAllScripts() {
    return this.execute(
      new command.Command(Command.REMOVE_ALL_SCRIPTS),
      'ChromeDriverProxy.removeAllScripts',
    );
  }

  setClearStorage(options) {
    return this.execute(
      new command.Command(Command.SET_CLEAR_STORAGE).setParameter('values', options),
      'ChromeDriverProxy.setClearStorage',
    );
  }

  pageNavigate(options) {
    return this.execute(
      new command.Command(Command.NAVIGATE).setParameter('options', options),
      'ChromeDriverProxy.NAVIGATE',
    );
  }
}

module.exports = Driver;

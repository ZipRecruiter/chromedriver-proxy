

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
const debug = require('debug')('chromedriver_proxy:chrome_agent_slave');
const path = require('path');

const options = JSON.parse(process.argv[2]);

if (require.main === module) {
  debug('successfully forked chrome agent');
  try {
    const ChromeAgent = require(path.resolve(options.chromeAgentModule));
    const chromeAgent = new ChromeAgent(options);
    process.on('message', (msg) => {
      const blob = JSON.parse(msg);
      chromeAgent.handle(blob).then((result) => {
        process.send(JSON.stringify({ action: 'req', result }));
      }).catch((err) => {
        process.send(JSON.stringify({ action: 'req', result: { error: err } }));
      });
    });
    process.send(JSON.stringify({ action: 'init', result: {} }));
  } catch (err) {
    debug(err);
    process.send(JSON.stringify({ action: 'error', result: { error: err } }));
    process.send(JSON.stringify({ action: 'init', result: { error: err } }));
    process.exit(1);
  }
}

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


const chai = require('chai');

const expect = chai.expect;
const HttpServer = require('..').HttpServer;

const Driver = require('../clients/js/chrome_driver_proxy');
const Chrome = require('selenium-webdriver/chrome').Driver;
const ChromeOptions = require('selenium-webdriver/chrome').Options;

const chromedriverBin = process.env.CHROMEDRIVER_BIN || '/usr/bin/chromedriver';

describe('Proxy with script support', () => {
  let server;
  let driver;
  const mockServerUrl = 'http://127.0.0.1:8080';

  before(function (done) {
    const config = {
      proxy: {
        port: 4444,
        baseUrl: '/wd/hub',
      },
      chromedriver: {
        chromedriverPath: chromedriverBin,
        port: 4445,
        autoRestart: false,
      },
      chromePool: {
        enable: true,
        reuse: true,
        chromePath: '/usr/bin/google-chrome',
      },
    };
    server = new HttpServer(config.proxy);
    this.timeout(5000);
    server.start(config, done);
  });

  after((done) => {
    server.stop(done);
  });

  beforeEach(() => {
    const chromeOptions = new ChromeOptions();
    chromeOptions.addArguments(
      'headless',
      'disable-gpu',
      'no-first-run',
      'no-sandbox',
    );

    driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', chromeOptions);
  });

  afterEach((done) => {
    driver.quit().then(() => { done(); });
  });

  it('can add a script', (done) => {
    driver.addScript('window.FOO="BAR"').then(() => driver.get(`${mockServerUrl}/base.html`)).then(() => {
        return driver.executeScript('return window.FOO');
      })
      .then((result) => {
        expect(result).to.equal('BAR');
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('can add a script on navigation', (done) => {
    driver.addScript('window.FOO="BAR"').then(() => driver.get(`${mockServerUrl}/base.html`)).then(() => {
        return driver.findElement({css: 'a[href*="base2.html"]'});
      })
      .then((elem) => {
        return elem.click()
      }).then(() => {
        return driver.getTitle()
      }).then((title) => {
        expect(title).to.equal('base 2 page');
      }).then(() => {
        return driver.executeScript('return window.FOO');
      })
      .then((result) => {
        expect(result).to.equal('BAR');
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });
  });


  xit('can remove all scripts', (done) => {
    driver.addScript('window.FOO="BAR"').then((result) => {
      return driver.get(`${mockServerUrl}/base.html`)
    }).then((result) => {
        return driver.removeAllScripts()
      })
      .then((result) => {
        return driver.get(`${mockServerUrl}/base2.html`)
      }).then(() => {
        return driver.executeScript('return window.FOO');
      })
      .then((result) => {
        expect(result).to.not.equal('BAR');
      }).then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });
  });
});

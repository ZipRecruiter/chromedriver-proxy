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

describe('Proxy with chrome pool cookie test', () => {
  let server;
  let driver;
  let options;
  const mockServerUrl = 'http://127.0.0.1:8080';

  beforeEach((done) => {
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
        clearStorage: [
          {
            origin: '.localhost',
            storageTypes: 'cookies,localstorage',
          },
        ],
      },
    };
    server = new HttpServer(config.proxy);
    server.start(config, () => {
        const chromeOptions = new ChromeOptions();
        chromeOptions.addArguments(
          'headless',
          'disable-gpu',
          'no-first-run',
          'no-sandbox',
        );
        options = chromeOptions.toCapabilities();

        driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', options);
        done();
    });
  });

  afterEach((done) => {
    server.stop(done);
  });

  it('can clear cookies between sessions', (done) => {
    driver.get(`${mockServerUrl}/base.html`).then(() => driver.manage().addCookie({ name: 'foo', value: 'bar' })).then(() => driver.get(`${mockServerUrl}/cookies`)).then(() => driver.getPageSource())
      .then(source => driver.findElement({ css: '#foo span.value' }))
      .then(elem => elem.getText())
      .then((cookieValue) => {
        expect(cookieValue).to.equal('bar');
        return driver.quit();
      })
      .then(() => {
        driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', options);
        return driver.get(`${mockServerUrl}/base.html`);
      })
      .then(() => driver.manage().getCookie('foo'))
      .then((cookie) => {
        expect(cookie).to.be.null;
      })
      .then(() => driver.quit())
      .then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('can override default for clearing local storage', (done) => {
    driver.get(`${mockServerUrl}/base.html`).then(() => driver.setClearStorage([])).then(() => driver.get(`${mockServerUrl}/cookies`)).then(() => driver.executeScript('window.localStorage.setItem("foo", "bar")'))
      .then(() => driver.executeScript('return window.localStorage.getItem("foo")'))
      .then((value) => {
        expect(value).to.equal('bar');
        return driver.quit();
      })
      .then(() => {
        // TODO find a better way to wait for the browser to be available in the pool
        return driver.sleep(5);
      }).then(() => {
        driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', options);
        return driver.get(`${mockServerUrl}/base.html`);
      })
      .then(() => driver.executeScript('return window.localStorage.getItem("foo")'))
      .then((value) => {
        expect(value).to.equal('bar');
      })
      .then(() => driver.quit())
      .then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('can clear local storage between sessions', (done) => {
    driver.get(`${mockServerUrl}/base.html`).then(() => driver.manage().addCookie({ name: 'foo', value: 'bar' })).then(() => driver.get(`${mockServerUrl}/cookies`)).then(() => driver.executeScript('window.localStorage.setItem("foo", "bar")'))
      .then(() => driver.executeScript('return window.localStorage.getItem("foo")'))
      .then((value) => {
        expect(value).to.equal('bar');
        return driver.quit();
      })
      .then(() => {
        driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', options);
        return driver.get(`${mockServerUrl}/base.html`);
      })
      .then(() => driver.executeScript('return window.localStorage.getItem("foo")'))
      .then((value) => {
        expect(value).to.be.null;
      })
      .then(() => driver.quit())
      .then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('can close extra windows between sessions', (done) => {
    driver.get(`${mockServerUrl}/base.html`).then(() => driver.executeScript(`open("${mockServerUrl}/base.html"); open("${mockServerUrl}/base.html")`)).then(() => driver.getAllWindowHandles()).then((handles) => {
      expect(handles.length).to.equal(3);
      return driver.quit();
    })
      .then(() => {
        driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', options);
        return driver.get(`${mockServerUrl}/base.html`);
      })
      .then(() => driver.getAllWindowHandles())
      .then((handles) => {
        expect(handles.length).to.equal(1);
        return driver.quit();
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });
  });
});

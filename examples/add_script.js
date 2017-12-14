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


const ChromeOptions = require('selenium-webdriver/chrome').Options;
const Driver = require('../clients/js/chrome_driver_proxy');

const chromeOptions = new ChromeOptions();
chromeOptions.addArguments(
  // '--headless',
  // '--disable-gpu',
  '--disable-xss-auditor',
  '--no-first-run',
  '--no-sandbox',
);
const options = chromeOptions.toCapabilities();

const driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', options);
const myScript = 'console.log("inject script");'

driver.addScript(myScript).then((result) => {
  driver.get('https://google.com');
}).then(() => driver.sleep(10000))
  .then(() => {
    return driver.quit();
  }).catch(err => console.log(err) );

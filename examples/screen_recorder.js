

const ChromeOptions = require('selenium-webdriver/chrome').Options;
const Driver = require('../clients/js/chrome_driver_proxy');

const chromeOptions = new ChromeOptions();
chromeOptions.addArguments(
  '--headless',
  '--disable-gpu',
  '--no-first-run',
  '--no-sandbox',
);
const options = chromeOptions.toCapabilities();

const driver = Driver.createSession('http://127.0.0.1:4444/wd/hub', options);
driver.startScreencast({ params: { format: 'jpeg', quality: 80, everyNthFrame: 2 } }).then(() => driver.get('https://www.ziprecruiter.com')).then(() => driver.sleep(2)).then(() => driver.get('https://www.ziprecruiter.com/candidate/search?search=accountant&location='))
  .then(() => driver.sleep(1))
  .then(() => driver.stopScreencast())
  .then(() => driver.getScreencastPath())
  .then((result) => {
    console.log(result);
    return driver.quit();
  });

[![npm version](https://img.shields.io/npm/v/chromedriver-proxy.svg?style=flat-square)](https://www.npmjs.com/package/chromedriver-proxy)

[![Build Status](https://travis-ci.org/ZipRecruiter/chromedriver-proxy.svg?branch=master)](https://travis-ci.org/ZipRecruiter/chromedriver-proxy)

Chromedriver-Proxy is an extensible proxy to ChromeDriver.

# Features

 * Reuse browsers.  The browser will be cleaned between each selenium session.
 * Connect to Chromedriver from remote host without modifying the whitelist
 * Record video and upload the video to s3.  Compatible with chrome in headless mode.
 * Set extra headers
 * Evaluate script on each page load
 * Provide your own custom extensions.

# Requirements

nodejs >= 8, ffmpeg, chrome >= 64 and the current version of [chromedriver](https://sites.google.com/a/chromium.org/chromedriver/downloads).

# Usage

```
DEBUG=chromedriver_proxy:* chromedriver-proxy --config config.json
```

example configuration:
```json
{
  "tmpDir": "/tmp",
  "proxy": {
    "port": 4444,
    "baseUrl": "/wd/hub"
  },
  "chromedriver": {
    "chromedriverPath": "/usr/bin/chromedriver",
    "port": 4445,
    "autoRestart": true // restart chromedriver if it crashes
  },
  "chromePool": {
    "enable": true,
    "chromePath": "/usr/bin/google-chrome",
    "reuse": true, // reuse the browser instances
    // chromeAgentModule should extend the builtin ChromeAgent.
    "chromeAgentModule": "path to custom module",
    "clearStorage": [
    // https://chromedevtools.github.io/devtools-protocol/tot/Storage/#method-clearDataForOrigin
      {
        "origin": ".ziprecruiter.com",
        "storageTypes": "cookies,localstorage"
      }
    ],
    "chromeAgent": {
      "screenRecorder": {
        "videoFormat": "<mp4 or webm>",

        "s3": {
          "region": "<my region>"
          // additional options to the constructor http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
        },
        "s3Upload": {
          "Bucket": "<my bucket>"
          // additional options to the upload function http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property
        }
      }
    }
  }
}
```

## Clients

The project provides a [python](clients/py) client and a [javascript](clients/js) client.  See the [examples](examples) for basic usage.

Feel free to add support for any of the languages that the selenium project supports (java, python, javascript, c#, ruby).

## Issues

Please report any issues using the [ChromeDriver Proxy issue tracker](https://github.com/ZipRecruiter/chromedriver-proxy/issues). When using
the issue tracker

- __Do__ include a detailed description of the problem.
- __Do__ include a link to a [gist](http://gist.github.com/) with any
    interesting stack traces/logs (you may also attach these directly to the bug
    report).
- __Do__ include a reduced test case.
- __Do not__ use the issue tracker to submit basic help requests.
- __Do not__ post empty "I see this too" or "Any updates?" comments. These
    provide no additional information and clutter the log.
- __Do not__ report regressions on closed bugs as they are not actively
    monitored for updates (especially bugs that are >6 months old). Please open a
    new issue and reference the original bug in your report.

# License

Copyright (c) 2017 ZipRecruiter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

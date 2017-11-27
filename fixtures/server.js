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
**/

'use strict'

const http = require('http')
const Router = require('node-simple-router')
const url = require('url')
const fs = require('fs')

function parseCookies (request) {
  // https://stackoverflow.com/a/3409200
  const list = {},
    rc = request.headers.cookie;

  rc && rc.split(';').forEach(function( cookie ) {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });

  return list;
}

module.exports = function (port, callback) {
  const router = new Router({static_route: __dirname + '/static'})

  router.get('/cookies', function(req, res) {
    const cookies = parseCookies(req)
    let content = []
    for (let name in cookies) {
      content.push(`<p id=${name}><span class="name">${name}</span><span class="value">${cookies[name]}</span></p>`)
    }
    res.write(content.join(''))
    res.end()
  })
  router.get('/headers', function(req, res) {
    const headers = req.headers
    let content = []
    for (let name in headers) {
      content.push(`<p id=${name}><span class="name">${name}: </span><span class="value">${headers[name]}</span></p>`)
    }
    res.write(content.join(''))
    res.end()
  })
  const server = http.createServer(router)
  server.listen(port, callback)
  return server
}

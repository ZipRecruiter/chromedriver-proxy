# -*- coding: utf-8 -*-

# Copyright (c) 2017 ZipRecruiter
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

from __future__ import absolute_import
import selenium.webdriver as wd
from selenium.webdriver.remote.errorhandler import ErrorHandler
from selenium.webdriver.remote.remote_connection import RemoteConnection

class ChromeDriverProxyRemoteConnection(RemoteConnection):

    def __init__(self, remote_server_addr, keep_alive=True):
        RemoteConnection.__init__(self, remote_server_addr, keep_alive)
        self._commands["startScreencast"] = ('POST', '/session/$sessionId/chromedriver-proxy/screencast/start')
        self._commands["stopScreencast"] = ('POST', '/session/$sessionId/chromedriver-proxy/screencast/stop')
        self._commands["getScreencastPath"] = ('GET', '/session/$sessionId/chromedriver-proxy/screencast/path')
        self._commands["getScreencastS3"] = ('GET', '/session/$sessionId/chromedriver-proxy/screencast/s3')
        self._commands["setHeaders"] = ('POST', '/session/$sessionId/chromedriver-proxy/headers')
        self._commands["addScript"] = ('POST', '/session/$sessionId/chromedriver-proxy/script')
        self._commands["removeAllScripts"] = ('DELETE', '/session/$sessionId/chromedriver-proxy/scripts')
        self._commands["setClearStorage"] = ('POST', '/session/$sessionId/chromedriver-proxy/storage')


class ChromeDriverProxy(wd.Remote):

    def __init__(self, *args, **kwargs):
        kwargs['command_executor'] = ChromeDriverProxyRemoteConnection(kwargs['command_executor'], keep_alive=kwargs['keep_alive'])
        super(self.__class__, self).__init__(*args, **kwargs)
        self.error_handler = ErrorHandler()

    def start_screencast(self, **kwargs):
        self.execute('startScreencast', kwargs)

    def stop_screencast(self, **kwargs):
        result = self.execute('stopScreencast', kwargs)
        return result['value']

    def get_screencast_path(self):
        result = self.execute('getScreencastPath')
        return result['value']['path']

    def get_screencast_s3(self):
        result = self.execute('getScreencastS3')
        return result['value']

    def set_extra_headers(self, headers):
        self.execute('setHeaders', dict(headers=headers))

    def add_script(self, script):
        self.execute('addScript', dict(scriptSource=script))

    def remove_all_scripts(self):
        self.execute('removeAllScripts')

    def setClearStorage(self, options):
        self.execute('setClearStorage', dict(values=options))

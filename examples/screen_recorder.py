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
from __future__ import print_function
from selenium import webdriver as wd
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../clients/py')))
import time
from chrome_driver_proxy import ChromeDriverProxy

chrome_options = wd.ChromeOptions()
chrome_options.add_argument('--headless')
chrome_options.add_argument('--disable-gpu')
chrome_options.add_argument('--no-sandbox')
chrome_options.add_argument('--no-first-run')
chrome_options.add_argument('--window-size=1680,1050')

capabilities = wd.DesiredCapabilities.CHROME.copy()
capabilities.update(chrome_options.to_capabilities())

driver = ChromeDriverProxy(
    command_executor='http://127.0.0.1:4444/wd/hub',
    desired_capabilities=capabilities,
    keep_alive=True)

driver.start_screencast(params=dict(format='jpeg', quality=80, everyNthFrame=2))
driver.get('https://www.ziprecruiter.com')
time.sleep(2)
driver.get('https://www.ziprecruiter.com/candidate/search?search=accountant&location=')
time.sleep(1)
driver.stop_screencast()
path = driver.get_screencast_path()

print(path)
driver.quit()

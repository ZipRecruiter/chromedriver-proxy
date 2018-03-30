

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

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const cp = require('child_process');
const util = require('util');
const debug = require('debug')('chromedriver_proxy:realtime_screen_recorder');
const S3 = require('aws-sdk/clients/s3');
const path = require('path');

const readFile = util.promisify(fs.readFile);

const defaultVideoFormatArgs = {
  m3u8: [
    '-an',
    '-g',
    '10',
    '-c:v',
    'libx264',
    '-f',
    'hls',
    '-flags',
    '-global_header',
    '-hls_time',
    '3',
    '-hls_list_size',
    '0',
    '-hls_playlist_type',
    'event',
    '-y',
  ],
};

class ScreenRecorder {
  constructor(options) {
    this.videoFormat = options.videoFormat || 'm3u8';
    this.extraArgs = options.extraArgs || defaultVideoFormatArgs[this.videoFormat] || [];
    this.tmpDir = options.tmpDir || '/tmp';
    this.ffmpegPath = options.ffmpegPath || '/usr/bin/ffmpeg';
    this.s3Options = options.s3 || {};
    this.s3UploadOptions = options.s3Upload || {};
    this.client = options.client;
    this.index = 0;
    this.end = false;
    this.segments = null;
    this.segmentsMeta = [];
    this.uploadedSegments = new Set();
  }

  static create(options) {
    return new Promise((resolve, reject) => {
      CDP({ host: '127.0.0.1', port: options.port, target: options.target }, (client) => {
        const screenRecorder = new ScreenRecorder({
          client,
          tmpDir: options.tmpDir,
          ffmpegPath: options.ffmpegPath,
          videoFormat: options.videoFormat,
          extraArgs: options.extraArgs,
        });
        const { Page } = client;
        Page.enable().then(() => {
          resolve(screenRecorder);
        });
      }).on('error', (err) => {
        debug('reject on connecting');
        reject(err);
      });
    });
  }

  async start(options) {
    const self = this;
    const params = options.params || {};
    const format = params.format || 'png';
    self.s3Prefix = options.s3Prefix || '';
    self.sessionId = options.sessionId;
    self.dir = options.dir || self.tmpDir;
    const { Page } = self.client;
    self.frames = [];

    const output = self.getMetaPath();
    self.output = output;
    const touchOutput = new Promise((resolve, reject) => {
      fs.open(output, 'w', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    await touchOutput;
    debug(`output: ${output}`);
    fs.watchFile(output, async () => {
      debug(`file change: ${output}`);
      await self.updateStream({ path: output });
    });
    self.ffmpegChild = self.streamImagesToVideo({
      output,
      imgFormat: format,
    });
    const errors = [];
    const ffmpegErrorListener = (data) => {
      errors.push(data);
    };
    self.ffmpegChild.stderr.addListener('data', ffmpegErrorListener);
    self.ffmpegChild.on('close', (code) => {
      self.ffmpegChild.stderr.removeListener('data', ffmpegErrorListener);
      if (code !== 0) {
        debug(errors.join('\n'));
      }
    });
    self.ffmpegChild.stdin.on('error', (err) => {
      debug(err);
    });


    // register listener 1st
    self.client.on('Page.screencastFrame', (result) => {
      Page.screencastFrameAck({ sessionId: result.sessionId });
      const binaryBlob = Buffer.from(result.data, 'base64');
      self.ffmpegChild.stdin.write(binaryBlob);
    });

    self.client.on('Page.screencastVisibilityChanged', (visible) => {
      debug(`visiblility changed: ${JSON.stringify(visible)}`);
    });

    debug('start screencast');
    return Page.startScreencast(params).catch((err) => {
      debug(err);
    });
  }

  async updateStream(options) {
    const self = this;
    debug('begin update stream');
    const data = await readFile(options.path);
    const newSegments = [];

    let segmentFlag = false;
    data.toString().split('\n').forEach((e) => {
      const absPath = `${this.tmpDir}/${e}`;
      if (segmentFlag) {
        if (!self.uploadedSegments.has(absPath)) {
          newSegments.push(absPath);
        }
        segmentFlag = false;
      }
      if (e.startsWith('#EXTINF:')) {
        segmentFlag = true;
      }
    });
    debug(`new segments: ${JSON.stringify(newSegments)}`);
    await self.uploadSegments(newSegments);
    const result = await self.uploadMeta(data);
    debug('end update stream');
    return result;
  }

  async uploadSegments(newSegments) {
    const self = this;
    debug(`upload: ${JSON.stringify(newSegments)}`);
    newSegments.forEach(e => self.uploadedSegments.add(e));
    await Promise.all(newSegments.map(s => self.uploadToS3(s)));
  }

  async uploadMeta(data) {
    const self = this;
    debug('upload meta');
    return self.uploadToS3(data);
  }


  streamImagesToVideo(options) {
    const self = this;
    const ffmpegExe = this.ffmpegPath;
    const args = [
      '-f',
      'image2pipe',
      '-i',
      `pipe:.${options.imgFormat}`,
    ].concat(self.extraArgs).concat(options.extraArgs || []);
    args.push(options.output);

    debug(`${ffmpegExe} ${args.join(' ')}`);

    return cp.spawn(ffmpegExe, args);
  }

  getSegmentPath(index) {
    const self = this;
    return path.join(self.tmpDir, self.getSegmentName(index));
  }

  getMetaPath() {
    const self = this;
    return path.join(self.tmpDir, self.getMetaName());
  }

  getMetaName() {
    const self = this;
    return `${self.sessionId}.m3u8`;
  }

  getSegmentName(index) {
    const self = this;
    return `${self.sessionId}${index}.ts`;
  }

  getFilePath() {
    const self = this;
    return path.join(self.tmpDir, self.getMetaName());
  }

  getFileName() {
    const self = this;
    return `${self.sessionId}.${self.videoFormat}`;
  }

  getS3Key(name) {
    const self = this;
    return `${self.s3Prefix || ''}${name || self.getFileName()}`;
  }

  uploadToS3(file) {
    const self = this;
    let key;
    let ext;
    if (Buffer.isBuffer(file)) {
      key = self.getS3Key(self.getMetaName());
      ext = 'm3u8';
    } else {
      key = self.getS3Key(path.basename(file));
      ext = path.extname(file).slice(1);
    }

    if (!this.s3UploadOptions.Bucket) {
      debug('skipping s3 upload: Bucket has not been set');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const s3 = new S3(self.s3Options);
        const stream = Buffer.isBuffer(file) ? file : fs.createReadStream(file);

        const params = {
          ContentType: `video/${ext}`,
          Key: key,
          Body: stream,
        };
        Object.assign(params, self.s3UploadOptions);

        debug('start file upload');
        s3.upload(params, (err) => {
          if (err) {
            debug(`s3 upload error: ${err}`);
            reject(err);
          } else {
            resolve({ bucket: self.s3UploadOptions.Bucket, key });
            debug(`successfully uploaded ${key} to ${self.s3UploadOptions.Bucket}`);
          }
        });
      } catch (err) {
        debug(`s3 upload error: ${err}`);
        reject(err);
      }
    });
  }

  expectedResult() {
    const self = this;
    return {
      path: self.getFilePath(),
      s3: {
        bucket: self.s3UploadOptions.Bucket,
        key: self.getS3Key(),
      },
    };
  }

  async stop() {
    const self = this;
    self.end = true;
    const { Page } = self.client;
    try {
      debug('stop screencast');
      self.client.removeAllListeners('Page.screencastVisibilityChanged');
      self.client.removeAllListeners('Page.screencastFrame');
      await Page.stopScreencast();
      const waitForFFmpeg = new Promise((resolve) => {
        self.ffmpegChild.on('close', () => {
          resolve();
        });
      });
      self.ffmpegChild.stdin.end();
      await waitForFFmpeg;
      await self.updateStream({ path: self.output });
    } catch (err) {
      debug(`error in screencast cleanup: ${err}`);
    }
    return self.expectedResult;
  }
}

module.exports = ScreenRecorder;

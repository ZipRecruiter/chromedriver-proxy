

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
const debug = require('debug')('chromedriver_proxy:screen_recorder');
const debugFrame = require('debug')('chromedriver_proxy:screen_recorder_frame');
const S3 = require('aws-sdk/clients/s3');
const path = require('path');


const defaultVideoFormatArgs = {
  webm: [
    '-crf',
    '30',
    '-minrate',
    '500k',
    '-b:v',
    '2000k',
    '-c:v',
    'libvpx-vp9',
  ],
  mp4: [
    '-crf',
    '30',
    '-minrate',
    '500k',
    '-maxrate',
    '2000k',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
  ],
};

class ScreenRecorder {
  constructor(options) {
    this.videoFormat = options.videoFormat || 'webm';
    this.extraArgs = options.extraArgs || defaultVideoFormatArgs[this.videoFormat] || [];
    this.tmpDir = options.tmpDir || '/tmp';
    this.ffmpegPath = options.ffmpegPath || '/usr/bin/ffmpeg';
    this.s3Options = options.s3 || {};
    this.s3UploadOptions = options.s3Upload || {};
    this.client = options.client;
    this.index = 0;
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

  start(options) {
    const self = this;
    const params = options.params || {};
    const format = params.format || 'png';
    self.s3Prefix = options.s3Prefix || '';
    self.sessionId = options.sessionId;
    self.dir = options.dir || self.tmpDir;
    const { Page } = self.client;
    self.frames = [];

    // register listener 1st
    self.client.on('Page.screencastFrame', (result) => {
      Page.screencastFrameAck({ sessionId: result.sessionId });
      const binaryBlob = Buffer.from(result.data, 'base64');
      const framePath = `${self.dir}/${self.sessionId}-${self.index}.${format}`;
      self.frames.push({ file: path, timestamp: result.metadata.timestamp });
      debugFrame(`screencast frame: ${framePath} frame id: ${result.sessionId} time: ${result.metadata.timestamp}`);
      self.index += 1;
      fs.writeFile(framePath, binaryBlob, (err) => {
        if (err) {
          debug(`error unable to write screen frame to file: ${err}`);
        }
      });
    });

    self.client.on('Page.screencastVisibilityChanged', (visible) => {
      debug(`visiblility changed: ${JSON.stringify(visible)}`);
    });

    debug('start screencast');
    return Page.startScreencast(params).catch((err) => {
      debug(err);
    });
  }

  imagesToVideo(options) {
    const self = this;
    const ffmpegExe = '/usr/bin/ffmpeg';
    const args = [
      '-safe',
      '0',
      '-f',
      'concat',
      '-i',
      options.input,
    ].concat(self.extraArgs);
    args.push(options.output);

    const ffmpegChild = cp.spawn(ffmpegExe, args);

    return new Promise((resolve, reject) => {
      ffmpegChild.on('close', (code) => {
        if (code === 0) {
          resolve(0);
        } else {
          reject(code);
        }
      });
    });
  }

  getFilePath() {
    const self = this;
    return path.join(self.tmpDir, self.getFileName());
  }

  getFileName() {
    const self = this;
    return `${self.sessionId}.${self.videoFormat}`;
  }

  getS3Key() {
    const self = this;
    return `${self.s3Prefix || ''}${self.getFileName()}`;
  }

  uploadToS3(file) {
    const self = this;
    if (!this.s3UploadOptions.Bucket) {
      debug('skipping s3 upload: Bucket has not been set');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const key = self.getS3Key();
        const ext = path.extname(file).slice(1);

        const s3 = new S3(self.s3Options);
        const stream = fs.createReadStream(file);

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

  stop() {
    const self = this;
    const { Page } = self.client;
    debug('stop screencast');
    self.client.removeAllListeners('Page.screencastVisibilityChanged');
    self.client.removeAllListeners('Page.screencastFrame');
    return Page.stopScreencast().then(() => {
      let b = `file '${self.frames[0].file}'\n`;
      let lasttimestamp = self.frames[0].timestamp;

      for (let i = 1; i < self.frames.length; i += 1) {
        const e = self.frames[i];
        b += `duration ${e.timestamp - lasttimestamp}\n`;
        b += `file '${e.file}'\n`;
        lasttimestamp = e.timestamp;
      }
      const ffmpegFile = path.join(self.tmpDir, `${self.sessionId}-ffmpeg.txt`);
      debug(`ffmpeg config file: ${ffmpegFile}`);
      return new Promise((resolve, reject) => {
        fs.writeFile(ffmpegFile, b, (err) => {
          if (err) {
            debug(`error unable to write input: ${err}`);
            reject(err);
          } else {
            const output = self.getFilePath();
            self.imagesToVideo({
              input: ffmpegFile,
              output,
            }).then(() => {
              debug(`sucessfully created screencast: ${output}`);
              // delete the images
              const rm = util.promisify(fs.unlink);
              self.s3UploadResult = self.uploadToS3(output).catch(e => ({ error: e }));
              const cleanup = [ffmpegFile];
              self.frames.forEach((frame) => {
                cleanup.push(rm(frame.file));
              });
              return Promise.all(cleanup);
            }).then(() => {
              debug('deleted images');
              resolve(output);
            }).catch((e) => {
              debug(`error in screencast cleanup: ${e}`);
              resolve(output);
            });
          }
        });
      });
    });
  }
}

module.exports = ScreenRecorder;

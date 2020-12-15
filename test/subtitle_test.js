/**
* Copyright (c) 2020 ZipRecruiter
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
const fs = require('fs');

const ScreenRecorder = require('..').ScreenRecorder;

describe('Create subtitle blob', () => {

  it('can create subtitles', (done) => {
    const recorder = new ScreenRecorder({});

    recorder.firstFrameTimestamp = 100;
    recorder.currentDuration = 0;
    recorder.addSubtitle({text: 'first subtitle'});
    recorder.currentDuration = 0;
    recorder.addSubtitle({text: 'first subtitle'});
    recorder.currentDuration = 102;
    recorder.addSubtitle({text: 'second subtitle'});
    recorder.currentDuration = 105;

    const subtitles = recorder.createSubtitle();

    const expected = 'WEBVTT\n\n00:00.000 --> 01:42.000\nfirst subtitle\n\n01:42.000 --> 02:15.000\nsecond subtitle\n\n';

    expect(subtitles.blob).to.be.equal(expected);

    done();

  });
});

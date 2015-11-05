/*jslint node:true*/

'use strict';

/**
 * A pump pumps data from a source to a destination. Source and destination can be readable and writable streams.
 * @param onPumpFn
 * @constructor
 */
var Pump = function (onPumpFn) {
    if (typeof onPumpFn === 'function') {
        this.onPump = onPumpFn;
    }
};

Pump.prototype = {
    /**
     * Register a readable source stream
     * @param {stream.Readable} source - Source stream
     */
    registerReadableSource: function (source) {
        var self = this;
        if (this.source) {
            throw new Error('There is already a source');
        }
        if (!source.readable) {
            throw new Error('This stream is not readable');
        }
        this.source = source;
        this.sourceType = 'readable';
        source.on('readable', function () {
            self.sourceIsReady = true;
            self.pump();
        });
        source.on('error', function () {
            self.destroy();
        });
        source.on('end', function () {
            self.sourceIsFinished = true;
            self.pump();
        });
    },
    /**
     * Register a writable source stream
     * @param {stream.Writable} source - Source stream
     */
    registerWritableSource: function (source) {
        var self = this;
        if (this.source) {
            throw new Error('There is already a source');
        }
        if (!source.writable) {
            throw new Error('This stream is not writable');
        }
        this.source = source;
        this.sourceType = 'writable';

        /*jslint nomen:true*/
        source._write = function (chunk, encoding, next) {
            self.lastChunk = chunk;
            self.lastEncoding = encoding;
            self.lastNext = next;
            self.sourceIsReady = true;
            self.pump();
        };
        /*jslint nomen:false*/
        source.on('finish', function () {
            setTimeout(function () { // give the possibility to write first
                self.sourceIsFinished = true;
                self.pump();
            }, 0);

        });

    },
    /**
     * Register a readable destination stream
     * @param {stream.Readable} destination - Destination stream
     */
    registerReadableDestination: function (destination) {
        var self = this;
        if (this.destination) {
            throw new Error('There is already a destination');
        }
        if (!destination.readable) {
            throw new Error('This stream is not readable');
        }
        this.destination = destination;
        this.destinationType = 'readable';
        /*jslint nomen:true*/
        destination._read = function (bytes) {
            self.bytesToRead = bytes;
            self.destinationIsReady = true;
            self.pump();
        };
        /*jslint nomen:false*/
    },
    /**
     * Register a writable destination stream
     * @param {stream.Writable} destination - Destination stream
     */
    registerWritableDestination: function (destination) {
        if (this.destination) {
            throw new Error('There is already a destination');
        }
        if (!destination.writable) {
            throw new Error('This stream is not writable');
        }
        this.destination = destination;
        this.destinationType = 'writable';
        this.destinationIsReady = true;
    },

    /**
     *
     * @param {stream} source - Source stream
     * @param {stream} destination - Destination stream
     * @param {Pump} pump - The current pump object
     */
    onPump: function (source, destination, pump) {
        var chunk;
        // read chunk
        if (this.sourceType === 'readable') {
            if (this.destinationType === 'readable') {
                chunk = source.read(); // (/*this.bytesToRead*/); TODO: try to use read with bytes!
            } else if (this.destinationType === 'writable') {
                chunk = source.read();
            }
        } else if (this.sourceType === 'writable') {
            chunk = source.chunk;
        }

        // write chunk
        if (this.destinationType === 'readable') {
            destination.push(chunk);

        } else if (this.destinationType === 'writable') {
            destination.write(chunk);
        }

        if (!this.sourceIsFinished) {
            if (this.sourceType === 'writable') {
                //console.log('go on writable');
                source.next();
            } else if (this.sourceType === 'readable') {
                //console.log('go on readable');
                source.read(0);
            }
        }
    },
    /**
     * Try to pump data if source and destination are ready
     * @private
     */
    pump: function () {

        var self = this;
        if (this.sourceIsReady && this.destinationIsReady) {

            this.sourceIsReady = false;
            if (this.destinationType !== 'writable') {
                this.destinationIsReady = false;
            }

            if (this.sourceType === 'readable' && this.destinationType === 'writable') {
                //console.log('readable -> writable');
                this.onPump(this.source, this.destination, self);
                this.sourceIsReady = false;
            } else if (this.sourceType === 'readable' && this.destinationType === 'readable') {
                //console.log('readable -> readable');
                this.onPump(this.source, this.destination, self);
            } else if (this.sourceType === 'writable' && this.destinationType === 'readable') {
                //console.log('writable -> readable');
                this.onPump({read: function () {self.lastNext(); return self.lastChunk; }, chunk: this.lastChunk, encoding: this.lastEncoding, next: this.lastNext}, this.destination, self);
            } else if (this.sourceType === 'writable' && this.destinationType === 'writable') {
                //console.log('writable -> writable');
                this.onPump({read: function () {self.lastNext(); return self.lastChunk; }, chunk: this.lastChunk, encoding: this.lastEncoding, next: this.lastNext}, this.destination, self);
            }
        } else if (this.sourceIsFinished) {
            this.destroy();
        }
    },

    /**
     * Terminates all streams
     * @param {boolean} [force=false] - Force terminating streams
     */
    destroy: function (force) {
        var self = this,
            wait = function () {
                console.log('waiting');
                setTimeout(function () {
                    self.destroy();
                }, 0);
            };

        if (!force) {
            /*jslint nomen:true*/
            if (this.destinationType === 'readable' && this.destination._readableState.buffer.length) {
                return wait();
            }
            if (this.sourceType === 'writable' && !this.source._writableState.ended) {
                return wait();
            }
            /*jslint nomen:false*/
        }

        if (this.destinationType === 'readable') {
            this.destination.push(null);
        } else if (this.destinationType === 'writable') {
            this.destination.end();
        }
    },

    /**
     * Source stream
     * @type {stream}
     */
    source: null,
    /**
     * Destination stream
     * @type {stream}
     */
    destination: null,

    /**
     * Boolean to proof if source is ready to deliver data
     * @type {boolean}
     */
    sourceIsReady: false,
    /**
     * Boolean to proof if source is finished with delivery
     * @type {boolean}
     */
    sourceIsFinished: false,
    /**
     * Determine if source is readable or writable
     * @type {string}
     */
    sourceType: null,
    /**
     * Requested bytes from destination
     * @type {number}
     */
    bytesToRead: 0,
    /**
     * Boolean to proof if destination is ready for deliver data
     * @type {boolean}
     */
    destinationIsReady: false,
    /**
     * Determine if destination is readable or writable
     * @type {string}
     */
    destinationType: null,

    /**
     * If source stream is writable this is the last delivered chunk
     * @type {*}
     */
    lastChunk: null,
    /**
     * If source stream is writable this is the encoding of the last delivered chunk
     * @type {*}
     */
    lastNext: null,
    /**
     * If source stream is writable this is next callback of the last delivered chunk
     * @type {*}
     */
    lastEncoding: null
};

module.exports = Pump;

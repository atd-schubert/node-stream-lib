/*jslint node: true*/

'use strict';
var Duplex = require('stream').Duplex;


/**
 * A sluice for streams. It works like a pipe with two gates. If the first gate is closed incoming chunks dismiss
 * this stream. If the second gate is closed chunks get buffered, but not send to next stream.
 * @author Arne Schubert <atd.schubert@gmail.com>
 * @constructor
 * @memberOf streamLib
 * @augments {stream.Duplex}
 */
var Sluice = function () {
    Duplex.apply(this, arguments);

    this.on('finish', function () {
        this.buffer.push(null);
    });

    this.buffer = [];

};
/*jslint unparam: true*/
Sluice.prototype = {
    '__proto__': Duplex.prototype,

    '_read': function () {
        if (!this.flowOut) {
            return;
        }
        while (this.buffer.length) {
            this.push(this.buffer.shift());
        }
    },
    '_write': function (chunk, encoding, next) {
        if (!this.flowIn) {
            next();
        }
        this.buffer.push(chunk);
        /*jslint nomen: true*/
        this._read();
        /*jslint nomen: false*/
    },

    /**
     * Allow incoming chunks
     * @returns {Sluice}
     */
    openInlet: function () {
        this.flowIn = true;
        return this;
    },
    /**
     * Deny incoming chunks
     * @returns {Sluice}
     */
    closeInlet: function () {
        this.flowIn = false;
        return this;
    },
    /**
     * Allow outgoing chunks
     * @returns {Sluice}
     */
    openOutlet: function () {
        this.flowOut = true;
        /*jslint nomen: true*/
        this._read();
        /*jslint nomen: false*/
        return this;
    },
    /**
     * Deny outgoing chunks
     * @returns {Sluice}
     */
    closeOutlet: function () {
        this.flowOut = false;
        return this;
    },
    /**
     * Collect chunks in buffer but do not send them to next stream
     * @returns {Sluice}
     */
    pourIn: function () {
        return this.closeOutlet().openInlet();
    },
    /**
     * Dismiss incoming chunks, but clear buffer by sending to next stream
     * @returns {Sluice}
     */
    pourOut: function () {
        return this.openOutlet().closeInlet();
    },
    /**
     * All gates open, work as a normal pipe
     * @returns {Sluice}
     */
    fullFlow: function () {
        return this.openOutlet().openInlet();
    },
    /**
     * Dismiss incoming chunks and do not send any buffered data to next stream
     * @returns {Sluice}
     */
    freeze: function () {
        return this.closeOutlet().closeInlet();
    },

    /**
     * Buffer of chunks
     * @type {Buffer[]|Array}
     */
    buffer: [],

    /**
     * Allow chunks to flow-in?
     * @type {Boolean}
     */
    flowIn: true,
    /**
     * Allow chunks to flow-out?
     * @type {Boolean}
     */
    flowOut: true
};
/*jslint unparam: false*/

module.exports = Sluice;

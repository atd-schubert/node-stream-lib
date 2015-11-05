/*jslint node:true*/

'use strict';

/**
 * @author Arne Schubert <atd.schubert@gmail.com>
 * @module stream-lib.event
 */

var duplexStream = require('stream').Duplex;
var transformStream = require('stream').Transform;

var Pump = require('../helper/pump');

/**
 * Create an event stream that works like normal event emitters but on streams
 *
 * @param {function} [pumpFn] - Function to enhance the logic of this stream
 * @returns {stream.Duplex}
 */
var eventStream = function (pumpFn) {
    var ds = duplexStream({objectMode: true}),
        pump = new Pump(pumpFn);

    pump.registerWritableSource(ds);
    pump.registerReadableDestination(ds);

    /**
     * Send an event over a stream
     * @param {string} name - Event name
     * @param {*} data - Data to bind on event
     */
    ds.send = function streamEmit(name, data) {
        /**
         * @alias eventStream~event
         * @type {{name: string, data: *, timestamp: number}}
         */
        var event = {
            name: name,
            data: data,
            timestamp: Date.now()
        };
        ds.write(event);
    };
    /**
     * Receive an event from a stream
     * @param {string|RegExp|{test:function}} name - Name of the events that should be listened
     * @param {function} fn - Function to execute when receiving event
     */
    ds.receive = function streamOn(name, fn) {
        ds.on('data', function (chunk) {
            if (typeof name === 'string') {
                if (chunk.name === name) {
                    fn(chunk.data);
                }
            } else if (typeof name.test === 'function') {
                if (name.test(chunk.name)) {
                    fn(chunk.data);
                }
            }
        });
    };
    /**
     * Receive an event once from a stram
     * @param {string|RegExp|{test:function}} name - Name of the events that should be listened
     * @param {function} fn - Function to execute when receiving event
     */
    ds.receiveOnce = function (name, fn) {
        var listener = function (chunk) {
            if (typeof name === 'string') {
                if (chunk.name === name) {
                    fn(chunk.data);
                }
            } else if (typeof name.test === 'function') {
                if (name.test(chunk.name)) {
                    fn(chunk.data);
                }
            } else {
                ds.once('data', listener);
            }
        };
        ds.once('data', listener);
    };
    /**
     * Send emitted events from an event emitter on event stream with prefix
     * @param {events.EventEmitter} emitter
     * @param {string} [eventPrefix=""] - Prefix events with this prefix on event stream
     */
    ds.augmentEmitter = function (emitter, eventPrefix) {
        eventPrefix = eventPrefix || '';
        var oldEmit = emitter.emit;
        emitter.emit = function (name, data) {
            oldEmit.apply(emitter, arguments);
            ds.send(eventPrefix + name, data);
        };
    };
    /**
     * Emits received events from event stream on a normal event emitter with prefix
     * @param {events.EventEmitter} listener
     * @param {string} [eventPrefix=""] - Prefix streamed events with this prefix on event emitter
     */
    ds.augmentListener = function (listener, eventPrefix) {
        var lastName;

        eventPrefix = eventPrefix || '';

        ds.receive({
            test: function (val) {
                lastName = val;
                return true;
            }
        }, function (data) {
            listener.emit(eventPrefix + lastName, data);
        });
    };

    return ds;
};
eventStream = function () {
    var ts = transformStream({objectMode: true}),
        listeners = [];

    ts._transform = function (chunk, encoding, next) {
        var i;
        ts.push(chunk);

        for (i = 0; i < listeners.length; i += 1) {
            listeners[i](chunk);
        }

        next();
    };
    ts.on('finish', function () {
        ts.push(null);
    });

    ts.send = function streamEmit(name, data) {
        /**
         * @alias eventStream~event
         * @type {{name: string, data: *, timestamp: number}}
         */
        var event = {
            name: name,
            data: data,
            timestamp: Date.now()
        };
        ts.push(event);
    };
    /**
     * Receive an event from a stream
     * @param {string|RegExp|{test:function}} name - Name of the events that should be listened
     * @param {function} fn - Function to execute when receiving event
     */
    ts.receive = function streamOn(name, fn) {
        var str;
        if (typeof name === 'string') {
            str = name;
            name = {
                test: function (val) {
                    console.log();
                    return val === str;
                }
            };
        }
        listeners.push(function (chunk) {
            if (name.test(chunk.name)) {
                fn(chunk.data);
            }
        });
    };
    ts.receiveOnce = function streamOn(name, fn) {
        var str;
        if (typeof name === 'string') {
            str = name;
            name = {
                test: function (val) {
                    return val === str;
                }
            };
        }
        var wrapper = function (chunk) {
            if (name.test(chunk.name)) {
                listeners.splice(listeners.indexOf(wrapper), 1);
                fn(chunk.data);
            }
        };
        listeners.push(wrapper);
    };
    return ts;
};

/**
 * Pipe an event with a prefix
 * @param {string} prefix - Prefix that should be used
 * @returns {stream.Duplex}
 */
eventStream.prefix = function (prefix) {
    var ds = eventStream(function (src, dst) {
        var tmp = {},
            hash;

        for (hash in src.chunk) {
            if (src.chunk.hasOwnProperty(hash)) {
                tmp[hash] = src.chunk[hash];
            }
        }
        tmp.name = prefix + tmp.name;
        dst.push(tmp);
        src.next();
    });
    return ds;
};

/**
 * Pipe an event without prefix
 * @param {string} prefix - Prefix that should be used
 * @returns {stream.Duplex}
 */
eventStream.unprefix = function (prefix) {
    return eventStream(function (src, dst, pump) {
        var tmp = {},
            hash;
        if (src.chunk.name.indexOf(prefix) !== 0) {
            pump.destinationIsReady = true;
            return src.next();
        }

        for (hash in src.chunk) {
            if (src.chunk.hasOwnProperty(hash)) {
                tmp[hash] = src.chunk[hash];
            }
        }
        tmp.name = tmp.name.substr(prefix.length);
        dst.push(tmp);
        src.next();
    });
    return ds;
};

/**
 * Pipe an event with postfix
 * @param {string} postfix - Postfix that should be used
 * @returns {stream.Duplex}
 */
eventStream.postfix = function (postfix) {
    return eventStream(function (src, dst) {
        var tmp = {},
            hash;

        for (hash in src.chunk) {
            if (src.chunk.hasOwnProperty(hash)) {
                tmp[hash] = src.chunk[hash];
            }
        }
        tmp.name = tmp.name + postfix;
        dst.push(tmp);
        src.next();
    });
};
/**
 * Pipe an event without postfix
 * @param {string} postfix - Postfix that should be used
 * @returns {stream.Duplex}
 */
eventStream.unpostfix = function (postfix) {
    return eventStream(function (src, dst, pump) {
        var tmp = {},
            hash,
            index = src.chunk.name.indexOf(postfix);

        if (index < 1 || index + postfix.length !== src.chunk.name.length) {
            pump.destinationIsReady = true;
            return src.next();
        }

        for (hash in src.chunk) {
            if (src.chunk.hasOwnProperty(hash)) {
                tmp[hash] = src.chunk[hash];
            }
        }
        tmp.name = tmp.name.substring(0, tmp.name.length - postfix.length);
        dst.push(tmp);
        src.next();
    });
};

/**
 * Filter events
 * @param {string|RegExp|{test: function}} filter - Event name filter
 * @returns {stream.Duplex}
 */
eventStream.filter = function (filter) {
    var str, ds;
    if (typeof filter === 'string') {
        str = filter;
        filter = {
            test: function (val) {
                return val === str;
            }
        };
    }

    ds = eventStream(function (src, dst, pump) {
        if (filter.test(src.chunk.name)) {
            dst.push(src.chunk);
        } else {
            pump.destinationIsReady = true;
        }
        src.next();
    });
    return ds;
};

eventStream.ringGate = function () {
    // TODO: create

    /*
    * A stream that filters events that pass the stream twice
    * */
};

module.exports = eventStream;

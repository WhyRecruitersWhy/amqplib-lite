var amqp = require('amqplib/callback_api');
var util = require('./rabbit.util.js');
var Q = require('q');
var amqpConn = null; // Connection object to be used to subscribe to the Q
var logger = {};

/**
 * The configuration object that must be passed for an amqp connection string to be properly built
 * @typedef {Object} customLogger
 * @property {function} error - custom implementation of customLogger.error
 * @property {function} info - custom implementation of customLogger.info
 * @property {function} debug - custom implementation of customLogger.debug
 * @property {function} fatal - custom implementation of customLogger.fatal
 * @property {function} trace - custom implementation of customLogger.trace
 * @property {function} warn - custom implementation of customLogger.warn
 */

/**
 * Creates a new Listener instance
 * @constructor
 * @param {customLogger} [customLogger = require('./loggerService.js')] - A custom logger object
 * @example
 * // Custom logger passed in
 * var client = new amqpService(customLogObj);
 * client.start(handlers,config);
 *
 * // No custom logger pass in
 * var client = new amqpService();
 * client.start(handlers,config);
 *
 */
function Listener(customLogger){
    logger = customLogger || require('./loggerService.js');
}

/**
 * The configuration object that must be passed for an amqp connection string to be properly built
 * @typedef {Object} RabbitHandler
 * @property {function} handlerFunction - The callback function that messages will be returned and processed on
 * @property {String} queueConfig - The queue that it will connect to ex "My.First.Queue"
 * @property {Number} messageRate - The amount of messages that can be received at a time. Once this amount of messages is ack more will come in (if available)
 */

/**
 * An array of RabbitHandlers, each rabbit handler has a configuration for a queue to connect to
 * @typedef {Array<RabbitHandler>} RabbitHandlers
 */

/**
 * The configuration object that must be passed for an amqp connection string to be properly built
 * @typedef {Object} RabbitConfiguration
 * @property {String} rabbitmqserver - RabbitMqServer string IP or Domain.
 * @property {Number} rabbitmqport - RabbitMqServer Port.
 * @property {String} rabbitmqusername - RabbitMqServer username.
 * @property {String} rabbitmqpassword - RabbitMqServer password.
 * @property {String} subscribequeue - RabbitMqServer queue that you wish to subscribe to.
 * @property {String} vhost - RabbitMqServer vhost.
 */

/**
 * Generates and processes a single amqp connection for channels to be opened on.
 * @memberof Listener
 * @param {RabbitHandlers} handlers - Array of callback handlers WITH configuration for those handlers, one handler per channel
 * @param {RabbitConfiguration} config - must pass a {@link RabbitConfiguration} object
 */
Listener.prototype.start = function (handlers,config) {
    amqp.connect(util.buildRabbitMqUrl(config), function (err, conn) {//'amqp://ADMIN_TEST:Nreca123!@vavt-soa-rmq01:5672/GEMS-TEST'


        logger.info("Connection in progress...");

        if (err) {
            console.error("[AMQP]", err.message);
            logger.error("[AMQP] " + err.message);
            return setTimeout(start, 1000);
        }

        conn.on("error", function (err) {
            if (err.message !== "Connection closing") {
                console.error("[AMQP] conn error", err.message);
                logger.error("[AMQP] " + err.message);
            }
        });

        conn.on("close", function () {
            console.error("[AMQP] reconnecting");
            logger.error("[AMQP] reconnecting");
            return setTimeout(start, 1000);
        });

        console.log("[AMQP] connected");
        logger.info("[AMQP] has connected successfully");
        amqpConn = conn;


        // After a successful connection run the channel queue connections
        whenConnected(handlers);
    });
}

/**
 * A Channel object, part of the amqplib. Search amqplib documentation for more information
 * @typedef {Object} Channel
 */

/**
 * Sets up a channel object to be used
 * @memberof Listener
 * @param {number} messageRate - number of messages that will be fetched at a time. server must receive ack before it will pass more.
 * @returns {Promise<Channel>} - channel object that can be used to request messages and response
 */
function setUpListener(messageRate) {
    return Q.ninvoke(amqpConn, 'createChannel').then(function (ch) {

        ch.on("error", function (err) {
            console.error("[AMQP] channel error", err);
        });
        ch.on("close", function () {
            console.log("[AMQP] Channel closed");
        });
        ch.prefetch(messageRate); // limit the number of messages that are read to 1, once the server receives an acknowledgement back it will then send another
        return ch;
    });
}

/**
 * This function should be fired when the main amqp connection has been fired
 * @memberof Listener
 * @param {array} handlers - Takes in an array of confuration settings to loop through and create queue connections for
 */
function whenConnected(handlers) {
    logger.info("[AMQP] Beginning channel connections");
    handlers.forEach(function (handler){
        logger.info("[AMQP] attempting queue listener handshake for " + handler.queueConfig);
        setUpListener(handler.messageRate)
            .then(function (ch) {
                logger.info("[AMQP] Success handshake complete, listening on " + handler.queueConfig);
                ch.consume(handler.queueConfig, handler.handlerFunction.bind(ch), {noAck: false});
            }).catch(function (err) {
            if (err) {
                console.log(err)
                logger.fatal("[AMQP] " + err.message);
                closeOnErr(err.message);
            }
        });
    });

}

/**
 * Handle amqp connection errors
 * Dispose of the amqp connection properly to prevent memeory leaks
 * @memberof Listener
 * @param {String} err - the message that will be used for logging
 * @returns {boolean}
 */
function closeOnErr(err) {
    if (!err) return false;

    logger.error(err);
    amqpConn.close();
    return true;
}

module.exports = Listener;
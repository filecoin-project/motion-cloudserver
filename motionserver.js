'use strict'; // eslint-disable-line strict

const arsenal = require('arsenal');
const { config } = require('./lib/Config.js');
const logger = require('./lib/utilities/logger.js');

const pfsServer = new arsenal.network.rest.RESTServer({
    bindAddress: config.motionDaemon.bindAddress,
    port: config.motionDaemon.port,
    dataStore: new arsenal.storage.data.file.DataFileStore({
        dataPath: config.motionDaemon.dataPath,
        log: config.log,
        noSync: config.motionDaemon.noSync,
        noCache: config.motionDaemon.noCache,
        isPassthrough: true,
        isReadOnly: config.motionDaemon.isReadOnly,
    }),
    log: config.log,
});

motionServer.setup(err => {
    if (err) {
        logger.error('Error initializing REST MotionServer', {
            error: err,
        });
        return;
    }
    pfsServer.start();
});

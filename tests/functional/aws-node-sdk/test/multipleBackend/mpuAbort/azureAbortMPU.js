const assert = require('assert');
const async = require('async');

const { s3middleware } = require('arsenal');
const withV4 = require('../../support/withV4');
const BucketUtility = require('../../../lib/utility/bucket-util');
const { describeSkipIfNotMultipleOrCeph, uniqName, getAzureClient,
    getAzureContainerName, convertMD5, azureLocation } = require('../utils');
const azureMpuUtils = s3middleware.azureHelper.mpuUtils;
const maxSubPartSize = azureMpuUtils.maxSubPartSize;

const keyObject = 'abortazure';
const azureClient = getAzureClient();
const azureContainerName = getAzureContainerName(azureLocation);
const expectedMD5 = 'a63c90cc3684ad8b0a2176a6a8fe9005';

let bucketUtil;
let s3;

function azureCheck(container, key, expected, cb) {
    azureClient.getContainerClient(container).getProperties(key).then(res => {
        assert.ok(!expected.error);
        const convertedMD5 = convertMD5(res.contentSettings.contentMD5);
        assert.strictEqual(convertedMD5, expectedMD5);
        return cb();
    },
    err => {
        assert.ok(expected.error);
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'NotFound');
        return cb();
    });
}

describeSkipIfNotMultipleOrCeph('Abort MPU on Azure data backend', function
describeF() {
    this.timeout(50000);
    withV4(sigCfg => {
        beforeEach(function beforeFn() {
            this.currentTest.key = uniqName(keyObject);
            bucketUtil = new BucketUtility('default', sigCfg);
            s3 = bucketUtil.s3;
        });
        describe('with bucket location header', () => {
            beforeEach(function beforeEachFn(done) {
                async.waterfall([
                    next => s3.createBucket({ Bucket: azureContainerName },
                        err => next(err)),
                    next => s3.createMultipartUpload({
                        Bucket: azureContainerName,
                        Key: this.currentTest.key,
                        Metadata: { 'scal-location-constraint': azureLocation },
                    }, (err, res) => {
                        if (err) {
                            return next(err);
                        }
                        this.currentTest.uploadId = res.UploadId;
                        return next();
                    }),
                ], done);
            });

            afterEach(done => s3.deleteBucket({ Bucket: azureContainerName },
                done));

            it('should abort an MPU with one empty part ', function itFn(done) {
                const expected = { error: true };
                const params = {
                    Bucket: azureContainerName,
                    Key: this.test.key,
                    UploadId: this.test.uploadId,
                };
                async.waterfall([
                    next => {
                        const partParams = Object.assign({ PartNumber: 1 },
                            params);
                        s3.uploadPart(partParams, err => {
                            assert.strictEqual(err, null, 'Expected success, ' +
                            `got error: ${err}`);
                            return next();
                        });
                    },
                    next => s3.abortMultipartUpload(params, err => next(err)),
                    next => azureCheck(azureContainerName, this.test.key,
                    expected, next),
                ], done);
            });

            it('should abort MPU with one part bigger than max subpart',
            function itFn(done) {
                const expected = { error: true };
                const params = {
                    Bucket: azureContainerName,
                    Key: this.test.key,
                    UploadId: this.test.uploadId,
                };
                async.waterfall([
                    next => {
                        const body = Buffer.alloc(maxSubPartSize + 10);
                        const partParams = Object.assign(
                            { PartNumber: 1, Body: body }, params);
                        s3.uploadPart(partParams, err => {
                            assert.strictEqual(err, null, 'Expected ' +
                            `success, got error: ${err}`);
                            return next();
                        });
                    },
                    next => s3.abortMultipartUpload(params, err => next(err)),
                    next => azureCheck(azureContainerName, this.test.key,
                    expected, next),
                ], done);
            });
        });

        describe('with previously existing object with same key', () => {
            beforeEach(function beforeEachFn(done) {
                async.waterfall([
                    next => s3.createBucket({ Bucket: azureContainerName },
                        err => next(err)),
                    next => {
                        const body = Buffer.alloc(10);
                        s3.putObject({
                            Bucket: azureContainerName,
                            Key: this.currentTest.key,
                            Metadata: { 'scal-location-constraint':
                                azureLocation },
                            Body: body,
                        }, err => {
                            assert.equal(err, null, 'Err putting object to ' +
                            `azure: ${err}`);
                            return next();
                        });
                    },
                    next => s3.createMultipartUpload({
                        Bucket: azureContainerName,
                        Key: this.currentTest.key,
                        Metadata: { 'scal-location-constraint': azureLocation },
                    }, (err, res) => {
                        if (err) {
                            return next(err);
                        }
                        this.currentTest.uploadId = res.UploadId;
                        return next();
                    }),
                ], done);
            });

            afterEach(() => {
                process.stdout.write('Emptying bucket\n');
                return bucketUtil.empty(azureContainerName)
                .then(() => {
                    process.stdout.write('Deleting bucket\n');
                    return bucketUtil.deleteOne(azureContainerName);
                })
                .catch(err => {
                    process.stdout.write('Error emptying/deleting bucket: ' +
                    `${err}\n`);
                    throw err;
                });
            });

            it('should abort MPU without deleting existing object',
            function itFn(done) {
                const expected = { error: false };
                const params = {
                    Bucket: azureContainerName,
                    Key: this.test.key,
                    UploadId: this.test.uploadId,
                };
                async.waterfall([
                    next => {
                        const body = Buffer.alloc(10);
                        const partParams = Object.assign(
                            { PartNumber: 1, Body: body }, params);
                        s3.uploadPart(partParams, err => {
                            assert.strictEqual(err, null, 'Expected ' +
                            `success, got error: ${err}`);
                            return next();
                        });
                    },
                    next => s3.abortMultipartUpload(params, err => next(err)),
                    next => azureCheck(azureContainerName, this.test.key,
                    expected, next),
                ], done);
            });
        });
    });
});

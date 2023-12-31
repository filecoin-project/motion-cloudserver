const assert = require('assert');
const { S3 } = require('aws-sdk');

const getConfig = require('../support/config');

const bucket = `versioning-bucket-${Date.now()}`;
const config = getConfig('default', { signatureVersion: 'v4' });
const configReplication = getConfig('replication',
    { signatureVersion: 'v4' });
const s3 = new S3(config);
describe('aws-node-sdk test bucket versioning', function testSuite() {
    this.timeout(60000);
    let replicationAccountS3;

    // setup test
    before(done => {
        replicationAccountS3 = new S3(configReplication);
        s3.createBucket({ Bucket: bucket }, done);
    });

    // delete bucket after testing
    after(done => s3.deleteBucket({ Bucket: bucket }, done));

    it('should not accept empty versioning configuration', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {},
        };
        s3.putBucketVersioning(params, error => {
            if (error) {
                assert.strictEqual(error.statusCode, 400);
                assert.strictEqual(
                    error.code, 'IllegalVersioningConfigurationException');
                done();
            } else {
                done('accepted empty versioning configuration');
            }
        });
    });

    it('should retrieve an empty versioning configuration', done => {
        const params = { Bucket: bucket };
        s3.getBucketVersioning(params, (error, data) => {
            assert.strictEqual(error, null);
            assert.deepStrictEqual(data, {});
            done();
        });
    });

    it('should not accept versioning configuration w/o "Status"', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {
                MFADelete: 'Enabled',
            },
        };
        s3.putBucketVersioning(params, error => {
            if (error) {
                assert.strictEqual(error.statusCode, 400);
                assert.strictEqual(
                    error.code, 'IllegalVersioningConfigurationException');
                done();
            } else {
                done('accepted empty versioning configuration');
            }
        });
    });

    it('should retrieve an empty versioning configuration', done => {
        const params = { Bucket: bucket };
        s3.getBucketVersioning(params, (error, data) => {
            assert.strictEqual(error, null);
            assert.deepStrictEqual(data, {});
            done();
        });
    });

    it('should not accept versioning configuration w/ invalid value', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {
                MFADelete: 'fun',
                Status: 'let\'s do it',
            },
        };
        s3.putBucketVersioning(params, error => {
            if (error) {
                assert.strictEqual(error.statusCode, 400);
                assert.strictEqual(
                    error.code, 'IllegalVersioningConfigurationException');
                done();
            } else {
                done('accepted empty versioning configuration');
            }
        });
    });

    it('should not accept versioning with MFA Delete enabled', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {
                MFADelete: 'Enabled',
                Status: 'Enabled',
            },
        };
        s3.putBucketVersioning(params, error => {
            assert.notEqual(error, null, 'Expected failure but got success');
            assert.strictEqual(error.statusCode, 501);
            assert.strictEqual(error.code, 'NotImplemented');
            done();
        });
    });

    it('should accept versioning with MFA Delete disabled', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {
                MFADelete: 'Disabled',
                Status: 'Enabled',
            },
        };
        s3.putBucketVersioning(params, error => {
            assert.equal(error, null, 'Expected success but got failure');
            done();
        });
    });

    it('should retrieve the valid versioning configuration', done => {
        const params = { Bucket: bucket };
        s3.getBucketVersioning(params, (error, data) => {
            assert.strictEqual(error, null);
            assert.deepStrictEqual(data, { MFADelete: 'Disabled',
                Status: 'Enabled' });
            done();
        });
    });

    it('should accept valid versioning configuration', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {
                Status: 'Enabled',
            },
        };
        s3.putBucketVersioning(params, done);
    });

    it('should accept valid versioning configuration if user is a ' +
    'replication user', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {
                Status: 'Enabled',
            },
        };
        replicationAccountS3.putBucketVersioning(params, done);
    });

    it('should retrieve the valid versioning configuration', done => {
        const params = { Bucket: bucket };
        s3.getBucketVersioning(params, (error, data) => {
            assert.strictEqual(error, null);
            assert.deepStrictEqual(data, { Status: 'Enabled' });
            done();
        });
    });
});


describe('bucket versioning for ingestion buckets', () => {
    const Bucket = `ingestion-bucket-${Date.now()}`;
    before(done => s3.createBucket({
            Bucket,
            CreateBucketConfiguration: {
                LocationConstraint: 'us-east-2:ingest',
            },
        }, done));

    after(done => s3.deleteBucket({ Bucket }, done));

    it('should not allow suspending versioning for ingestion buckets', done => {
        s3.putBucketVersioning({ Bucket, VersioningConfiguration: {
            Status: 'Suspended'
        } }, err => {
            assert(err, 'Expected error but got success');
            assert.strictEqual(err.code, 'InvalidBucketState');
            done();
        });
    });
});

describe('aws-node-sdk test bucket versioning with object lock', () => {
    let s3;

    // setup test
    before(done => {
        const config = getConfig('default', { signatureVersion: 'v4' });
        s3 = new S3(config);
        s3.createBucket({
            Bucket: bucket,
            ObjectLockEnabledForBucket: true,
        }, done);
    });

    // delete bucket after testing
    after(done => s3.deleteBucket({ Bucket: bucket }, done));

    it('should not accept suspending version when object lock is enabled', done => {
        const params = {
            Bucket: bucket,
            VersioningConfiguration: {
                Status: 'Suspended',
            },
        };
        s3.putBucketVersioning(params, error => {
            assert.strictEqual(error.code, 'InvalidBucketState');
            done();
        });
    });
});


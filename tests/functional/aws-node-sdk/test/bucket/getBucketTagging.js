const assertError = require('../../../../utilities/bucketTagging-util');
const { S3 } = require('aws-sdk');
const async = require('async');
const assert = require('assert');
const getConfig = require('../support/config');

const bucket = 'gettaggingtestbucket';

describe('aws-sdk test get bucket tagging', () => {
    let s3;

    before(() => {
        const config = getConfig('default', { signatureVersion: 'v4' });
        s3 = new S3(config);
    });

    beforeEach(done => s3.createBucket({ Bucket: bucket }, done));

    afterEach(done => s3.deleteBucket({ Bucket: bucket }, done));

    it('should return accessDenied if expected bucket owner does not match', done => {
        async.waterfall([
            next => s3.getBucketTagging({
                AccountId: s3.AccountId,
                Bucket: bucket,
                ExpectedBucketOwner: '944690102203',
            },
                (err, res) => {
                    next(err, res);
                }),
        ], err => {
            assertError(err, 'AccessDenied');
            done();
        });
    });

    it('should not return accessDenied if expected bucket owner matches', done => {
        async.series([
            next => s3.getBucketTagging({ AccountId: s3.AccountId, Bucket: bucket, ExpectedBucketOwner: s3.AccountId },
                (err, res) => {
                    next(err, res);
                }),
        ], err => {
            assertError(err, 'NoSuchTagSet');
            done();
        });
    });

    it('should return the TagSet', done => {
        const tagSet = {
            TagSet: [
                {
                    Key: 'key1',
                    Value: 'value1',
                },
            ],
        };
        async.series([
            next => s3.putBucketTagging({
                AccountId: s3.AccountId,
                Tagging: tagSet,
                Bucket: bucket,
                ExpectedBucketOwner: s3.AccountId
            }, next),
            next => s3.getBucketTagging({
                AccountId: s3.AccountId,
                Bucket: bucket,
                ExpectedBucketOwner: s3.AccountId
            }, next),
        ], (err, data) => {
            assert.deepStrictEqual(data[1], tagSet);
            done();
        });
    });
});

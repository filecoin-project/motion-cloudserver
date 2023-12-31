const assert = require('assert');
const async = require('async');

const withV4 = require('../support/withV4');
const BucketUtility = require('../../lib/utility/bucket-util');
const { removeAllVersions } = require('../../lib/utility/versioning-util');

const bucketName = `multi-object-delete-${Date.now()}`;
const key = 'key';
// formats differ for AWS and S3, use respective sample ids to obtain
// correct error response in tests
const nonExistingId = process.env.AWS_ON_AIR ?
    'MhhyTHhmZ4cxSi4Y9SMe5P7UJAz7HLJ9' :
    '3939393939393939393936493939393939393939756e6437';

function checkNoError(err) {
    assert.equal(err, null,
        `Expected success, got error ${JSON.stringify(err)}`);
}

function sortList(list) {
    return list.sort((a, b) => {
        if (a.Key > b.Key) {
            return 1;
        }
        if (a.Key < b.Key) {
            return -1;
        }
        return 0;
    });
}


describe('Multi-Object Versioning Delete Success', function success() {
    this.timeout(360000);

    withV4(sigCfg => {
        const bucketUtil = new BucketUtility('default', sigCfg);
        const s3 = bucketUtil.s3;
        let objectsRes;

        beforeEach(done => {
            async.waterfall([
                next => s3.createBucket({ Bucket: bucketName },
                    err => next(err)),
                next => s3.putBucketVersioning({
                    Bucket: bucketName,
                    VersioningConfiguration: {
                        Status: 'Enabled',
                    },
                }, err => next(err)),
                next => {
                    const objects = [];
                    for (let i = 1; i < 1001; i++) {
                        objects.push(`${key}${i}`);
                    }
                    async.mapLimit(objects, 20, (key, next) => {
                        s3.putObject({
                            Bucket: bucketName,
                            Key: key,
                            Body: 'somebody',
                        }, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            // eslint-disable-next-line no-param-reassign
                            res.Key = key;
                            return next(null, res);
                        });
                    }, (err, results) => {
                        if (err) {
                            return next(err);
                        }
                        objectsRes = results;
                        return next();
                    });
                },
            ], err => done(err));
        });

        afterEach(done => {
            removeAllVersions({ Bucket: bucketName }, err => {
                if (err) {
                    return done(err);
                }
                return s3.deleteBucket({ Bucket: bucketName }, err => {
                    assert.strictEqual(err, null,
                        `Error deleting bucket: ${err}`);
                    return done();
                });
            });
        });

        it('should batch delete 1000 objects quietly', () => {
            const objects = objectsRes.slice(0, 1000).map(obj =>
                ({ Key: obj.Key, VersionId: obj.VersionId }));
            return s3.deleteObjects({
                Bucket: bucketName,
                Delete: {
                    Objects: objects,
                    Quiet: true,
                },
            }).promise().then(res => {
                assert.strictEqual(res.Deleted.length, 0);
                assert.strictEqual(res.Errors.length, 0);
            }).catch(err => {
                checkNoError(err);
            });
        });

        it('should batch delete 1000 objects', () => {
            const objects = objectsRes.slice(0, 1000).map(obj =>
                ({ Key: obj.Key, VersionId: obj.VersionId }));
            return s3.deleteObjects({
                Bucket: bucketName,
                Delete: {
                    Objects: objects,
                    Quiet: false,
                },
            }).promise().then(res => {
                assert.strictEqual(res.Deleted.length, 1000);
                // order of returned objects not sorted
                assert.deepStrictEqual(sortList(res.Deleted),
                    sortList(objects));
                assert.strictEqual(res.Errors.length, 0);
            }).catch(err => {
                checkNoError(err);
            });
        });

        it('should return NoSuchVersion in errors if one versionId is ' +
        'invalid', () => {
            const objects = objectsRes.slice(0, 1000).map(obj =>
                ({ Key: obj.Key, VersionId: obj.VersionId }));
            objects[0].VersionId = 'invalid-version-id';
            return s3.deleteObjects({
                Bucket: bucketName,
                Delete: {
                    Objects: objects,
                },
            }).promise().then(res => {
                assert.strictEqual(res.Deleted.length, 999);
                assert.strictEqual(res.Errors.length, 1);
                assert.strictEqual(res.Errors[0].Code, 'NoSuchVersion');
            })
            .catch(err => {
                checkNoError(err);
            });
        });

        it('should not send back any error if a versionId does not exist ' +
        'and should not create a new delete marker', () => {
            const objects = objectsRes.slice(0, 1000).map(obj =>
                ({ Key: obj.Key, VersionId: obj.VersionId }));
            objects[0].VersionId = nonExistingId;
            return s3.deleteObjects({
                Bucket: bucketName,
                Delete: {
                    Objects: objects,
                },
            }).promise().then(res => {
                assert.strictEqual(res.Deleted.length, 1000);
                assert.strictEqual(res.Errors.length, 0);
                const foundVersionId = res.Deleted.find(entry =>
                    entry.VersionId === nonExistingId);
                assert(foundVersionId);
                assert.strictEqual(foundVersionId.DeleteMarker, undefined);
            })
            .catch(err => {
                checkNoError(err);
            });
        });

        it('should not crash when deleting a null versionId that does not exist', () => {
            const objects = [{ Key: objectsRes[0].Key, VersionId: 'null' }];
            return s3.deleteObjects({
                Bucket: bucketName,
                Delete: {
                    Objects: objects,
                },
            }).promise().then(res => {
                assert.deepStrictEqual(res.Deleted, [{ Key: objectsRes[0].Key, VersionId: 'null' }]);
                assert.strictEqual(res.Errors.length, 0);
            })
            .catch(err => {
                checkNoError(err);
            });
        });
    });
});

describe('Multi-Object Versioning Delete - deleting delete marker',
() => {
    withV4(sigCfg => {
        const bucketUtil = new BucketUtility('default', sigCfg);
        const s3 = bucketUtil.s3;

        beforeEach(done => {
            async.waterfall([
                next => s3.createBucket({ Bucket: bucketName },
                    err => next(err)),
                next => s3.putBucketVersioning({
                    Bucket: bucketName,
                    VersioningConfiguration: {
                        Status: 'Enabled',
                    },
                }, err => next(err)),
            ], done);
        });
        afterEach(done => {
            removeAllVersions({ Bucket: bucketName }, err => {
                if (err) {
                    return done(err);
                }
                return s3.deleteBucket({ Bucket: bucketName }, err => {
                    assert.strictEqual(err, null,
                        `Error deleting bucket: ${err}`);
                    return done();
                });
            });
        });

        it('should send back VersionId and DeleteMarkerVersionId both equal ' +
        'to deleteVersionId', done => {
            async.waterfall([
                next => s3.putObject({ Bucket: bucketName, Key: key },
                  err => next(err)),
                next => s3.deleteObject({ Bucket: bucketName,
                    Key: key }, (err, data) => {
                    const deleteVersionId = data.VersionId;
                    next(err, deleteVersionId);
                }),
                (deleteVersionId, next) => s3.deleteObjects({ Bucket:
                  bucketName,
                    Delete: {
                        Objects: [
                            {
                                Key: key,
                                VersionId: deleteVersionId,
                            },
                        ],
                    } }, (err, data) => {
                    assert.strictEqual(data.Deleted[0].DeleteMarker, true);
                    assert.strictEqual(data.Deleted[0].VersionId,
                      deleteVersionId);
                    assert.strictEqual(data.Deleted[0].DeleteMarkerVersionId,
                      deleteVersionId);
                    next(err);
                }),
            ], err => done(err));
        });

        it('should send back a DeleteMarkerVersionId matching the versionId ' +
      'stored for the object if trying to delete an object that does not exist',
        done => {
            s3.deleteObjects({ Bucket: bucketName,
                Delete: {
                    Objects: [
                        {
                            Key: key,
                        },
                    ],
                } }, (err, data) => {
                if (err) {
                    return done(err);
                }
                const versionIdFromDeleteObjects =
                  data.Deleted[0].DeleteMarkerVersionId;
                assert.strictEqual(data.Deleted[0].DeleteMarker, true);
                return s3.listObjectVersions({ Bucket: bucketName },
                  (err, data) => {
                      if (err) {
                          return done(err);
                      }
                      const versionIdFromListObjectVersions =
                        data.DeleteMarkers[0].VersionId;
                      assert.strictEqual(versionIdFromDeleteObjects,
                        versionIdFromListObjectVersions);
                      return done();
                  });
            });
        });

        it('should send back a DeleteMarkerVersionId matching the versionId ' +
        'stored for the object if object exists but no version was specified',
        done => {
            async.waterfall([
                next => s3.putObject({ Bucket: bucketName, Key: key },
                  (err, data) => {
                      const versionId = data.VersionId;
                      next(err, versionId);
                  }),
                (versionId, next) => s3.deleteObjects({ Bucket:
                  bucketName,
                    Delete: {
                        Objects: [
                            {
                                Key: key,
                            },
                        ],
                    } }, (err, data) => {
                    if (err) {
                        return next(err);
                    }
                    assert.strictEqual(data.Deleted[0].DeleteMarker, true);
                    const deleteVersionId = data.Deleted[0].
                    DeleteMarkerVersionId;
                    assert.notEqual(deleteVersionId, versionId);
                    return next(err, deleteVersionId, versionId);
                }),
                (deleteVersionId, versionId, next) => s3.listObjectVersions(
                { Bucket: bucketName }, (err, data) => {
                    if (err) {
                        return next(err);
                    }
                    assert.strictEqual(deleteVersionId,
                      data.DeleteMarkers[0].VersionId);
                    assert.strictEqual(versionId,
                      data.Versions[0].VersionId);
                    return next();
                }),
            ], err => done(err));
        });
    });
});

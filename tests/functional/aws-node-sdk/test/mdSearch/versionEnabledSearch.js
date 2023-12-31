const s3Client = require('./utils/s3SDK');
const { runAndCheckSearch, removeAllVersions, runIfMongo } =
    require('./utils/helpers');

const userMetadata = { food: 'pizza' };
const updatedMetadata = { food: 'pineapple' };
const masterKey = 'master';

runIfMongo('Search in version enabled bucket', () => {
    const bucketName = `versionedbucket${Date.now()}`;
    const VersioningConfiguration = {
        MFADelete: 'Disabled',
        Status: 'Enabled',
    };
    before(done => {
        s3Client.createBucket({ Bucket: bucketName }, err => {
            if (err) {
                return done(err);
            }
            return s3Client.putBucketVersioning({ Bucket: bucketName,
                VersioningConfiguration }, err => {
                if (err) {
                    return done(err);
                }
                return s3Client.putObject({ Bucket: bucketName,
                    Key: masterKey, Metadata: userMetadata }, done);
            });
        });
    });

    after(done => {
        removeAllVersions(s3Client, bucketName,
            err => {
                if (err) {
                    return done(err);
                }
                return s3Client.deleteBucket({ Bucket: bucketName }, done);
            });
    });

    it('should list just master object with searched for metadata by default', done => {
        const encodedSearch =
        encodeURIComponent(`x-amz-meta-food="${userMetadata.food}"`);
        return runAndCheckSearch(s3Client, bucketName,
            encodedSearch, false, masterKey, done);
    });

    describe('New version overwrite', () => {
        before(done => {
            s3Client.putObject({ Bucket: bucketName,
                Key: masterKey, Metadata: updatedMetadata }, done);
        });

        it('should list just master object with updated metadata by default', done => {
            const encodedSearch =
            encodeURIComponent(`x-amz-meta-food="${updatedMetadata.food}"`);
            return runAndCheckSearch(s3Client, bucketName,
                encodedSearch, false, masterKey, done);
        });

        it('should list all object versions that met search query while specifying versions param', done => {
            const encodedSearch =
                encodeURIComponent('x-amz-meta-food LIKE "pi.*"');
            return runAndCheckSearch(s3Client, bucketName,
                encodedSearch, true, [masterKey, masterKey], done);
        });
    });
});

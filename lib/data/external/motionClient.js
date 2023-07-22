import arsenal from 'arsenal';

export class MotionClient {
  constructor(config) {
    this.motionEndpoint = config.motionEndpoint;
    this.client = new arsenal.network.rest.RESTClient({
      host: config.host,
      port: config.port,
      isPassthrough: true,
    })
  }

  createMotionKey(bucketName, objectKey) {
    return `${bucketName}/${objectKey}`;
  }

  put(stream, size, keyContext, reqUids, callback) {
    const motionKey = this.createMotionKey(keyContext.bucketName, keyContext.objectKey);
  }

  get(keyContext, reqUids, callback) {
    const motionKey = this.createMotionKey(keyContext.bucketName, keyContext.objectKey);
  }
}
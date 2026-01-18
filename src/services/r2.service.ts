import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export class R2Service {
  static async uploadFile(
    key: string,
    body: Buffer | Readable,
    contentType: string
  ): Promise<{ key: string; url: string }> {
    console.log(`[R2 SERVICE] Uploading file: ${key}`);

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await s3Client.send(command);

    const url = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;

    console.log(`[R2 SERVICE] Upload complete: ${key}`);

    return { key, url };
  }

  static async uploadFromStream(
    key: string,
    stream: Readable,
    contentType: string
  ): Promise<{ key: string; url: string }> {
    console.log(`[R2 SERVICE] Uploading from stream: ${key}`);

    // Use multipart upload for streams (handles unknown content length)
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: stream,
        ContentType: contentType,
      },
      queueSize: 4, // concurrent part uploads
      partSize: 1024 * 1024 * 5, // 5MB parts
      leavePartsOnError: false,
    });

    upload.on("httpUploadProgress", (progress) => {
      console.log(`[R2 SERVICE] Upload progress: ${progress.loaded} bytes`);
    });

    await upload.done();

    const url = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;

    console.log(`[R2 SERVICE] Stream upload complete: ${key}`);

    return { key, url };
  }

  static async deleteFile(key: string): Promise<void> {
    console.log(`[R2 SERVICE] Deleting file: ${key}`);

    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`[R2 SERVICE] Delete complete: ${key}`);
  }

  static async getSignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  static async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  static generateVideoKey(projectId: string, filename: string): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    return `videos/${projectId}/${timestamp}-${sanitizedFilename}`;
  }
}

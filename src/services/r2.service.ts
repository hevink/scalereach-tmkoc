import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  type CompletedPart,
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

  // ==========================================
  // MULTIPART UPLOAD METHODS
  // ==========================================

  static async createMultipartUpload(
    key: string,
    contentType: string
  ): Promise<string> {
    console.log(`[R2 SERVICE] Creating multipart upload: ${key}`);

    const command = new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const response = await s3Client.send(command);

    if (!response.UploadId) {
      throw new Error("Failed to create multipart upload");
    }

    console.log(`[R2 SERVICE] Multipart upload created: ${response.UploadId}`);
    return response.UploadId;
  }

  static async getPresignedUrlForPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  static async getPresignedUrlsForParts(
    key: string,
    uploadId: string,
    totalParts: number,
    expiresIn: number = 3600
  ): Promise<{ partNumber: number; url: string }[]> {
    console.log(`[R2 SERVICE] Generating ${totalParts} presigned URLs for upload: ${uploadId}`);

    const urls = await Promise.all(
      Array.from({ length: totalParts }, async (_, i) => {
        const partNumber = i + 1;
        const url = await this.getPresignedUrlForPart(key, uploadId, partNumber, expiresIn);
        return { partNumber, url };
      })
    );

    return urls;
  }

  static async listUploadedParts(
    key: string,
    uploadId: string
  ): Promise<CompletedPart[]> {
    console.log(`[R2 SERVICE] Listing parts for upload: ${uploadId}`);

    const parts: CompletedPart[] = [];
    let partNumberMarker: string | undefined;

    // Paginate through all parts
    while (true) {
      const command = new ListPartsCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: partNumberMarker,
      });

      const response = await s3Client.send(command);

      if (response.Parts) {
        for (const part of response.Parts) {
          if (part.PartNumber && part.ETag) {
            parts.push({
              PartNumber: part.PartNumber,
              ETag: part.ETag,
            });
          }
        }
      }

      if (!response.IsTruncated) {
        break;
      }

      partNumberMarker = response.NextPartNumberMarker?.toString();
    }

    console.log(`[R2 SERVICE] Found ${parts.length} uploaded parts`);
    return parts;
  }

  static async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<{ key: string; url: string }> {
    console.log(`[R2 SERVICE] Completing multipart upload: ${uploadId} with ${parts.length} parts`);

    // Sort parts by part number
    const sortedParts = [...parts].sort((a, b) => (a.PartNumber || 0) - (b.PartNumber || 0));

    const command = new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    await s3Client.send(command);

    const url = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;

    console.log(`[R2 SERVICE] Multipart upload complete: ${key}`);
    return { key, url };
  }

  static async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    console.log(`[R2 SERVICE] Aborting multipart upload: ${uploadId}`);

    const command = new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    await s3Client.send(command);
    console.log(`[R2 SERVICE] Multipart upload aborted: ${uploadId}`);
  }

  static getPublicUrl(key: string): string {
    return R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;
  }
}

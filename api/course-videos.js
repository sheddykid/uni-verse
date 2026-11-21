import {
  S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand,
  CompleteMultipartUploadCommand, AbortMultipartUploadCommand, GetObjectCommand,
  DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = "https://xcybjuwearndoljqkzmy.supabase.co";
const SUPABASE_KEY = "sb_publishable_8egrnqtwHtrfzvtPcldiQw_y1Wqhh9w";
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
const PART_SIZE = 32 * 1024 * 1024;
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
let s3Client;

function respond(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.json(body);
}
function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function getS3() {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    fail("Cloud video storage is not configured. Contact the administrator.", 503);
  }
  if (!s3Client) s3Client = new S3Client({
    region: "auto", endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
  });
  return { client: s3Client, bucket: R2_BUCKET_NAME };
}
async function supabaseGet(path, token) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) fail("Your account or course access could not be verified.", response.status === 401 ? 401 : 403);
  return response.json();
}
async function authenticate(req) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) fail("Sign in to access course videos.", 401);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) fail("Your session has expired. Sign in again.", 401);
  const user = await response.json();
  const profiles = await supabaseGet(
    `profiles?select=id,role&id=eq.${encodeURIComponent(user.id)}&limit=1`, token
  );
  const profile = profiles[0];
  if (!profile || profile.id !== user.id) fail("Your account profile could not be verified.", 403);
  return { token, user, profile };
}
function requireAdmin(profile) {
  if (profile.role !== "admin") fail("Only administrators can manage uploaded videos.", 403);
}
function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
function validKey(key, courseId) {
  return typeof key === "string" && validUuid(courseId) &&
    key.startsWith(`r2/${courseId}/`) && key.length <= 1024 && !key.includes("..");
}
async function validateCourse(courseId, token) {
  if (!validUuid(courseId)) fail("Choose a valid course.", 400);
  const courses = await supabaseGet(
    `courses?select=id&id=eq.${encodeURIComponent(courseId)}&is_active=eq.true&limit=1`, token
  );
  if (!courses.length) fail("The selected course is unavailable.", 403);
}
async function listAllParts(client, bucket, key, uploadId) {
  const parts = [];
  let marker;
  do {
    const result = await client.send(new ListPartsCommand({
      Bucket: bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker
    }));
    for (const part of result.Parts || []) {
      parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size });
    }
    if (!result.IsTruncated) break;
    marker = result.NextPartNumberMarker;
  } while (marker);
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Method not allowed." });
  }
  try {
    const context = await authenticate(req);
    const body = req.body || {};
    const action = String(body.action || "");
    const { client, bucket } = getS3();

    if (action === "initiate") {
      requireAdmin(context.profile);
      const courseId = String(body.courseId || "");
      const fileName = String(body.fileName || "");
      const contentType = String(body.contentType || "");
      const size = Number(body.size);
      if (!fileName || fileName.length > 255 || !VIDEO_TYPES.has(contentType) ||
          !Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_SIZE) {
        fail("Choose an MP4, WEBM or MOV video no larger than 5 GiB.", 400);
      }
      await validateCourse(courseId, context.token);
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "video";
      const key = `r2/${courseId}/${randomUUID()}-${safeName}`;
      const created = await client.send(new CreateMultipartUploadCommand({
        Bucket: bucket, Key: key, ContentType: contentType,
        CacheControl: "private, max-age=3600"
      }));
      if (!created.UploadId) fail("R2 did not return a multipart upload ID.", 502);
      return respond(res, 200, { key, uploadId: created.UploadId, partSize: PART_SIZE });
    }

    if (["sign-part", "list-parts", "complete", "abort"].includes(action)) {
      requireAdmin(context.profile);
      const courseId = String(body.courseId || "");
      const key = String(body.key || "");
      const uploadId = String(body.uploadId || "");
      if (!validKey(key, courseId) || !uploadId || uploadId.length > 2048) {
        fail("The resumable upload details are invalid.", 400);
      }
      if (action === "sign-part") {
        const partNumber = Number(body.partNumber);
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
          fail("Invalid video upload part.", 400);
        }
        const url = await getSignedUrl(client, new UploadPartCommand({
          Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber
        }), { expiresIn: 900 });
        return respond(res, 200, { url });
      }
      if (action === "list-parts") {
        return respond(res, 200, { parts: await listAllParts(client, bucket, key, uploadId) });
      }
      if (action === "abort") {
        await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
        return respond(res, 200, { aborted: true });
      }
      const supplied = Array.isArray(body.parts) ? body.parts : [];
      if (!supplied.length || supplied.length > 10000) fail("The upload is missing its completed parts.", 400);
      const parts = supplied.map(part => ({
        PartNumber: Number(part.partNumber), ETag: String(part.etag || "")
      })).sort((a, b) => a.PartNumber - b.PartNumber);
      if (parts.some((part, index) => !Number.isInteger(part.PartNumber) ||
          part.PartNumber !== index + 1 || !/^".+"$/.test(part.ETag))) {
        fail("The completed video parts are invalid.", 400);
      }
      await client.send(new CompleteMultipartUploadCommand({
        Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts }
      }));
      return respond(res, 200, { key });
    }

    if (action === "playback") {
      const videoId = String(body.videoId || "");
      if (!validUuid(videoId)) fail("Choose a valid video.", 400);
      const videos = await supabaseGet(
        `course_videos?select=id,course_id,video_path,is_active,mime_type&id=eq.${encodeURIComponent(videoId)}&limit=1`,
        context.token
      );
      const video = videos[0];
      if (!video || (!video.is_active && context.profile.role !== "admin")) {
        fail("This video is unavailable or you do not have access.", 403);
      }
      if (validKey(video.video_path, video.course_id)) {
        // Verify the stored object and byte-range support before handing playback to the browser.
        let head;
        let probe;
        let probeBytes;
        try {
          head = await client.send(new HeadObjectCommand({
            Bucket: bucket, Key: video.video_path
          }));
          probe = await client.send(new GetObjectCommand({
            Bucket: bucket, Key: video.video_path, Range: "bytes=0-0"
          }));
          probeBytes = probe.Body ? await probe.Body.transformToByteArray() : new Uint8Array();
        } catch (error) {
          console.error("[course-videos] R2 playback probe failed:", error?.name || "Error", error?.message || "");
          fail("R2 could not verify the stored video or serve a byte-range request. The uploaded object or its storage permissions need investigation.", 502);
        }
        const rangeContentRange = probe.ContentRange || null;
        const rangeSupported = probe.$metadata?.httpStatusCode === 206 &&
          probeBytes.length === 1 && /^bytes 0-0\//.test(rangeContentRange || "");
        if (!rangeSupported) {
          fail("The R2 video object failed its HTTP byte-range check. The stored upload may be incomplete or incorrectly assembled.", 502);
        }
        const url = await getSignedUrl(client, new GetObjectCommand({
          Bucket: bucket, Key: video.video_path,
          ResponseContentType: video.mime_type, ResponseContentDisposition: "inline"
        }), { expiresIn: 3600 });
        return respond(res, 200, {
          url, expiresIn: 3600,
          diagnostics: {
            objectExists: true,
            contentLength: head.ContentLength ?? null,
            contentType: head.ContentType ?? null,
            etag: head.ETag ?? null,
            rangeSupported,
            rangeContentRange
          }
        });
      }
      if (typeof video.video_path !== "string" || !video.video_path.startsWith(video.course_id + "/") || video.video_path.includes("..")) {
        fail("This video has an invalid storage path.", 409);
      }
      const legacy = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/course-videos/${video.video_path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${context.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!legacy.ok) fail("The existing video file could not be opened.", 502);
      const signed = await legacy.json();
      const signedPath = signed.signedURL || signed.signedUrl;
      if (!signedPath) fail("The existing video file did not return a playback link.", 502);
      const url = (signedPath.startsWith("https://") || signedPath.startsWith("http://")) ? signedPath
        : signedPath.startsWith("/storage/v1/") ? SUPABASE_URL + signedPath
          : SUPABASE_URL + "/storage/v1" + (signedPath.startsWith("/") ? signedPath : "/" + signedPath);
      return respond(res, 200, { url, expiresIn: 3600 });
    }

    if (action === "delete-object") {
      requireAdmin(context.profile);
      const courseId = String(body.courseId || "");
      const key = String(body.key || "");
      if (!validUuid(courseId)) fail("The course identifier is invalid.", 400);
      if (validKey(key, courseId)) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return respond(res, 200, { deleted: true });
      }
      if (!key.startsWith(courseId + "/") || key.includes("..")) fail("The video file path is invalid.", 400);
      const removed = await fetch(`${SUPABASE_URL}/storage/v1/object/course-videos`, {
        method: "DELETE",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${context.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [key] })
      });
      if (!removed.ok) fail("The previous video file could not be removed from Supabase Storage.", 502);
      return respond(res, 200, { deleted: true });
    }

    if (action === "delete-objects") {
      requireAdmin(context.profile);
      const courseId = String(body.courseId || "");
      const keys = Array.isArray(body.keys) ? [...new Set(body.keys.map(String))] : [];
      if (!validUuid(courseId) || keys.length > 1000 || keys.some(key =>
        !(validKey(key, courseId) || (key.startsWith(courseId + "/") && !key.includes("..")))
      )) fail("One or more video file paths are invalid.", 400);
      const r2Keys = keys.filter(key => validKey(key, courseId));
      const legacyKeys = keys.filter(key => !validKey(key, courseId));
      if (r2Keys.length) {
        const result = await client.send(new DeleteObjectsCommand({
          Bucket: bucket, Delete: { Objects: r2Keys.map(Key => ({ Key })), Quiet: false }
        }));
        if (result.Errors?.length) fail("Some video files could not be removed from R2.", 502);
      }
      if (legacyKeys.length) {
        const removed = await fetch(`${SUPABASE_URL}/storage/v1/object/course-videos`, {
          method: "DELETE",
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${context.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: legacyKeys })
        });
        if (!removed.ok) fail("Some older video files could not be removed from Supabase Storage.", 502);
      }
      return respond(res, 200, { deleted: keys.length });
    }

    return respond(res, 400, { error: "Unknown video storage action." });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error("[course-videos] request failed:", error?.message || String(error));
    return respond(res, status, {
      error: error?.statusCode ? error.message : "The video storage request failed. Please try again."
    });
  }
}
export const config = { maxDuration: 60 };

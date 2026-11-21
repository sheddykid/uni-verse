import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SUPABASE_URL = "https://xcybjuwearndoljqkzmy.supabase.co";
const SUPABASE_KEY = "sb_publishable_8egrnqtwHtrfzvtPcldiQw_y1Wqhh9";
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
const PART_SIZE = 32 * 1024 * 1024;
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

let s3Client;
function getS3() {
  if (s3Client) return s3Client;
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    const error = new Error("Cloud video storage is not configured. Contact the administrator.");
    error.statusCode = 503;
    throw error;
  }
  s3Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
  });
  return s3Client;
}
function bucket() { return process.env.R2_BUCKET_NAME; }
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
async function supabaseGet(path, token) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) {
    const error = new Error("Your account or course access could not be verified.");
    error.statusCode = response.status === 401 ? 401 : 403;
    throw error;
  }
  return response.json();
}
async function authorize(req) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) fail("Sign in to access course videos.", 401);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) fail("Your session has expired. Sign in again.", 401);
  const user = await userResponse.json();
  const profiles = await supabaseGet(`profiles?select=id,role,department_id&id=eq.${encodeURIComponent(user.id)}&limit=1`, token);
  const profile = profiles[0];
  if (!profile || profile.id !== user.id) fail("Your account profile could not be verified.", 403);
  return { token, user, profile };
}
function requireAdmin(context) {
  if (context.profile.role !== "admin") fail("Only administrators can manage uploaded videos.", 403);
}
function validateKey(key, courseId) {
  if (typeof key !== "string" || !/^[0-9a-f-]{36}\\//i.test(key) || !key.startsWith(courseId + "/") || key.length > 1024) {
    fail("The video storage key is invalid.", 400);
  }
}
async function validateCourse(courseId, context) {
  if (typeof courseId !== "string" || !/^[0-9a-f-]{36}$/i.test(courseId)) fail("Choose a valid course.", 400);
  const rows = await supabaseGet(`courses?select=id,is_active&id=eq.${encodeURIComponent(courseId)}&is_active=eq.true&limit=1`, context.token);
  if (!rows.length) fail("The selected course is unavailable.", 403);
}
function safeFileName(value) {
  return String(value || "video").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "video";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Method not allowed." });
  }
  try {
    const context = await authorize(req);
    const body = req.body || {};
    const action = String(body.action || "");
    const s3 = getS3();

    if (action === "playback") {
      const videoId = String(body.videoId || "");
      if (!/^[0-9a-f-]{36}$/i.test(videoId)) fail("Choose a valid video.", 400);
      const videos = await supabaseGet(
        `course_videos?select=id,course_id,video_path,mime_type,is_active&id=eq.${encodeURIComponent(videoId)}&limit=1`,
        context.token
      );
      const video = videos[0];
      if (!video || (!video.is_active && context.profile.role !== "admin")) fail("This video is unavailable or you do not have access.", 403);
      validateKey(video.video_path, video.course_id);
      const url = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: bucket(), Key: video.video_path, ResponseContentType: video.mime_type, ResponseContentDisposition: "inline"
      }), { expiresIn: 600 });
      return respond(res, 200, { url, expiresIn: 600 });
    }

    requireAdmin(context);

    if (action === "initiate") {
      const courseId = String(body.courseId || "");
      const fileName = safeFileName(body.fileName);
      const contentType = String(body.contentType || "");
      const size = Number(body.size);
      await validateCourse(courseId, context);
      if (!VIDEO_TYPES.has(contentType)) fail("Choose an MP4, WEBM or MOV video.", 400);
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_SIZE) fail("Videos must be larger than 0 bytes and no more than 5 GiB.", 413);
      const key = `${courseId}/${crypto.randomUUID()}-${fileName}`;
      const created = await s3.send(new CreateMultipartUploadCommand({
        Bucket: bucket(), Key: key, ContentType: contentType, CacheControl: "private, max-age=3600"
      }));
      if (!created.UploadId) fail("Could not start the video upload. Try again.", 502);
      return respond(res, 200, { key, uploadId: created.UploadId, partSize: PART_SIZE, partCount: Math.ceil(size / PART_SIZE) });
    }

    if (action === "sign-part" || action === "list-parts" || action === "complete" || action === "abort") {
      const courseId = String(body.courseId || "");
      const key = String(body.key || "");
      const uploadId = String(body.uploadId || "");
      validateKey(key, courseId);
      if (!uploadId || uploadId.length > 2048) fail("The resumable upload session is invalid.", 400);

      if (action === "sign-part") {
        const partNumber = Number(body.partNumber);
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) fail("Invalid video upload part.", 400);
        const url = await getSignedUrl(s3, new UploadPartCommand({
          Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber
        }), { expiresIn: 900 });
        return respond(res, 200, { url });
      }
      if (action === "list-parts") {
        const result = await s3.send(new ListPartsCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
        return respond(res, 200, { parts: (result.Parts || []).map(part => ({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size })) });
      }
      if (action === "complete") {
        const parts = Array.isArray(body.parts) ? body.parts : [];
        if (!parts.length || parts.length > 10000 || parts.some(part =>
          !Number.isInteger(Number(part.partNumber)) || Number(part.partNumber) < 1 || Number(part.partNumber) > 10000 ||
          typeof part.etag !== "string" || !/^".+"$/.test(part.etag)
        )) fail("The uploaded video parts are incomplete or invalid.", 400);
        const sorted = parts.map(part => ({ PartNumber: Number(part.partNumber), ETag: part.etag }))
          .sort((a, b) => a.PartNumber - b.PartNumber);
        if (new Set(sorted.map(part => part.PartNumber)).size !== sorted.length) fail("Duplicate upload parts were supplied.", 400);
        await s3.send(new CompleteMultipartUploadCommand({
          Bucket: bucket(), Key: key, UploadId: uploadId, MultipartUpload: { Parts: sorted }
        }));
        return respond(res, 200, { key });
      }
      await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
      return respond(res, 200, { aborted: true });
    }

    if (action === "delete-object") {
      const courseId = String(body.courseId || "");
      const key = String(body.key || "");
      validateKey(key, courseId);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
      return respond(res, 200, { deleted: true });
    }
    if (action === "delete-objects") {
      const courseId = String(body.courseId || "");
      const keys = Array.isArray(body.keys) ? [...new Set(body.keys)] : [];
      if (keys.length > 1000) fail("Too many video files were supplied for cleanup.", 400);
      keys.forEach(key => validateKey(key, courseId));
      if (keys.length) {
        const result = await s3.send(new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: keys.map(Key => ({ Key })), Quiet: false }
        }));
        if (result.Errors?.length) fail("Some video files could not be deleted from cloud storage.", 502);
      }
      return respond(res, 200, { deleted: keys.length });
    }

    return respond(res, 400, { error: "Unknown video storage action." });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error("[course-videos] request failed:", error?.message || String(error));
    return respond(res, status, { error: error?.message || "The video storage request failed." });
  }
}
export const config = { maxDuration: 60 };

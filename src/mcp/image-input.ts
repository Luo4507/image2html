import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

/** 上传图片大小硬限制：4MB（可用 IMAGE2HTML_MAX_IMAGE_MB 调整） */
export const MAX_IMAGE_BYTES = Number(process.env.IMAGE2HTML_MAX_IMAGE_MB || 4) * 1024 * 1024;

function assertImageSize(size: number, source: string): void {
  if (size > MAX_IMAGE_BYTES) {
    const limitMb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
    throw new ImageInputError(
      'IMAGE_TOO_LARGE',
      `图片大小不能超过 ${limitMb}MB（当前 ${(size / 1024 / 1024).toFixed(2)}MB，来源：${source}）。请先压缩图片再上传`,
    );
  }
}

export interface ResolvedImageInput {
  data: Buffer;
  filename: string;
  type: 'image/png' | 'image/jpeg' | 'image/webp';
}

export class ImageInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ImageInputError';
  }
}

export function imageMimeType(path: string): ResolvedImageInput['type'] | undefined {
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  }[extname(path).toLowerCase()] as ResolvedImageInput['type'] | undefined;
}

function safeFilename(value: unknown, fallback: string): string {
  const filename = String(value || fallback).replace(/^.*[\\/]/, '');
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : fallback;
}

function decodeBase64Image(value: string, filename: unknown): ResolvedImageInput {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]*)$/i.exec(value);
  const type = (match?.[1]?.toLowerCase() || imageMimeType(String(filename || ''))) as ResolvedImageInput['type'] | undefined;
  if (!type) {
    throw new ImageInputError(
      'INVALID_IMAGE_TYPE',
      '纯 Base64 图片需要有效的 image_filename（PNG、JPG、JPEG、WebP），或使用 data:image/...;base64,... 格式',
    );
  }

  const encoded = (match ? match[2] : value).replace(/\s/g, '');
  if (!encoded || !/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new ImageInputError('INVALID_IMAGE_BASE64', 'image_base64 不是有效的 Base64 图片数据');
  }
  const data = Buffer.from(encoded, 'base64');
  if (data.length === 0) {
    throw new ImageInputError('INVALID_IMAGE_BASE64', 'image_base64 图片内容为空');
  }
  assertImageSize(data.length, 'base64 上传');

  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return {
    data,
    filename: safeFilename(filename, `design.${extension}`),
    type,
  };
}

/** Resolve either a locally visible path or an image supplied by a remote MCP caller. */
export async function resolveImageInput(args: any = {}): Promise<ResolvedImageInput> {
  const imagePath = args.image_path;
  const imageBase64 = args.image_base64;
  if (imagePath && imageBase64) {
    throw new ImageInputError('INVALID_IMAGE_INPUT', 'image_path 和 image_base64 只能提供一个');
  }
  if (imageBase64 !== undefined) {
    if (typeof imageBase64 !== 'string') {
      throw new ImageInputError('INVALID_IMAGE_BASE64', 'image_base64 必须是字符串');
    }
    return decodeBase64Image(imageBase64, args.image_filename);
  }
  if (!imagePath || !existsSync(imagePath)) {
    throw new ImageInputError('FILE_NOT_FOUND', `文件不存在: ${String(imagePath)}`);
  }
  assertImageSize(statSync(String(imagePath)).size, String(imagePath));

  const type = imageMimeType(String(imagePath));
  if (!type) {
    throw new ImageInputError('INVALID_IMAGE_TYPE', '仅支持 PNG、JPG、JPEG、WebP 图片');
  }
  return {
    data: await readFile(imagePath),
    filename: basename(String(imagePath)),
    type,
  };
}

import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const storage = diskStorage({
  destination: process.env.UPLOAD_DIR || 'uploads',
  filename: (_req, file, cb) => {
    const name = randomBytes(12).toString('hex') + extname(file.originalname);
    cb(null, name);
  },
});

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post('image')
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 10 * 1024 * 1024 } }))
  image(@UploadedFile() file: Express.Multer.File) {
    return { url: `/uploads/${file.filename}`, filename: file.filename };
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 100 * 1024 * 1024 } }))
  video(@UploadedFile() file: Express.Multer.File) {
    return { url: `/uploads/${file.filename}`, filename: file.filename };
  }
}

import {
  BadRequestException,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Body } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { SttService } from './stt.service';

class SttBodyDto {
  @IsOptional()
  @IsString()
  lang?: string;
}

@Controller('stt')
export class SttController {
  constructor(private readonly stt: SttService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async transcribe(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: SttBodyDto,
  ) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('empty audio upload');
    }

    const lang =
      body.lang && ['ar', 'en'].includes(body.lang) ? body.lang : undefined;
    try {
      return await this.stt.transcribe(
        file.buffer,
        file.originalname || 'clip.webm',
        lang,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        `STT failed: ${err instanceof Error ? err.message : String(err)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

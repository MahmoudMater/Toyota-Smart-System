import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { TtsService } from './tts.service';

class TtsRequestDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  lang?: 'ar' | 'en';
}

@Controller('tts')
export class TtsController {
  constructor(private readonly tts: TtsService) {}

  @Post()
  @HttpCode(200)
  async synthesize(
    @Body() dto: TtsRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tts.synthesize(dto.text, dto.lang ?? 'en');
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.audio.length);
    res.status(HttpStatus.OK).end(result.audio);
  }
}

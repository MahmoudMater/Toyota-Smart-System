import { Module } from '@nestjs/common';
import { LprController } from './lpr.controller';
import { LprService } from './lpr.service';

@Module({
  controllers: [LprController],
  providers: [LprService],
  exports: [LprService],
})
export class LprModule {}

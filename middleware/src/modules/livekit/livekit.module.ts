import { Module } from '@nestjs/common';
import { AvatarController } from './avatar.controller';
import { LiveKitService } from './livekit.service';

@Module({
  controllers: [AvatarController],
  providers: [LiveKitService],
  exports: [LiveKitService],
})
export class LiveKitModule {}

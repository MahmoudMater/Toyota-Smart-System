import { Body, Controller, Get, Post } from '@nestjs/common';
import { DemoService } from './demo.service';
import { SapProfileDto } from './dto/sap-profile.dto';

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('config')
  config() {
    return this.demo.getConfig();
  }

  @Post('sap-profile')
  saveSapProfile(@Body() dto: SapProfileDto) {
    return this.demo.saveSapProfile(dto);
  }

  @Post('reset')
  reset() {
    return this.demo.reset();
  }
}

import { IsOptional, IsString, MinLength } from 'class-validator';

export class PlateReadDto {
  @IsString()
  @MinLength(1)
  gateId!: string;

  @IsString()
  @MinLength(1)
  plateNumber!: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  image?: string;
}

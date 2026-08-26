import { IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitCheckinDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsString()
  @MinLength(1)
  gateId!: string;

  @IsString()
  @MinLength(1)
  plateNumber!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  phone!: string;
}

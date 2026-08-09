import { IsString, MinLength } from 'class-validator';

export class SapProfileDto {
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

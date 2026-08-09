import { IsOptional, IsString, MinLength } from 'class-validator';

export class SlotFreedDto {
  @IsString()
  @MinLength(1)
  slotId!: string;

  @IsOptional()
  @IsString()
  freedAt?: string;
}

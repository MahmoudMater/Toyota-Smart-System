import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class SlotFreedDto {
  @IsString()
  @MinLength(1)
  slotId!: string;

  @IsOptional()
  @IsString()
  freedAt?: string;
}

export class SetAvailableSlotsDto {
  @IsInt()
  @Min(0)
  @Max(50)
  available!: number;
}

export class FreedBatchDto {
  /** How many slots to free/notify. Defaults to stored available count. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number;
}
